import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PayoutStatus, Prisma, WalletTransactionType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt } from '../../common/utils/crypto.util';
import { ListPayoutsQueryDto } from './dto/list-payouts-query.dto';

const WITH_OWNER = { owner: { select: { id: true, name: true, email: true } } } satisfies Prisma.PayoutRequestInclude;

// A qué estados se puede pasar desde cada estado actual. PAID y FAILED son terminales.
const VALID_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  PENDING: [PayoutStatus.PROCESSING, PayoutStatus.FAILED],
  PROCESSING: [PayoutStatus.PAID, PayoutStatus.FAILED],
  PAID: [],
  FAILED: [],
};

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async findMine(ownerId: string, query: ListPayoutsQueryDto) {
    const where: Prisma.PayoutRequestWhereInput = { ownerId, status: query.status };
    const [data, total] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.payoutRequest.count({ where }),
    ]);
    return { data, total };
  }

  async findAll(query: ListPayoutsQueryDto) {
    const where: Prisma.PayoutRequestWhereInput = { status: query.status };
    const [data, total] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where,
        include: WITH_OWNER,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.payoutRequest.count({ where }),
    ]);
    return { data: await this.withDestinations(data), total };
  }

  /** Solo para la cola de ADMIN: adjunta la cuenta de abono actual del dueño (descifrada) para poder transferir. */
  private async withDestinations<T extends { ownerId: string }>(payouts: T[]) {
    const key = this.configService.getOrThrow<string>('credentialsEncryptionKey');
    const owners = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(payouts.map((p) => p.ownerId))] } },
      select: {
        id: true,
        payoutAccountHolder: true,
        payoutBankName: true,
        payoutAccountType: true,
        payoutAccountNumberEncrypted: true,
      },
    });
    const byId = new Map(owners.map((o) => [o.id, o]));
    return payouts.map((p) => {
      const o = byId.get(p.ownerId);
      const destination =
        o?.payoutAccountNumberEncrypted && o.payoutBankName && o.payoutAccountHolder
          ? {
              holder: o.payoutAccountHolder,
              bankName: o.payoutBankName,
              accountType: o.payoutAccountType,
              accountNumber: decrypt(o.payoutAccountNumberEncrypted, key),
            }
          : null;
      return { ...p, destination };
    });
  }

  /** Transición de estado por un ADMIN. FAILED reembolsa automáticamente el wallet del owner. */
  async updateStatus(id: string, newStatus: PayoutStatus) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) {
      throw new NotFoundException('Solicitud de retiro no encontrada.');
    }
    if (!VALID_TRANSITIONS[payout.status].includes(newStatus)) {
      throw new BadRequestException(`No se puede pasar de ${payout.status} a ${newStatus}.`);
    }

    if (newStatus === PayoutStatus.FAILED) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.payoutRequest.update({ where: { id }, data: { status: newStatus } });

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: payout.ownerId } });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: payout.amount } } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: WalletTransactionType.CREDIT,
            amount: payout.amount,
            relatedRef: `Reembolso: retiro fallido (${payout.method})`,
            payoutRequestId: payout.id,
          },
        });

        return updated;
      });
    }

    return this.prisma.payoutRequest.update({
      where: { id },
      data: { status: newStatus, paidAt: newStatus === PayoutStatus.PAID ? new Date() : undefined },
    });
  }
}
