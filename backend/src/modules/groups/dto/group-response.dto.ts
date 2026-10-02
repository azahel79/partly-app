import { daysBetween, minEntryDays } from '../../../common/utils/billing.util';
import { SeatMembership, seatStats } from '../../../common/utils/seats.util';
import { wholesaleCoversNextPeriod } from '../../../common/utils/wholesale-coverage.util';
import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod, CredentialReviewStatus, Group, GroupApprovalStatus, GroupStatus, Plan, Platform, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type GroupWithRelations = Group & {
  plan: Pick<Plan, 'id' | 'tierName' | 'billingPeriod'> & {
    platform: Pick<Platform, 'id' | 'name' | 'logoUrl'> & { categories: { category: { name: string } }[] };
  };
  owner: Pick<User, 'id' | 'name' | 'avatarUrl' | 'ratingAvg' | 'createdAt' | 'emailVerified' | 'profileNameVisible' | 'profileAvatarVisible'>;
  credential: { id: string } | null;
  _count?: { memberships: number };
  /** Membresías vivas (estado, renovación y fin de periodo): de aquí salen los cupos que se liberan. */
  memberships?: SeatMembership[];
  sourceProviderOrder?: { id: string; expiresAt: Date | null; renewable: boolean; credential?: { panelUrlEncrypted: string | null } | null } | null;
};

class PlanSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  tierName: string;

  @ApiProperty({ enum: BillingPeriod })
  @Expose()
  billingPeriod: BillingPeriod;

  @ApiProperty()
  @Expose()
  platform: { id: string; name: string; logoUrl: string | null; categoryName: string | null };
}

class OwnerSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ nullable: true })
  @Expose()
  avatarUrl: string | null;

  @ApiProperty()
  @Expose()
  ratingAvg: string;

  @ApiProperty({ example: '2025-01-14T00:00:00.000Z' })
  @Expose()
  memberSince: Date;

  @ApiProperty()
  @Expose()
  emailVerified: boolean;
}

