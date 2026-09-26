import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListWalletTransactionsQueryDto } from './dto/list-wallet-transactions-query.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getByUserId(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Este usuario no tiene wallet.');
    }
    return wallet;
  }

  async findTransactions(userId: string, query: ListWalletTransactionsQueryDto) {
    const wallet = await this.getByUserId(userId);
    const where: Prisma.WalletTransactionWhereInput = { walletId: wallet.id };

    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Débito genérico dentro de una transacción — lanza si el balance no alcanza. Lo usa,
   * por ejemplo, la compra al por mayor de un vendedor a un proveedor (paga desde su wallet,
   * sin pasarela real, mismo criterio que el resto de la app).
   */
  async debit(tx: Prisma.TransactionClient, userId: string, amount: number, relatedRef: string): Promise<void> {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (amount > Number(wallet.balance)) {
      throw new BadRequestException(`Saldo insuficiente. Tu balance actual es $${wallet.balance.toString()}.`);
    }

    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } });
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, type: WalletTransactionType.DEBIT, amount, relatedRef },
    });
  }

  /** Crédito genérico dentro de una transacción — el proveedor recibe el 100% de lo que vende, sin comisión. */
  async credit(tx: Prisma.TransactionClient, userId: string, amount: number, relatedRef: string): Promise<void> {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, type: WalletTransactionType.CREDIT, amount, relatedRef },
    });
  }
}
