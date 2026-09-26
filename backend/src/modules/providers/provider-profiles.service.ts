import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, ProviderProfileStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { ApplyProviderProfileDto } from './dto/apply-provider-profile.dto';
import { ListProviderProfilesQueryDto } from './dto/list-provider-profiles-query.dto';

// A qué estados puede pasar cada estado actual. REJECTED es terminal; SUSPENDED se puede
// reactivar (a diferencia de PayoutStatus, aquí sí tiene sentido ir y volver).
const VALID_TRANSITIONS: Record<ProviderProfileStatus, ProviderProfileStatus[]> = {
  PENDING: [ProviderProfileStatus.APPROVED, ProviderProfileStatus.REJECTED],
  APPROVED: [ProviderProfileStatus.SUSPENDED],
  SUSPENDED: [ProviderProfileStatus.APPROVED],
  REJECTED: [],
};

@Injectable()
export class ProviderProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Ser proveedor (vender cuentas al por mayor a los vendedores) es exclusivo del ADMIN — no
   * es un rol nuevo, pero tampoco está abierto a cualquier usuario como se pensó originalmente.
   * Como el único que podría revisar/aprobar a un ADMIN es otro ADMIN, nace ya APPROVED —
   * saltarse el ciclo PENDING evita la autoaprobación absurda de "admin se aprueba a sí mismo".
   */
  async apply(user: AuthenticatedUser, dto: ApplyProviderProfileDto) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo un administrador puede tener un perfil de proveedor.');
    }
    const existing = await this.prisma.providerProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      throw new ConflictException('Ya tienes un perfil de proveedor. Revisa su estado con GET /provider-profiles/me.');
    }
    return this.prisma.providerProfile.create({
      data: {
        userId: user.id,
        businessName: dto.businessName,
        status: ProviderProfileStatus.APPROVED,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
      },
    });
  }

  async findMine(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Todavía no has solicitado ser proveedor.');
    }
    return profile;
  }

  async findAll(query: ListProviderProfilesQueryDto) {
    const where: Prisma.ProviderProfileWhereInput = { status: query.status };
    const [data, total] = await Promise.all([
      this.prisma.providerProfile.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerProfile.count({ where }),
    ]);
    return { data, total };
  }

  /** Aprueba, suspende o rechaza — solo un ADMIN. Avisa al proveedor por notificación y correo. */
  async review(id: string, newStatus: ProviderProfileStatus, adminId: string) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException('Perfil de proveedor no encontrado.');
    }
    if (!VALID_TRANSITIONS[profile.status].includes(newStatus)) {
      throw new BadRequestException(`No se puede pasar de ${profile.status} a ${newStatus}.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerProfile.update({
        where: { id },
        data: { status: newStatus, reviewedByUserId: adminId, reviewedAt: new Date() },
      });
      await this.notificationsService.create(tx, {
        userId: profile.userId,
        type: NotificationType.PROVIDER_STATUS_CHANGED,
        payload: `Tu perfil de proveedor "${profile.businessName}" ahora está: ${newStatus}.`,
      });
      return result;
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: profile.userId } });
    await this.mailService.sendNotice(
      user.email,
      'Actualización de tu perfil de proveedor',
      `Tu perfil "${profile.businessName}" ahora está: ${newStatus}.`,
    );

    return updated;
  }
}