@Exclude()
export class GroupResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ type: PlanSummaryDto })
  @Expose()
  plan: PlanSummaryDto;

  @ApiProperty({ type: OwnerSummaryDto })
  @Expose()
  owner: OwnerSummaryDto;

  @ApiProperty({ example: '65.00' })
  @Expose()
  pricePerSlot: string;

  @ApiProperty({ example: 3 })
  @Expose()
  availableSlots: number;

  @ApiProperty({ example: 1 })
  @Expose()
  occupiedSlots: number;

  @ApiProperty({ enum: GroupStatus, example: GroupStatus.SEARCHING_MEMBERS })
  @Expose()
  status: GroupStatus;

  @ApiProperty({ enum: GroupApprovalStatus, example: GroupApprovalStatus.APPROVED })
  @Expose()
  approvalStatus: GroupApprovalStatus;

  @ApiProperty({ nullable: true, example: 'La plataforma que describes no está permitida en el catálogo de Tequio.' })
  @Expose()
  rejectionReason: string | null;

  @ApiProperty({ nullable: true, example: '2026-09-15T10:00:00.000Z' })
  @Expose()
  reviewedAt: Date | null;

  @ApiProperty({ example: true, description: 'Si el vendedor ya subió el correo y contraseña de la cuenta compartida. Sin esto, el grupo no aparece en el marketplace aunque esté aprobado.' })
  @Expose()
  hasCredentials: boolean;

  @ApiProperty({ enum: CredentialReviewStatus, example: CredentialReviewStatus.REQUESTED })
  @Expose()
  credentialReviewStatus: CredentialReviewStatus;

  @ApiProperty({ nullable: true })
  @Expose()
  credentialsRequestedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Expose()
  credentialsSubmittedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Expose()
  credentialsReviewedAt: Date | null;

  @ApiProperty({ example: 15 })
  @Expose()
  billingDay: number;

  @ApiProperty({ nullable: true, example: '646180112345678901' })
  @Expose()
  bankAccountNumber: string | null;

  @ApiProperty({ example: '2026-10-15T00:00:00.000Z' })
  @Expose()
  nextRenewalDate: Date;

  @ApiProperty({ example: '2026-09-08T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ example: 3, description: 'Cupos ya apartados (reservados o pagando). Antes de iniciar es el avance hacia el 75%.' })
  @Expose()
  reservedSlots: number;

  @ApiProperty({ example: 1, description: 'Cupos apartados que todavía no son miembros activos: reservados esperando que inicie el grupo, o iniciados esperando pago/aprobación.' })
  @Expose()
  heldSlots: number;

  @ApiProperty({ example: 1, description: 'Cupos que de verdad se pueden tomar ahora: ofrecidos menos los apartados y los ocupados.' })
  @Expose()
  freeSlots: number;

  @ApiProperty({ example: 1, description: 'Lugares que se liberan al terminar el ciclo (miembros que no renovarán) y que otro comprador todavía puede apartar sin pagar.' })
  @Expose()
  freeingSlots: number;

  @ApiProperty({ nullable: true, example: '2026-09-28T00:00:00.000Z', description: 'Cuándo se libera el primero de esos lugares.' })
  @Expose()
  freeingDate: Date | null;

  @ApiProperty({ example: 1, description: 'Personas que ya apartaron un lugar que se libera (solo grupos iniciados).' })
  @Expose()
  nextCycleReserved: number;

  @ApiProperty({ example: true, description: 'false = el grupo ya inició y le quedan menos días de los mínimos para entrar; hay que esperar a que renueve.' })
  @Expose()
  canJoinNow: boolean;

  @ApiProperty({ nullable: true, example: 9, description: 'Días que le quedan al ciclo en curso (solo grupos ya iniciados).' })
  @Expose()
  daysUntilRenewal: number | null;

  @ApiProperty({ nullable: true, example: 15, description: 'Días mínimos que deben quedar para poder entrar a este grupo ya iniciado.' })
  @Expose()
  minEntryDays: number | null;

  @ApiProperty({ nullable: true, example: '2026-09-24T10:00:00.000Z', description: 'Cuándo inició el servicio. Null mientras el grupo sigue juntando cupos reservados.' })
  @Expose()
  startedAt: Date | null;

  @ApiProperty({ nullable: true, example: '12.00', description: '% que se queda Tequio de cada cobro a tus miembros — lo asigna un ADMIN al aprobar el grupo. Null mientras no se ha aprobado.' })
  @Expose()
  commissionPercentage: string | null;

  @ApiProperty({ enum: ['CREDENTIALS', 'INVITE_LINK'], description: 'Cómo reciben el acceso los miembros: correo y contraseña, o link de invitación.' })
  @Expose()
  accessType: 'CREDENTIALS' | 'INVITE_LINK';

  @ApiProperty({
    nullable: true,
    description: 'Cuenta de mayoreo de la que salió el grupo: cuándo vence y si se renueva o se repone. Solo la ven el vendedor y Tequio.',
  })
  @Expose()
  wholesaleAccount: { orderId: string; expiresAt: Date | null; renewable: boolean; expired: boolean; coversNextPeriod: boolean; managedByPartly: boolean } | null;

  constructor(group: GroupWithRelations) {
    this.id = group.id;
    this.plan = {
      id: group.plan.id,
      tierName: group.plan.tierName,
      billingPeriod: group.plan.billingPeriod,
      platform: {
        id: group.plan.platform.id,
        name: group.plan.platform.name,
        logoUrl: group.plan.platform.logoUrl,
        categoryName: group.plan.platform.categories[0]?.category.name ?? null,
      },
    };
    this.owner = {
      id: group.owner.id,
      name: group.owner.profileNameVisible ? group.owner.name : 'Miembro de Tequio',
      avatarUrl: group.owner.profileAvatarVisible ? group.owner.avatarUrl : null,
      ratingAvg: group.owner.ratingAvg.toString(),
      memberSince: group.owner.createdAt,
      emailVerified: group.owner.emailVerified,
    };
    this.pricePerSlot = group.pricePerSlot.toString();
    this.availableSlots = group.availableSlots;
    this.occupiedSlots = group.occupiedSlots;
    this.status = group.status;
    this.approvalStatus = group.approvalStatus;
    this.rejectionReason = group.rejectionReason;
    this.reviewedAt = group.reviewedAt;
    this.hasCredentials = group.credential !== null;
    this.credentialReviewStatus = group.credentialReviewStatus;
    this.credentialsRequestedAt = group.credentialsRequestedAt;
    this.credentialsSubmittedAt = group.credentialsSubmittedAt;
    this.credentialsReviewedAt = group.credentialsReviewedAt;
    this.billingDay = group.billingDay;
    this.bankAccountNumber = group.bankAccountNumber;
    this.nextRenewalDate = group.nextRenewalDate;
    this.createdAt = group.createdAt;
    this.commissionPercentage = group.commissionPercentage?.toString() ?? null;
    this.startedAt = group.startedAt;
    this.accessType = group.accessType;
    const stats = group.memberships ? seatStats(group.memberships, group.startedAt !== null) : null;
    this.reservedSlots = stats?.reservedSlots ?? group._count?.memberships ?? group.occupiedSlots;
    this.freeingSlots = stats?.freeingSlots ?? 0;
    this.freeingDate = stats?.freeingDate ?? null;
    this.nextCycleReserved = stats?.nextCycleReserved ?? 0;
    this.heldSlots = Math.max(0, this.reservedSlots - group.occupiedSlots);
    this.freeSlots = Math.max(0, group.availableSlots - this.reservedSlots);
    const min = minEntryDays(group.plan.billingPeriod);
    this.daysUntilRenewal = group.startedAt ? daysBetween(new Date(), group.nextRenewalDate) : null;
    this.minEntryDays = group.startedAt ? min : null;
    this.canJoinNow = group.startedAt ? (this.daysUntilRenewal ?? 0) >= min : true;
    const account = group.sourceProviderOrder;
    this.wholesaleAccount = account
      ? {
          orderId: account.id,
          expiresAt: account.expiresAt,
          renewable: account.renewable,
          expired: !!account.expiresAt && account.expiresAt.getTime() < Date.now(),
          coversNextPeriod: wholesaleCoversNextPeriod(account.expiresAt, group.nextRenewalDate, group.plan.billingPeriod),
          // Entregada con credenciales: la contraseña la cambia Tequio desde su tienda (por panel la maneja el vendedor).
          managedByPartly: !!account.credential && !account.credential.panelUrlEncrypted,
        }
      : null;
  }

  /**
   * La cuenta bancaria del vendedor solo la ven él, Tequio y quien le tiene que pagar; la comisión pactada, solo
   * el vendedor y Tequio. Cualquier otra vista (marketplace, visitantes) recibe esos campos vacíos.
   */
  restrictTo(viewer: { canSeeBankAccount: boolean; canSeeCommission: boolean }): this {
    if (!viewer.canSeeBankAccount) this.bankAccountNumber = null;
    if (!viewer.canSeeCommission) {
      this.commissionPercentage = null;
      this.wholesaleAccount = null;
    }
    return this;
  }
}
