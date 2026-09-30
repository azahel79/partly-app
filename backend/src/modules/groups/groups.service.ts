import { supportsInviteLink } from '../../common/utils/access-type.util';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BillingPeriod, CredentialReviewStatus, GroupApprovalStatus, GroupStatus, MembershipStatus, NotificationType, PaymentStatus, Prisma, ProviderOrderStatus, Role, GroupAccessType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addBillingPeriod, computeJoinPricing, minEntryDays, nextOccurrenceOfDay, perPeriodLabel } from '../../common/utils/billing.util';
import { decrypt, encrypt } from '../../common/utils/crypto.util';
import { seatStats } from '../../common/utils/seats.util';
import { RenewalStatus } from './dto/membership-response.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DEFAULT_COMMISSION_PCT } from '../commissions/commissions.constants';
import { CommissionsService } from '../commissions/commissions.service';
import { CommissionRatesService } from '../commissions/commission-rates.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ListGroupsQueryDto } from './dto/list-groups-query.dto';
import { ListPendingGroupsQueryDto } from './dto/list-pending-groups-query.dto';
import { ListAdminGroupsQueryDto } from './dto/list-admin-groups-query.dto';
import { AdminGroupDetailResponseDto } from './dto/admin-group-detail-response.dto';
import { UpsertCredentialDto } from './dto/upsert-credential.dto';
import { CredentialResponseDto } from './dto/credential-response.dto';
import { UpsertGroupProfileDto } from './dto/upsert-group-profile.dto';
import { GroupProfileResponseDto } from './dto/group-profile-response.dto';
import { CreateGroupFromProviderOrderDto } from '../providers/dto/create-group-from-provider-order.dto';
import { memberLeftContext, memberLeftNotice, wholesaleRotationNotice } from '../../common/utils/member-left.util';

const WITH_RELATIONS = {
  plan: {
    include: {
      platform: {
        select: { id: true, name: true, logoUrl: true, categories: { take: 1, select: { category: { select: { name: true } } } } },
      },
    },
  },
  owner: { select: { id: true, name: true, avatarUrl: true, ratingAvg: true, createdAt: true, emailVerified: true, profileNameVisible: true, profileAvatarVisible: true } },
  // Solo para derivar hasCredentials (GroupResponseDto) — nunca se exponen los valores cifrados aquí.
  credential: { select: { id: true } },
  // Cuenta de mayoreo de la que salió el grupo (si aplica): su vencimiento se le muestra al vendedor.
  sourceProviderOrder: { select: { id: true, expiresAt: true, renewable: true, credential: { select: { panelUrlEncrypted: true } } } },
  // Cupos apartados (reservados o pagando), para mostrar el avance antes de iniciar.
  _count: { select: { memberships: { where: { status: { in: ['RESERVED', 'ACTIVE', 'PENDING_PAYMENT', 'SUSPENDED'] } } } } },
  // Para saber cuántos lugares se liberan al terminar el ciclo (miembros que no renovarán) y cuántos ya los apartaron.
  memberships: { where: { status: { in: ['RESERVED', 'ACTIVE', 'PENDING_PAYMENT', 'SUSPENDED'] } }, select: { status: true, autoRenew: true, currentPeriodEnd: true } },
} satisfies Prisma.GroupInclude;

// Estados que mantienen abierta la relación con el grupo. PENDING_PAYMENT evita que el
// mismo usuario vuelva a unirse, pero todavía no cuenta como un miembro confirmado.
const LIVE_MEMBERSHIP_STATUSES: MembershipStatus[] = [
  MembershipStatus.RESERVED,
  MembershipStatus.ACTIVE,
  MembershipStatus.PENDING_PAYMENT,
  MembershipStatus.SUSPENDED,
];

// Solo quien ya pagó ocupa un cupo visible. SUSPENDED conserva el lugar durante el periodo
// de gracia de una renovación; el primer pago PENDING_PAYMENT aún no lo ocupa.
const OCCUPYING_MEMBERSHIP_STATUSES: MembershipStatus[] = [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED];

// Estados en los que un grupo sigue aceptando miembros: antes de iniciar (reservando),
// listo para iniciar, y ya iniciado con cupos libres.
const OPEN_GROUP_STATUSES: GroupStatus[] = [GroupStatus.SEARCHING_MEMBERS, GroupStatus.READY_TO_START, GroupStatus.ACTIVE];

// El vendedor puede arrancar el grupo sin llenarlo: basta con reservar este % de los cupos.
const START_THRESHOLD_PCT = 75;

// Si el grupo sube y baja del umbral (alguien se sale y otro entra) no se le repite al vendedor el mismo
// aviso antes de que pase este tiempo desde el anterior.
const START_ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

// Días que el grupo puede estar listo sin que el vendedor lo inicie antes de cada recordatorio
// (el primero a los 2 días, el segundo a los 5 y el último a los 10; después ya no se insiste).
const START_REMINDER_AFTER_DAYS = [2, 5, 10];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cupos reservados que se necesitan para poder iniciar (redondeado hacia arriba). */
export function slotsRequiredToStart(availableSlots: number): number {
  return Math.max(1, Math.ceil((availableSlots * START_THRESHOLD_PCT) / 100));
}


/** Periodos que solo ofrecen vendedores con reputación (el comprador paga mucho de una vez). */
const LONG_PERIODS: BillingPeriod[] = [BillingPeriod.SEMIANNUAL, BillingPeriod.ANNUAL];

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly commissionsService: CommissionsService,
    private readonly commissionRatesService: CommissionRatesService,
  ) {}

  async create(ownerId: string, dto: CreateGroupDto) {
    await this.commissionsService.assertNotRestricted(ownerId, 'crear grupos nuevos');
    if (LONG_PERIODS.includes(dto.billingPeriod as BillingPeriod) && !(await this.commissionRatesService.canOfferLongPeriods(ownerId))) {
      throw new ForbiddenException('Los grupos de 6 meses o anuales son para vendedores con reputación (30 pagos validados, calificación de 4.5 o más y sin comisiones vencidas). Mientras tanto puedes ofrecer 1, 2 o 3 meses.');
    }
    const accessType = dto.accessType ?? GroupAccessType.CREDENTIALS;
    const inviteNotAllowed = (name: string) => accessType === GroupAccessType.INVITE_LINK && !supportsInviteLink(name);
    const INVITE_ONLY_FOR = 'El acceso con link de invitación solo está disponible para YouTube, Spotify y Canva.';
    // Con un plan personalizado se valida antes de guardarlo: si no, un rechazo dejaría un plan huérfano.
    if (!dto.planId) {
      if (inviteNotAllowed(dto.platformName ?? '')) throw new BadRequestException(INVITE_ONLY_FOR);
      if (dto.maxSlots && dto.availableSlots > dto.maxSlots) {
        throw new BadRequestException(`Este plan permite ${dto.maxSlots} cupos en total; no puedes ofrecer más de esos.`);
      }
    }
    const { planId, maxSlots, billingPeriod, platformName } = await this.resolvePlanId(dto);
    if (inviteNotAllowed(platformName)) {
      throw new BadRequestException(INVITE_ONLY_FOR);
    }

    // availableSlots son los que se ofrecen a OTROS. No forzamos que el owner se reserve un
    // cupo: hay vendedores que solo administran (reventa al mayoreo) y ofrecen el plan
    // completo, y otros que sí lo usan personalmente y reservan uno — es su decisión.
    if (dto.availableSlots > maxSlots) {
      throw new BadRequestException(`Este plan permite ${maxSlots} cupos en total; no puedes ofrecer más de esos.`);
    }

    const commissionPercentage = await this.commissionsService.rateFor(ownerId);
    const group = await this.prisma.group.create({
      data: {
        planId,
        ownerId,
        // Comisión fija de Partly (9%, o la reducida del vendedor): la conoce desde que crea el grupo.
        commissionPercentage,
        pricePerSlot: dto.pricePerSlot,
        availableSlots: dto.availableSlots,
        // Provisionales: el día de cobro y la fecha de renovación reales se fijan cuando el
        // vendedor inicia el grupo (ver startGroup), porque hasta ese momento no se sabe
        // cuándo arranca el servicio. Nadie paga nada antes de iniciar.
        billingDay: 1,
        nextRenewalDate: addBillingPeriod(new Date(), billingPeriod),
        bankAccountNumber: dto.bankAccountNumber,
        accessType,
        // Todo grupo nuevo nace PENDING: no aparece en el marketplace público (findMany lo
        // filtra) hasta que un ADMIN lo revise vía PUT /groups/:id/review.
        approvalStatus: GroupApprovalStatus.PENDING,
      },
      include: WITH_RELATIONS,
    });
    await this.notifyNewGroupInReview(group);
    return group;
  }

  /**
   * Primer paso del grupo nuevo: al vendedor se le avisa qué sigue (mandar las credenciales para que el
   * equipo pueda revisar qué quiere vender) y a los admins que hay un grupo esperando su revisión. Un fallo
   * aquí no debe tirar la creación del grupo.
   */
  private async notifyNewGroupInReview(group: { id: string; ownerId: string; owner: { name: string }; plan: { tierName: string; platform: { name: string } } }): Promise<void> {
    const platform = group.plan.platform.name;
    try {
      await this.notificationsService.create(this.prisma, {
        userId: group.ownerId,
        type: NotificationType.SYSTEM,
        email: false,
        payload: `Tu grupo de ${platform} quedó en revisión de Partly. En cuanto lo revisemos te pediremos las credenciales de la cuenta para comprobar el acceso; te avisaremos por aquí y por correo.`,
        groupId: group.id,
      });
      const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN, deletedAt: null, id: { not: group.ownerId } }, select: { id: true } });
      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.create(this.prisma, {
            userId: admin.id,
            type: NotificationType.SYSTEM,
            email: { subject: 'Nuevo grupo por revisar' },
            payload: `${group.owner.name} creó un grupo de ${platform} (${group.plan.tierName}). Está pendiente de tu revisión.`,
            groupId: group.id,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(`No se pudieron enviar los avisos del grupo nuevo ${group.id}: ${String(error)}`);
    }
  }

  /**
   * Crea el grupo de un vendedor a partir de una compra de mayoreo ya entregada
   * (ProviderOrder FULFILLED): reutiliza el plan del catálogo que ya traía el listing y
   * copia la credencial ya cifrada del proveedor directo a Credential (mismo algoritmo y
   * llave que Group/Credential, así que no hace falta descifrar y volver a cifrar). Con
   * esto el vendedor no tiene que volver a escribir usuario/contraseña a mano. El grupo
   * sigue naciendo PENDING como cualquier otro — un ADMIN todavía revisa antes de que
   * aparezca en el marketplace — pero como la credencial ya viene cargada, se marca
   * directamente como SUBMITTED para que quede lista en la cola de revisión.
   */
  async createFromProviderOrder(ownerId: string, orderId: string, dto: CreateGroupFromProviderOrderDto) {
    const order = await this.prisma.providerOrder.findUnique({
      where: { id: orderId },
      include: { listing: { select: { planId: true, plan: { select: { maxSlots: true, active: true } } } }, credential: true },
    });
    if (!order) {
      throw new NotFoundException('Compra no encontrada.');
    }
    if (order.buyerUserId !== ownerId) {
      throw new ForbiddenException('Esta compra no te pertenece.');
    }
    if (order.status !== ProviderOrderStatus.FULFILLED || !order.credential) {
      throw new BadRequestException('Esta compra todavía no tiene credenciales entregadas.');
    }
    if (order.resultingGroupId) {
      throw new ConflictException('Ya creaste un grupo con esta cuenta.');
    }
    if (!order.listing.plan.active) {
      throw new BadRequestException('El plan de esta cuenta ya no está activo.');
    }
    const maxSlots = order.listing.plan.maxSlots;
    const byPanel = !!order.credential.panelUrlEncrypted || !order.credential.usernameEncrypted;
    if (dto.availableSlots > maxSlots) {
      throw new BadRequestException(`Este plan permite ${maxSlots} cupos en total; no puedes ofrecer más de esos.`);
    }

    const groupId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          planId: order.listing.planId,
          ownerId,
          commissionPercentage: await this.commissionsService.rateFor(ownerId, tx),
          pricePerSlot: dto.pricePerSlot,
          availableSlots: dto.availableSlots,
          billingDay: 1,
          nextRenewalDate: addBillingPeriod(new Date(), BillingPeriod.MONTHLY),
          bankAccountNumber: dto.bankAccountNumber,
          approvalStatus: GroupApprovalStatus.PENDING,
          // Entregada con credenciales: se copian y quedan listas para revisión. Por panel: el vendedor da el acceso,
          // así que Partly le pide las credenciales como en cualquier grupo.
          credentialReviewStatus: byPanel ? CredentialReviewStatus.REQUESTED : CredentialReviewStatus.SUBMITTED,
          credentialsRequestedAt: byPanel ? new Date() : null,
          credentialsSubmittedAt: byPanel ? null : new Date(),
        },
      });

      if (!byPanel) {
        await tx.credential.create({
          data: {
            groupId: created.id,
            usernameEncrypted: order.credential!.usernameEncrypted,
            passwordEncrypted: order.credential!.passwordEncrypted,
            notesEncrypted: order.credential!.notesEncrypted,
          },
        });
        await tx.credentialHistory.create({
          data: { groupId: created.id, changedByUserId: ownerId, changeReason: 'Importado automáticamente desde una compra de mayoreo' },
        });
      }
      await tx.groupProfile.createMany({
        data: Array.from({ length: dto.availableSlots }, (_, i) => ({ groupId: created.id, label: `Perfil ${i + 1}` })),
      });
      await tx.providerOrder.update({ where: { id: orderId }, data: { resultingGroupId: created.id } });

      const admins = await tx.user.findMany({ where: { role: Role.ADMIN }, select: { id: true } });
      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.create(tx, {
            userId: admin.id,
            type: NotificationType.SYSTEM,
            email: { subject: 'Nuevo grupo de mayoreo por revisar' },
            payload: 'Un vendedor creó un grupo a partir de una compra de mayoreo, con credenciales ya cargadas. Está listo para tu revisión.',
            groupId: created.id,
          }),
        ),
      );

      return created.id;
    });

    return this.prisma.group.findUniqueOrThrow({ where: { id: groupId }, include: WITH_RELATIONS });
  }

  /**
   * Si mandan planId, usa el plan del catálogo (curado por ADMIN). Si no, el usuario está
   * declarando su propia plataforma "a mano" — creamos (o reusamos, por nombre) un Platform
   * y un Plan propios para esa plataforma, sin pasar por el catálogo administrado. Esto le da
   * al vendedor libertad total para compartir cualquier plataforma, a costa de perder la
   * verificación de ADMIN sobre ese plan específico (el resto de las protecciones — pago en
   * custodia, credenciales cifradas — siguen aplicando igual).
   */
  private async resolvePlanId(dto: CreateGroupDto): Promise<{ planId: string; maxSlots: number; billingPeriod: BillingPeriod; platformName: string }> {
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId }, include: { platform: { select: { name: true } } } });
      if (!plan) {
        throw new NotFoundException('El plan indicado no existe.');
      }
      if (!plan.active) {
        throw new BadRequestException('Este plan no está activo.');
      }
      return { planId: plan.id, maxSlots: plan.maxSlots, billingPeriod: plan.billingPeriod, platformName: plan.platform.name };
    }

    if (!dto.platformName || !dto.maxSlots) {
      throw new BadRequestException('Indica la plataforma y el máximo de cupos de tu plan, o elige uno del catálogo.');
    }

    let platform = await this.prisma.platform.findFirst({
      where: { name: { equals: dto.platformName.trim(), mode: 'insensitive' } },
    });
    if (!platform) {
      platform = await this.prisma.platform.create({ data: { name: dto.platformName.trim(), active: true } });
    }

    const plan = await this.prisma.plan.create({
      data: {
        platformId: platform.id,
        tierName: dto.tierName?.trim() || 'Personalizado',
        officialPrice: dto.officialPrice ?? dto.pricePerSlot * (dto.availableSlots + 1),
        maxSlots: dto.maxSlots,
        commissionPercentage: DEFAULT_COMMISSION_PCT,
        billingPeriod: dto.billingPeriod ?? BillingPeriod.MONTHLY,
        active: true,
      },
    });
    return { planId: plan.id, maxSlots: plan.maxSlots, billingPeriod: plan.billingPeriod, platformName: platform.name };
  }

  async findMany(query: ListGroupsQueryDto, viewerUserId: string) {
    // Un vendedor con la comisión vencida no recibe miembros: sus grupos salen del marketplace
    // hasta que pague (los miembros que ya tiene no se tocan).
    const restrictedSellers = await this.commissionsService.restrictedSellerIds();
    // Cupos realmente libres = ofrecidos menos los apartados (reservados, pagando o activos). Un grupo con
    // todos los cupos apartados no admite a nadie más, aunque todavía no haya iniciado.
    // Ya iniciado, quien apartó un lugar que se libera no ocupa cupo todavía: solo cuentan reservas los grupos sin iniciar.
    const withFreeSpots = query.withSpots
      ? (
          await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT g.id FROM groups g
            WHERE g.approval_status::text = 'APPROVED'
              AND g.status::text IN ('SEARCHING_MEMBERS', 'READY_TO_START', 'ACTIVE')
              AND g.available_slots > (
                SELECT COUNT(*) FROM group_memberships m
                WHERE m.group_id = g.id AND m.status::text IN ('RESERVED', 'ACTIVE', 'PENDING_PAYMENT', 'SUSPENDED')
                  AND (g.started_at IS NULL OR m.status::text <> 'RESERVED')
              )`)
        ).map((row) => row.id)
      : null;
    // Grupos ya iniciados (aunque estén llenos) con un lugar que se libera al terminar el ciclo y que nadie ha apartado.
    const freeingIds = (
      await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT g.id FROM groups g
        WHERE g.approval_status::text = 'APPROVED' AND g.started_at IS NOT NULL
          AND g.status::text IN ('ACTIVE', 'FULL')
          AND (SELECT COUNT(*) FROM group_memberships m WHERE m.group_id = g.id AND m.status::text = 'ACTIVE' AND m.auto_renew = false)
            > (SELECT COUNT(*) FROM group_memberships m WHERE m.group_id = g.id AND m.status::text = 'RESERVED')`)
    ).map((row) => row.id);
    const where: Prisma.GroupWhereInput = {
      AND: [
        query.status ? { status: query.status } : { OR: [{ status: { in: OPEN_GROUP_STATUSES } }, { id: { in: freeingIds } }] },
        ...(withFreeSpots ? [{ id: { in: [...withFreeSpots, ...freeingIds] } }] : []),
        ...(query.stage === 'freeing' ? [{ id: { in: freeingIds } }] : []),
      ],
      ...(query.stage === 'forming' ? { startedAt: null } : {}),
      ...(query.stage === 'running'
        ? {
            startedAt: { not: null },
            // solo los que hoy admiten entrada: les quedan al menos los días mínimos de su ciclo
            OR: Object.values(BillingPeriod).map((period) => ({
              plan: { billingPeriod: period },
              nextRenewalDate: { gte: new Date(Date.now() + minEntryDays(period) * 86_400_000) },
            })),
          }
        : {}),
      // El marketplace público solo muestra grupos ya revisados por un ADMIN — uno PENDING
      // o REJECTED no debe ser descubrible buscando/explorando (findMine/findJoined sí lo
      // siguen mostrando al dueño o a quien ya se unió). Tampoco alcanza con estar
      // aprobado: si el vendedor todavía no sube las credenciales de la cuenta, nadie
      // podría usarla aunque pagara, así que también debe existir el Credential.
      approvalStatus: GroupApprovalStatus.APPROVED,
      credential: { isNot: null },
      planId: query.planId,
      ownerId: query.ownerId,
      // El marketplace es la vista del comprador. El vendedor administra sus publicaciones
      // exclusivamente desde "Mis grupos", por eso nunca debe encontrarse a sí mismo aquí.
      // Tampoco se muestran los grupos cuya cuenta de mayoreo ya venció y no se ha renovado.
      NOT: [
        { ownerId: viewerUserId },
        ...(restrictedSellers.length > 0 ? [{ ownerId: { in: restrictedSellers } }] : []),
        { sourceProviderOrder: { is: { expiresAt: { lt: new Date() } } } },
      ],
      ...(query.platformId || query.categoryId
        ? {
            plan: {
              ...(query.platformId ? { platformId: query.platformId } : {}),
              ...(query.categoryId ? { platform: { categories: { some: { categoryId: query.categoryId } } } } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        include: WITH_RELATIONS,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.group.count({ where }),
    ]);

    return { data, total };
  }

  /** Conteo público del marketplace (misma regla de visibilidad que findMany, sin viewer) — para la landing. */
  async countPublicActive(): Promise<number> {
    const restrictedSellers = await this.commissionsService.restrictedSellerIds();
    return this.prisma.group.count({
      where: {
        ownerId: { notIn: restrictedSellers },
        status: { in: OPEN_GROUP_STATUSES },
        approvalStatus: GroupApprovalStatus.APPROVED,
        credential: { isNot: null },
      },
    });
  }

  async findMine(ownerId: string) {
    return this.prisma.group.findMany({
      where: { ownerId },
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Suscripciones realmente activas del comprador. Un primer pago pendiente no aparece aquí. */
  async findJoined(userId: string) {
    return this.prisma.group.findMany({
      where: { memberships: { some: { userId, status: MembershipStatus.ACTIVE } } },
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lugares que el comprador apartó o está pagando (todavía no son membresías activas), con lo que necesita
   * saber de cada uno: si espera a que el grupo inicie, si es un lugar que se libera o hasta cuándo pagar.
   */
  async findReserved(userId: string) {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { userId, status: { in: [MembershipStatus.RESERVED, MembershipStatus.PENDING_PAYMENT] } },
      include: {
        group: { include: WITH_RELATIONS },
        payments: { where: { status: PaymentStatus.PENDING }, select: { amount: true, graceUntil: true, receiptUploadedAt: true }, orderBy: { graceUntil: 'desc' }, take: 1 },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => {
      const payment = m.payments[0] ?? null;
      const stats = seatStats(m.group.memberships, m.group.startedAt !== null);
      return {
        group: m.group,
        membership: {
          status: m.status,
          joinedAt: m.joinedAt,
          // Ya iniciado y RESERVED = apartó un lugar que se libera al terminar el ciclo.
          waitingForSeat: m.status === MembershipStatus.RESERVED && m.group.startedAt !== null,
          freeingDate: m.status === MembershipStatus.RESERVED && m.group.startedAt !== null ? stats.freeingDate : null,
          payment: payment ? { amount: payment.amount.toString(), graceUntil: payment.graceUntil, receiptUploadedAt: payment.receiptUploadedAt } : null,
        },
      };
    });
  }

  /**
   * Si el comprador ya tiene un lugar (apartado, pagando o activo) en OTRO grupo de la misma plataforma.
   * Sirve para avisarle antes de apartar uno más; `canSwitch` dice si puede cambiarse soltando ese lugar
   * (solo si todavía no lo ha pagado ni subió comprobante).
   */
  async findSimilarMembership(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { plan: { select: { platformId: true } } } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    const other = await this.prisma.groupMembership.findFirst({
      where: {
        userId,
        groupId: { not: groupId },
        status: { in: LIVE_MEMBERSHIP_STATUSES },
        group: { plan: { platformId: group.plan.platformId } },
      },
      include: {
        group: { select: { id: true, pricePerSlot: true, plan: { select: { tierName: true, billingPeriod: true, platform: { select: { name: true } } } } } },
        payments: { where: { status: PaymentStatus.PENDING, receiptPath: { not: null } }, select: { id: true }, take: 1 },
      },
      orderBy: { joinedAt: 'desc' },
    });
    if (!other) {
      return null;
    }
    const unpaid = other.status === MembershipStatus.RESERVED || other.status === MembershipStatus.PENDING_PAYMENT;
    return {
      groupId: other.group.id,
      platformName: other.group.plan.platform.name,
      tierName: other.group.plan.tierName,
      pricePerSlot: other.group.pricePerSlot.toString(),
      billingPeriod: other.group.plan.billingPeriod,
      status: other.status,
      canSwitch: unpaid && other.payments.length === 0,
    };
  }

  /** Cola de grupos esperando revisión — solo ADMIN. */
  async findPendingApproval(query: ListPendingGroupsQueryDto) {
    const where: Prisma.GroupWhereInput = { approvalStatus: GroupApprovalStatus.PENDING };
    const [data, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        include: WITH_RELATIONS,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.group.count({ where }),
    ]);
    return { data, total };
  }

  /** Vista completa para ADMIN: los tres estados de aprobación, no solo la cola pendiente. */
  async findAllForAdmin(query: ListAdminGroupsQueryDto) {
    const where: Prisma.GroupWhereInput = query.status ? { approvalStatus: query.status } : {};
    const [data, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        include: WITH_RELATIONS,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.group.count({ where }),
    ]);
    return { data, total };
  }

  /** Detalle completo para el panel de staff — solo ADMIN. Incluye notas internas, si ya tiene credenciales, y ventas del vendedor. */
  async findAdminDetail(id: string): Promise<AdminGroupDetailResponseDto> {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: WITH_RELATIONS,
    });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    const sellerSalesCount = await this.prisma.payment.count({
      where: { status: PaymentStatus.PAID, membership: { group: { ownerId: group.ownerId } } },
    });
    return new AdminGroupDetailResponseDto(group, sellerSalesCount);
  }

  /** Nota privada del admin sobre el grupo — nunca se expone fuera del panel de staff. */
  async updateAdminNotes(id: string, notes: string) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    return this.prisma.group.update({ where: { id }, data: { internalNotes: notes } });
  }

  /** Mensaje directo del admin al vendedor — se le entrega como notificación real. */
  async sendMessageToSeller(id: string, message: string): Promise<void> {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    await this.notificationsService.create(this.prisma, {
      userId: group.ownerId,
      type: NotificationType.SYSTEM,
      email: { subject: 'Mensaje de Partly sobre tu grupo' },
      emailImmediate: true,
      payload: message,
      groupId: group.id,
    });
  }

  /** Solicita formalmente las credenciales al vendedor y mantiene el grupo pendiente. */
  async requestCredentials(id: string): Promise<void> {
    const group = await this.prisma.group.findUnique({ where: { id }, include: { plan: { include: { platform: true } } } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.approvalStatus !== GroupApprovalStatus.PENDING) {
      throw new BadRequestException('Solo puedes solicitar credenciales mientras el grupo está pendiente de revisión.');
    }
    // La comisión es fija: si un grupo viejo no la tiene guardada, toma la del vendedor.
    const commissionPercentage = group.commissionPercentage ?? new Prisma.Decimal(await this.commissionsService.rateFor(group.ownerId));

    await this.prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id },
        data: {
          commissionPercentage,
          credentialReviewStatus: CredentialReviewStatus.REQUESTED,
          credentialsRequestedAt: new Date(),
          credentialsSubmittedAt: null,
        },
      });
      await this.notificationsService.create(tx, {
        userId: group.ownerId,
        type: NotificationType.SYSTEM,
        email: { subject: 'Partly te pide las credenciales de tu grupo' },
        payload:
          `El equipo de Partly solicita las credenciales de ${group.plan.platform.name}. Entra a tu grupo y usa el botón "Enviar credenciales al administrador" para continuar con la revisión.` +
          ` ${this.commissionSummary({ ...group, commissionPercentage })}`,
        groupId: group.id,
      });
    });
  }

  /** Texto para el vendedor: comisión propuesta y cuánto recibiría por periodo con el grupo lleno. */
  private commissionSummary(group: { commissionPercentage: Prisma.Decimal | null; pricePerSlot: Prisma.Decimal; availableSlots: number; plan: { billingPeriod: BillingPeriod } }): string {
    const pct = Number(group.commissionPercentage);
    const gross = Number(group.pricePerSlot) * group.availableSlots;
    return `Comisión de Partly para tu grupo: ${pct}%. Con el grupo lleno (${group.availableSlots} × $${Number(group.pricePerSlot).toFixed(2)}) recibirías $${(gross * (1 - pct / 100)).toFixed(2)} ${perPeriodLabel(group.plan.billingPeriod)}; si quieres, ajusta tu precio.`;
  }

  /** Aprueba o rechaza un grupo nuevo — solo ADMIN. Avisa al dueño por notificación. */
  async reviewApproval(
    id: string,
    newStatus: GroupApprovalStatus,
    adminId: string,
    reason?: string,
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: { plan: { include: { platform: true } }, credential: { select: { id: true } } },
    });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.approvalStatus !== GroupApprovalStatus.PENDING) {
      const statusLabel =
        group.approvalStatus === GroupApprovalStatus.APPROVED ? 'aprobado' : 'rechazado';
      throw new BadRequestException(`Este grupo ya está ${statusLabel}; no hay nada pendiente por revisar.`);
    }
    if (newStatus === GroupApprovalStatus.PENDING) {
      throw new BadRequestException('No puedes regresar un grupo al estado pendiente.');
    }
    if (newStatus === GroupApprovalStatus.REJECTED && !reason?.trim()) {
      throw new BadRequestException('Debes explicarle al vendedor por qué se rechaza su grupo.');
    }
    if (
      newStatus === GroupApprovalStatus.APPROVED &&
      (!group.credential || group.credentialReviewStatus !== CredentialReviewStatus.SUBMITTED)
    ) {
      throw new BadRequestException('Antes de aprobar, solicita las credenciales y espera a que el vendedor las envíe para revisión.');
    }
    // Comisión fija: la que ya tiene el grupo o, si es un grupo viejo sin ella, la del vendedor.
    const commissionPercentage = group.commissionPercentage !== null ? Number(group.commissionPercentage) : await this.commissionsService.rateFor(group.ownerId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.group.update({
        where: { id },
        data: {
          approvalStatus: newStatus,
          reviewedByUserId: adminId,
          reviewedAt: new Date(),
          rejectionReason: newStatus === GroupApprovalStatus.REJECTED ? reason!.trim() : null,
          credentialReviewStatus:
            newStatus === GroupApprovalStatus.APPROVED ? CredentialReviewStatus.APPROVED : group.credentialReviewStatus,
          credentialsReviewedAt: newStatus === GroupApprovalStatus.APPROVED ? new Date() : null,
          commissionPercentage,
        },
        include: WITH_RELATIONS,
      });
      await this.notificationsService.create(tx, {
        userId: group.ownerId,
        type: NotificationType.SYSTEM,
        email: { subject: newStatus === GroupApprovalStatus.APPROVED ? '¡Tu grupo fue aprobado!' : 'Tu grupo no fue aprobado' },
        payload:
          newStatus === GroupApprovalStatus.APPROVED
            ? `Tu grupo de ${group.plan.platform.name} fue aprobado con una comisión de Partly del ${commissionPercentage}%. Con el grupo lleno (${group.availableSlots} × $${Number(group.pricePerSlot).toFixed(2)}) recibirás $${(Number(group.pricePerSlot) * group.availableSlots * (1 - commissionPercentage / 100)).toFixed(2)} ${perPeriodLabel(group.plan.billingPeriod)}, y ya puede aparecer en el marketplace.`
            : `Tu grupo de ${group.plan.platform.name} fue rechazado: ${reason!.trim()}`,
        groupId: group.id,
      });
      return updated;
    });
  }

  async findById(id: string) {
    const group = await this.prisma.group.findUnique({ where: { id }, include: WITH_RELATIONS });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    return group;
  }

  /**
   * Detalle de un grupo según quién mira. Un grupo sin aprobar (en revisión o rechazado) no es público: solo lo
   * ven su vendedor, quien ya tiene relación con él y un ADMIN. La cuenta bancaria se muestra a quien le tiene
   * que pagar al vendedor (pago pendiente, activo o suspendido) y la comisión, solo al vendedor y a Partly.
   */
  async findForViewer(id: string, viewer?: AuthenticatedUser) {
    const group = await this.findById(id);
    const isOwner = viewer?.id === group.ownerId;
    const isAdmin = viewer?.role === Role.ADMIN;
    const membership = viewer && !isOwner
      ? await this.prisma.groupMembership.findFirst({
          where: { groupId: id, userId: viewer.id, status: { in: LIVE_MEMBERSHIP_STATUSES } },
          select: { status: true },
        })
      : null;
    if (group.approvalStatus !== GroupApprovalStatus.APPROVED && !isOwner && !isAdmin && !membership) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    const paysSeller = !!membership && membership.status !== MembershipStatus.RESERVED;
    return {
      group,
      viewer: { canSeeBankAccount: isOwner || isAdmin || paysSeller, canSeeCommission: isOwner || isAdmin },
    };
  }

  async update(id: string, dto: UpdateGroupDto, requester: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({ where: { id }, include: { plan: true } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo el owner de este grupo (o un ADMIN) puede editarlo.');
    }
    if (dto.status === GroupStatus.FULL || dto.status === GroupStatus.READY_TO_START || dto.status === GroupStatus.ACTIVE) {
      throw new BadRequestException('Ese estado lo calcula la app según los cupos y el inicio del grupo, no se puede asignar a mano.');
    }
    if (dto.status === GroupStatus.SEARCHING_MEMBERS && group.startedAt) {
      throw new BadRequestException('Este grupo ya inició; para reabrirlo usa "Reactivar grupo".');
    }

    const data: Prisma.GroupUpdateInput = {
      pricePerSlot: dto.pricePerSlot,
      // Reactivar un grupo pausado lo devuelve a ACTIVE si ya había iniciado su servicio.
      status: dto.status === GroupStatus.SEARCHING_MEMBERS && group.startedAt ? GroupStatus.ACTIVE : dto.status,
      bankAccountNumber: dto.bankAccountNumber,
    };

    if (dto.availableSlots !== undefined) {
      if (dto.availableSlots < group.occupiedSlots) {
        throw new BadRequestException(`No puedes bajar los cupos por debajo de los ${group.occupiedSlots} ya ocupados.`);
      }
      if (dto.availableSlots > group.plan.maxSlots) {
        throw new BadRequestException(`Este plan permite ${group.plan.maxSlots} cupos en total; no puedes ofrecer más de esos.`);
      }
      data.availableSlots = dto.availableSlots;
      // Si estaba FULL y ahora hay cupo de nuevo, reabre solo — a menos que el caller ya haya mandado un status explícito.
      if (dto.status === undefined && group.status === GroupStatus.FULL && dto.availableSlots > group.occupiedSlots) {
        data.status = group.startedAt ? GroupStatus.ACTIVE : GroupStatus.SEARCHING_MEMBERS;
      }
    }

    if (dto.billingDay !== undefined) {
      data.billingDay = dto.billingDay;
      data.nextRenewalDate = nextOccurrenceOfDay(dto.billingDay);
    }

    return this.prisma.group.update({ where: { id }, data, include: WITH_RELATIONS });
  }

  async join(groupId: string, userId: string, options: { switchFromGroupId?: string } = {}) {
    return this.prisma.$transaction(async (tx) => {
      // "Cambiarme a este": suelta primero su lugar sin pagar en el otro grupo de la misma plataforma. Si
      // entrar a este falla, la transacción entera se deshace y conserva su lugar anterior.
      if (options.switchFromGroupId) {
        if (options.switchFromGroupId === groupId) {
          throw new BadRequestException('Elige un grupo distinto al que quieres dejar.');
        }
        await this.leaveInTx(tx, options.switchFromGroupId, userId, { onlyUnpaid: true });
      }
      const group = await tx.group.findUnique({ where: { id: groupId }, include: { credential: { select: { id: true } }, plan: { select: { billingPeriod: true, platform: { select: { name: true } } } }, sourceProviderOrder: { select: { expiresAt: true } } } });
      if (!group) {
        throw new NotFoundException('Grupo no encontrado.');
      }
      if (group.ownerId === userId) {
        throw new BadRequestException('No puedes unirte a tu propio grupo.');
      }
      // Un grupo iniciado y lleno todavía puede recibir reservas de los lugares que se liberan al terminar el ciclo.
      if (!OPEN_GROUP_STATUSES.includes(group.status) && !(group.startedAt && group.status === GroupStatus.FULL)) {
        throw new BadRequestException('Este grupo no está buscando miembros ahora mismo.');
      }
      if (group.approvalStatus !== GroupApprovalStatus.APPROVED) {
        throw new BadRequestException('Este grupo todavía no ha sido aprobado por Partly.');
      }
      if (!group.credential) {
        throw new BadRequestException('El vendedor todavía no ha subido las credenciales de acceso a la cuenta.');
      }
      if ((await this.commissionsService.getRestriction(group.ownerId, tx)).restricted) {
        throw new BadRequestException('Este grupo no está recibiendo nuevos miembros por ahora.');
      }
      if (group.sourceProviderOrder?.expiresAt && group.sourceProviderOrder.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('La cuenta de este grupo se está renovando. Vuelve a intentarlo en unos días.');
      }
      const existing = await tx.groupMembership.findFirst({
        where: { groupId, userId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      });
      if (existing) {
        if (existing.status === MembershipStatus.RESERVED || existing.status === MembershipStatus.PENDING_PAYMENT) {
          // Reintentar "Elegir cupo" devuelve la misma solicitud para continuar el pago.
          return existing;
        }
        throw new ConflictException('Ya eres miembro activo de este grupo.');
      }

      const hasStarted = group.startedAt !== null;
      const live = await tx.groupMembership.findMany({
        where: { groupId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
        select: { status: true, autoRenew: true, currentPeriodEnd: true },
      });
      const stats = seatStats(live, hasStarted);
      if (stats.reservedSlots >= group.availableSlots && !(hasStarted && stats.freeingSlots > 0)) {
        throw new BadRequestException('Ya no hay cupos disponibles en este grupo.');
      }

      // Antes de que el vendedor inicie el grupo nadie paga: la membresía solo RESERVA el
      // cupo. Cuando el grupo arranca (startGroup) se les genera el pago con 48h para
      // cubrirlo. Si el grupo ya inició, el que entra tarde paga de una vez, prorrateado
      // por los días que le quedan al ciclo en curso.
      // Ya iniciado y sin un cupo que se pueda tomar hoy, quien llega puede APARTAR un lugar que se libera al terminar
      // el ciclo (un miembro que no renovará): no paga nada ahora; cuando el lugar se libera se le genera el pago.
      let reserveFreeingSeat = false;
      if (hasStarted) {
        const openCycle = await tx.billingCycle.findFirst({ where: { groupId, status: 'OPEN' } });
        const entry = computeJoinPricing(
          Number(group.pricePerSlot),
          openCycle?.periodStart ?? group.startedAt!,
          openCycle?.periodEnd ?? group.nextRenewalDate,
          group.plan.billingPeriod,
        );
        const freeNow = stats.reservedSlots < group.availableSlots;
        if (!(freeNow && entry.canJoinNow) && stats.freeingSlots > 0) {
          reserveFreeingSeat = true;
        } else if (!freeNow) {
          throw new BadRequestException('Ya no hay cupos disponibles en este grupo.');
        } else if (!entry.canJoinNow) {
          throw new BadRequestException(
            `Este grupo renueva en ${entry.remainingDays} ${entry.remainingDays === 1 ? 'día' : 'días'}. Para entrar deben quedar al menos ${entry.minEntryDays} días del ciclo; podrás entrar cuando empiece su nuevo ciclo, el ${entry.firstRenewalDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.`,
          );
        }
      }
      const membership = await tx.groupMembership.create({
        data: {
          groupId,
          userId,
          status: hasStarted && !reserveFreeingSeat ? MembershipStatus.PENDING_PAYMENT : MembershipStatus.RESERVED,
          currentPeriodEnd: group.nextRenewalDate,
        },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      });

      const platform = group.plan.platform.name;
      if (reserveFreeingSeat) {
        const freeingOn = stats.freeingDate!.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
        await this.notificationsService.create(tx, {
          userId: group.ownerId,
          type: NotificationType.SYSTEM,
          email: false,
          groupId,
          payload: `${membership.user.name} apartó el lugar que se libera el ${freeingOn} en tu grupo de ${platform}. No ha pagado nada: cuando el lugar quede libre se le generará su pago y tendrá 48 horas para cubrirlo.`,
        });
        await this.notificationsService.create(tx, {
          userId,
          type: NotificationType.SEAT_RESERVED,
          groupId,
          payload: `Apartaste un lugar en el grupo de ${platform} que se libera el ${freeingOn}. No pagas nada por ahora: ese día te avisamos y tendrás 48 horas para transferir tu pago.`,
          emailImmediate: true,
        });
      } else if (hasStarted) {
        // El miembro sube su comprobante (POST .../payments/receipt) y el owner lo revisa
        // (PUT .../payments/:paymentId/review) — solo al aprobar pasa a ACTIVE y desbloquea
        // la credencial. Si no paga dentro de las 48h, el cron diario libera el cupo.
        const due = await this.paymentsService.createInitialPayment(tx, group, membership.id);
        await this.notificationsService.create(tx, {
          userId,
          type: NotificationType.PAYMENT_DUE_SOON,
          groupId,
          payload: `Entraste al grupo de ${platform}. Tienes 48 horas para transferir $${due.amount.toFixed(2)} al vendedor y subir tu comprobante, o tu lugar se liberará.`,
          emailImmediate: true,
        });
      } else {
        await this.notificationsService.create(tx, {
          userId,
          type: NotificationType.SEAT_RESERVED,
          groupId,
          payload: `Apartaste tu lugar en el grupo de ${platform}. No pagas nada por ahora: cuando el vendedor inicie el grupo te avisamos y tendrás 48 horas para transferir tu pago.`,
          emailImmediate: true,
        });
        await this.evaluateStartThreshold(tx, groupId);
      }

      return membership;
    });
  }

  async leave(groupId: string, userId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.leaveInTx(tx, groupId, userId));
  }

  /**
   * El comprador suelta su lugar (apartado, pagando o activo) y queda libre para otra persona. Si subió un
   * comprobante que el vendedor aún no revisa no se le deja salir: ese dinero pudo haber llegado ya.
   * `onlyUnpaid` (al cambiarse a otro grupo) solo permite soltar un lugar que todavía no ha pagado.
   */
  private async leaveInTx(tx: Prisma.TransactionClient, groupId: string, userId: string, options: { onlyUnpaid?: boolean } = {}): Promise<void> {
    const membership = await tx.groupMembership.findFirst({
      where: { groupId, userId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
      include: {
        user: { select: { name: true } },
        group: { select: { ownerId: true, plan: { select: { platform: { select: { name: true } } } } } },
        payments: { where: { status: PaymentStatus.PENDING }, select: { id: true, receiptPath: true } },
      },
    });
    if (!membership) {
      throw new NotFoundException('No tienes un lugar en este grupo.');
    }
    if (options.onlyUnpaid && membership.status !== MembershipStatus.RESERVED && membership.status !== MembershipStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Ya pagaste tu lugar en el otro grupo; si quieres dejarlo, sal de él desde Mis grupos.');
    }
    if (membership.payments.some((p) => p.receiptPath)) {
      throw new BadRequestException('Tu comprobante está en revisión con el vendedor. Espera a que lo revise antes de soltar tu lugar, o escríbele desde Soporte.');
    }
    await this.releaseMembership(tx, groupId, membership.id);
    await this.evaluateStartThreshold(tx, groupId);

    const wasReserved = membership.status === MembershipStatus.RESERVED || membership.status === MembershipStatus.PENDING_PAYMENT;
    const platform = membership.group.plan.platform.name;
    const access = await memberLeftContext(tx, groupId);
    await this.notificationsService.create(tx, {
      userId: membership.group.ownerId,
      type: wasReserved ? NotificationType.SYSTEM : NotificationType.MEMBER_LEFT,
      groupId,
      payload: wasReserved
        ? `${membership.user.name} soltó el lugar que había apartado en tu grupo de ${platform}. Ya quedó libre para otra persona.`
        : memberLeftNotice({ memberName: membership.user.name, platform, reason: 'left', hadAccess: true, ...access }),
    });
    if (!wasReserved && access.wholesale) {
      await this.notificationsService.notifyAdmins(tx, { type: NotificationType.SYSTEM, email: { subject: 'Cambia la contraseña de una cuenta de mayoreo' }, groupId, payload: wholesaleRotationNotice({ memberName: membership.user.name, platform, sellerName: access.sellerName }) });
    }
  }

  /**
   * El owner (o un ADMIN) saca a alguien del grupo — distinto de que la persona se vaya
   * por su cuenta. No hay penalización ni reembolso todavía: no existe módulo de pagos,
   * así que no hay nada real que cobrar ni devolver. Cuando exista /payments, aquí habría
   * que decidir esa política.
   */
  async removeMember(groupId: string, membershipId: string, requester: AuthenticatedUser): Promise<void> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo el owner de este grupo (o un ADMIN) puede sacar miembros.');
    }

    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: { id: membershipId, groupId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
      });
      if (!membership) {
        throw new NotFoundException('Esa membresía no existe o ya no está activa en este grupo.');
      }
      await this.releaseMembership(tx, groupId, membership.id);
      await this.evaluateStartThreshold(tx, groupId);
    });
  }

  private async releaseMembership(tx: Prisma.TransactionClient, groupId: string, membershipId: string): Promise<void> {
    const membership = await tx.groupMembership.findUniqueOrThrow({ where: { id: membershipId } });
    await tx.groupMembership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.CANCELLED, leftAt: new Date() },
    });
    // Cobros pendientes sin comprobante: nadie transfirió nada, así que no deben quedar colgados en Pagos.
    await tx.payment.deleteMany({ where: { membershipId, status: PaymentStatus.PENDING, receiptPath: null } });
    // Libera su perfil de la cuenta compartida para que quede disponible para el siguiente comprador.
    await tx.groupProfile.updateMany({ where: { assignedMembershipId: membershipId }, data: { assignedMembershipId: null } });

    const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
    const occupiedSlots = OCCUPYING_MEMBERSHIP_STATUSES.includes(membership.status)
      ? Math.max(0, group.occupiedSlots - 1)
      : group.occupiedSlots;
    await tx.group.update({
      where: { id: groupId },
      data: {
        occupiedSlots,
        status: group.status === GroupStatus.FULL ? GroupStatus.ACTIVE : group.status,
      },
    });
  }

  /**
   * Mantiene al día el estado del grupo antes de iniciar y le avisa al vendedor:
   *  - al llegar al 75% de cupos reservados el grupo pasa a "listo para iniciar" y se le avisa que ya puede abrirlo;
   *  - al llenarse por completo se le avisa aparte ("se llenó"); si ambas cosas pasan a la vez, solo este aviso;
   *  - si alguien se sale y baja del 75% el grupo regresa a "buscando miembros", y al volver a subir se le avisa
   *    de nuevo (con un enfriamiento para no repetir el aviso cuando el grupo sube y baja seguido).
   * Se llama después de cada reserva y cada salida mientras el grupo no ha iniciado.
   */
  private async evaluateStartThreshold(tx: Prisma.TransactionClient, groupId: string): Promise<void> {
    const group = await tx.group.findUniqueOrThrow({
      where: { id: groupId },
      include: { plan: { include: { platform: true } } },
    });
    if (group.startedAt || group.status === GroupStatus.PAUSED || group.status === GroupStatus.CANCELLED) {
      return;
    }

    const reserved = await tx.groupMembership.count({
      where: { groupId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
    });
    const required = slotsRequiredToStart(group.availableSlots);
    const isReady = reserved >= required;
    const isFull = reserved >= group.availableSlots;
    const now = new Date();
    const cooledDown = (last: Date | null) => !last || now.getTime() - last.getTime() >= START_ALERT_COOLDOWN_MS;

    const data: Prisma.GroupUpdateInput = {};
    let becameReady = false;
    if (isReady && group.status !== GroupStatus.READY_TO_START) {
      data.status = GroupStatus.READY_TO_START;
      data.readySince = now;
      data.readyReminderStage = 0;
      becameReady = true;
    } else if (!isReady && group.status === GroupStatus.READY_TO_START) {
      data.status = GroupStatus.SEARCHING_MEMBERS;
      data.readySince = null;
      data.readyReminderStage = 0;
    }

    const platform = group.plan.platform.name;
    // Solo el primer aviso de que ya se puede iniciar sale por correo; si luego se llena, eso ya se ve en la app.
    let alert: { type: NotificationType; payload: string; email: boolean } | null = null;
    if (isFull && cooledDown(group.fullNotifiedAt)) {
      alert = {
        type: NotificationType.GROUP_FULL,
        payload: `¡Tu grupo de ${platform} se llenó! Los ${group.availableSlots} cupos ya están reservados. Inícialo cuando quieras para empezar a cobrar con todos.`,
        email: becameReady,
      };
      data.fullNotifiedAt = now;
      data.readyNotifiedAt = now;
    } else if (becameReady && !isFull && cooledDown(group.readyNotifiedAt)) {
      alert = {
        type: NotificationType.GROUP_READY_TO_START,
        payload: `Tu grupo de ${platform} ya tiene ${reserved} de ${group.availableSlots} cupos reservados. Puedes iniciarlo ahora y empezar a cobrar, o esperar a llenarlo.`,
        email: true,
      };
      data.readyNotifiedAt = now;
    }

    if (Object.keys(data).length > 0) {
      await tx.group.update({ where: { id: groupId }, data });
    }
    if (alert) {
      await this.notificationsService.create(tx, {
        userId: group.ownerId,
        type: alert.type,
        payload: alert.payload,
        groupId,
        emailDedupeKey: `group-start-alert:${groupId}:${now.getTime()}`,
        ...(alert.email ? {} : { email: false as const }),
      });
    }
  }

  /**
   * Una vez al día: le recuerda al vendedor cuyo grupo lleva días listo para iniciar sin que lo abra. Los
   * compradores ya reservaron y no pagan ni usan la cuenta hasta que él pulse "Iniciar grupo". Son hasta
   * tres recordatorios (a los 2, 5 y 10 días de espera) y no más. De paso corrige los grupos que quedaron
   * marcados como listos sin tener ya el 75% (por ejemplo, porque alguien se salió). Devuelve cuántos mandó.
   * `now` y `onlyGroupId` existen para poder probarlo (simular el paso de los días sobre un solo grupo).
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async sendStartReminders(now: Date = new Date(), onlyGroupId?: string): Promise<number> {
    const groups = await this.prisma.group.findMany({
      where: {
        status: GroupStatus.READY_TO_START,
        startedAt: null,
        approvalStatus: GroupApprovalStatus.APPROVED,
        ...(onlyGroupId ? { id: onlyGroupId } : {}),
      },
      include: {
        plan: { include: { platform: { select: { name: true } } } },
        owner: { select: { deletedAt: true } },
        _count: { select: { memberships: { where: { status: { in: LIVE_MEMBERSHIP_STATUSES } } } } },
      },
    });

    let sent = 0;
    for (const group of groups) {
      try {
        if (await this.remindToStart(group, now)) sent += 1;
      } catch (error) {
        this.logger.error(`No se pudo procesar el recordatorio de inicio del grupo ${group.id}: ${String(error)}`);
      }
    }
    if (sent > 0) {
      this.logger.log(`Recordatorios de inicio de grupo enviados: ${sent}.`);
    }
    return sent;
  }

  private async remindToStart(
    group: {
      id: string;
      ownerId: string;
      availableSlots: number;
      readySince: Date | null;
      readyNotifiedAt: Date | null;
      readyReminderStage: number;
      plan: { platform: { name: string } };
      owner: { deletedAt: Date | null };
      _count: { memberships: number };
    },
    now: Date,
  ): Promise<boolean> {
    const reserved = group._count.memberships;
    if (reserved < slotsRequiredToStart(group.availableSlots)) {
      await this.prisma.group.update({
        where: { id: group.id },
        data: { status: GroupStatus.SEARCHING_MEMBERS, readySince: null, readyReminderStage: 0 },
      });
      return false;
    }

    // Grupos que ya estaban listos antes de existir este seguimiento: cuentan desde su último aviso.
    const since = group.readySince ?? group.readyNotifiedAt ?? now;
    if (!group.readySince) {
      await this.prisma.group.update({ where: { id: group.id }, data: { readySince: since } });
    }

    const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
    // Si pasaron varios plazos de golpe (grupo viejo), se manda solo el último: no tres seguidos.
    const stage = START_REMINDER_AFTER_DAYS.filter((limit) => days >= limit).length;
    if (stage === 0 || stage <= group.readyReminderStage || group.owner.deletedAt) {
      return false;
    }
    // Con una comisión vencida no puede iniciar grupos: pedírselo solo lo confundiría.
    if ((await this.commissionsService.getRestriction(group.ownerId)).restricted) {
      return false;
    }

    const platform = group.plan.platform.name;
    const counts = `${reserved} de ${group.availableSlots} cupos reservados`;
    const payload =
      stage === 1
        ? `Tu grupo de ${platform} lleva ${days} días listo para iniciar con ${counts}. Tus compradores están esperando: inícialo para que puedan pagar y empezar a usar la cuenta.`
        : stage === 2
          ? `Tus compradores llevan ${days} días esperando que inicies tu grupo de ${platform} (${counts}). Mientras no lo inicies nadie paga y tú no empiezas a cobrar.`
          : `Último recordatorio: tu grupo de ${platform} lleva ${days} días listo y sigue sin iniciar (${counts}). Inícialo cuando puedas para no hacer esperar más a quienes ya reservaron.`;

    await this.prisma.$transaction(async (tx) => {
      await tx.group.update({ where: { id: group.id }, data: { readyReminderStage: stage } });
      await this.notificationsService.create(tx, {
        userId: group.ownerId,
        type: NotificationType.GROUP_START_REMINDER,
        payload,
        groupId: group.id,
        emailDedupeKey: `group-start-reminder:${group.id}:${since.getTime()}:${stage}`,
      });
    });
    return true;
  }

  /**
   * Números que ve el vendedor antes de decidir si inicia: cuánto cobraría con los cupos ya
   * reservados, cuánto se lleva Partly y qué le queda contra lo que le costó la cuenta.
   */
  async getStartPreview(groupId: string, requester: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        plan: { include: { platform: true } },
        credential: { select: { id: true } },
        sourceProviderOrder: { select: { unitPrice: true } },
      },
    });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo el vendedor de este grupo puede verlo.');
    }

    const reservedSlots = await this.prisma.groupMembership.count({
      where: { groupId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
    });
    const requiredSlots = slotsRequiredToStart(group.availableSlots);
    const pricePerSlot = Number(group.pricePerSlot);
    const commissionPercentage = group.commissionPercentage ? Number(group.commissionPercentage) : null;

    const revenueFor = (slots: number) => {
      const gross = Math.round(pricePerSlot * slots * 100) / 100;
      const commission = commissionPercentage === null ? null : Math.round(gross * (commissionPercentage / 100) * 100) / 100;
      const net = commission === null ? null : Math.round((gross - commission) * 100) / 100;
      return { slots, gross, commission, net };
    };

    // Lo que le costó la cuenta: el precio que pagó al mayoreo si la compró aquí, o el
    // precio oficial que declaró al crear el grupo.
    const accountCost = group.sourceProviderOrder
      ? Number(group.sourceProviderOrder.unitPrice)
      : Number(group.plan.officialPrice);
    const profitOf = (net: number | null) => (net === null ? null : Math.round((net - accountCost) * 100) / 100);
    const now = new Date();

    return {
      groupId: group.id,
      platformName: group.plan.platform.name,
      tierName: group.plan.tierName,
      status: group.status,
      startedAt: group.startedAt,
      availableSlots: group.availableSlots,
      reservedSlots,
      requiredSlots,
      canStart:
        !group.startedAt &&
        reservedSlots >= requiredSlots &&
        group.approvalStatus === GroupApprovalStatus.APPROVED &&
        group.credential !== null,
      pricePerSlot,
      commissionPercentage,
      accountCost,
      accountCostFromWholesale: group.sourceProviderOrder !== null,
      // Con los cupos que ya tiene reservados vs. con el grupo lleno.
      now: { ...revenueFor(reservedSlots), profit: profitOf(revenueFor(reservedSlots).net) },
      full: { ...revenueFor(group.availableSlots), profit: profitOf(revenueFor(group.availableSlots).net) },
      renewalDateIfStartedNow: addBillingPeriod(now, group.plan.billingPeriod),
    };
  }

  /**
   * Arranca el servicio del grupo: fija la fecha de renovación desde hoy, abre el ciclo de
   * cobro y le genera el pago a cada cupo reservado, con 48 horas para cubrirlo.
   */
  async startGroup(groupId: string, requester: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { plan: { include: { platform: true } }, credential: { select: { id: true } } },
    });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id) {
      throw new ForbiddenException('Solo el vendedor de este grupo puede iniciarlo.');
    }
    await this.commissionsService.assertNotRestricted(requester.id, 'iniciar grupos');
    if (group.startedAt) {
      throw new BadRequestException('Este grupo ya inició.');
    }
    if (group.approvalStatus !== GroupApprovalStatus.APPROVED) {
      throw new BadRequestException('Partly todavía no aprueba este grupo.');
    }
    if (!group.credential) {
      throw new BadRequestException('Sube las credenciales de la cuenta antes de iniciar el grupo.');
    }

    const reserved = await this.prisma.groupMembership.findMany({
      where: { groupId, status: MembershipStatus.RESERVED },
    });
    const requiredSlots = slotsRequiredToStart(group.availableSlots);
    if (reserved.length < requiredSlots) {
      throw new BadRequestException(`Necesitas al menos ${requiredSlots} de ${group.availableSlots} cupos reservados para iniciar.`);
    }

    const startedAt = new Date();
    const nextRenewalDate = addBillingPeriod(startedAt, group.plan.billingPeriod);

    await this.prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id: groupId },
        data: {
          startedAt,
          billingDay: startedAt.getUTCDate(),
          nextRenewalDate,
          status: reserved.length >= group.availableSlots ? GroupStatus.FULL : GroupStatus.ACTIVE,
        },
      });

      const cycle = await tx.billingCycle.create({
        data: { groupId, periodStart: startedAt, periodEnd: nextRenewalDate },
      });

      for (const membership of reserved) {
        await tx.groupMembership.update({
          where: { id: membership.id },
          data: { status: MembershipStatus.PENDING_PAYMENT, currentPeriodEnd: nextRenewalDate },
        });
        await this.paymentsService.createCyclePayment(tx, cycle.id, membership.id, Number(group.pricePerSlot), startedAt);
        await this.notificationsService.create(tx, {
          userId: membership.userId,
          type: NotificationType.PAYMENT_DUE_SOON,
          payload: `El grupo de ${group.plan.platform.name} ya inició. Tienes 48 horas para transferir $${Number(group.pricePerSlot).toFixed(2)} y subir tu comprobante, o tu cupo se liberará.`,
          groupId,
          emailImmediate: true,
        });
      }
    });

    return this.findById(groupId);
  }

  /**
   * Cuánto pagaría quien quiere entrar y por qué: antes de que el grupo inicie no se paga
   * nada al reservar; ya iniciado, se paga prorrateado por los días que le restan al ciclo.
   */
  async getJoinPreview(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        plan: { include: { platform: true } },
        memberships: { where: { status: { in: LIVE_MEMBERSHIP_STATUSES } }, select: { status: true, autoRenew: true, currentPeriodEnd: true } },
      },
    });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    const stats = seatStats(group.memberships, group.startedAt !== null);

    const fullPrice = Number(group.pricePerSlot);
    const restricted = (await this.commissionsService.getRestriction(group.ownerId)).restricted;
    const sourceExpiresAt = (await this.prisma.providerOrder.findUnique({ where: { resultingGroupId: groupId }, select: { expiresAt: true } }))?.expiresAt;
    const accountExpired = sourceExpiresAt ? sourceExpiresAt.getTime() < Date.now() : false;
    const base = {
      groupId: group.id,
      platformName: group.plan.platform.name,
      fullPrice,
      started: group.startedAt !== null,
      unavailableReason: restricted
        ? 'Este grupo no está recibiendo nuevos miembros por ahora.'
        : accountExpired
          ? 'La cuenta de este grupo se está renovando.'
          : (null as string | null),
    };

    if (!group.startedAt) {
      return {
        ...base,
        payNow: false,
        amountToPay: fullPrice,
        totalDays: null as number | null,
        remainingDays: null as number | null,
        isProrated: false,
        prorationAmount: fullPrice,
        includesNextCycle: false,
        canJoinNow: true,
        minEntryDays: null as number | null,
        coveredUntil: null as Date | null,
        firstRenewalDate: null as Date | null,
        reserveFreeingSeat: false,
        freeingDate: null as Date | null,
      };
    }

    const cycle = await this.prisma.billingCycle.findFirst({ where: { groupId, status: 'OPEN' } });
    const cycleStart = cycle?.periodStart ?? group.startedAt;
    const cycleEnd = cycle?.periodEnd ?? group.nextRenewalDate;
    const pricing = computeJoinPricing(fullPrice, cycleStart, cycleEnd, group.plan.billingPeriod);
    // Sin cupo que se pueda tomar hoy pero con un lugar que se libera: se aparta sin pagar y el pago llega al liberarse.
    const freeNow = stats.reservedSlots < group.availableSlots;
    const reserveFreeingSeat = !(freeNow && pricing.canJoinNow) && stats.freeingSlots > 0;

    return {
      ...base,
      reserveFreeingSeat,
      freeingDate: stats.freeingDate,
      payNow: !reserveFreeingSeat,
      amountToPay: reserveFreeingSeat ? fullPrice : pricing.amountToPay,
      totalDays: pricing.totalDays,
      remainingDays: pricing.remainingDays,
      isProrated: pricing.isProrated,
      prorationAmount: pricing.prorationAmount,
      includesNextCycle: pricing.includesNextCycle,
      canJoinNow: pricing.canJoinNow,
      minEntryDays: pricing.minEntryDays as number | null,
      coveredUntil: pricing.coveredUntil,
      firstRenewalDate: pricing.firstRenewalDate,
    };
  }

  /** Estado del visitante dentro del grupo (reservado, pagando, activo…), o null si no está. */
  async findMyMembership(groupId: string, userId: string) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
      select: { id: true, status: true, currentPeriodEnd: true, autoRenew: true },
      orderBy: { joinedAt: 'desc' },
    });
    return membership ?? null;
  }

  /**
   * El comprador decide si su lugar se renueva solo. Apagarlo sirve para quien solo quiere probar: no se le
   * genera el cobro del mes siguiente ni recibe recordatorios, y al terminar su periodo el lugar queda libre
   * (lo cierra el proceso diario, ver PaymentsService.endNonRenewingMemberships). Se puede volver a activar
   * mientras su periodo siga corriendo.
   */
  async setAutoRenew(groupId: string, userId: string, autoRenew: boolean) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
      include: { user: { select: { name: true } }, group: { include: { plan: { include: { platform: { select: { name: true } } } } } } },
      orderBy: { joinedAt: 'desc' },
    });
    if (!membership) {
      throw new NotFoundException('No tienes un lugar en este grupo.');
    }
    if (membership.autoRenew === autoRenew) {
      return { id: membership.id, status: membership.status, currentPeriodEnd: membership.currentPeriodEnd, autoRenew };
    }
    const started = membership.group.startedAt !== null && membership.status !== MembershipStatus.RESERVED;
    const platform = membership.group.plan.platform.name;
    const { updated, cancelledReservations } = await this.prisma.$transaction(async (tx) => {
      if (started && !autoRenew) {
        // Ya no habrá renovación: se retira el cobro del ciclo siguiente que todavía no pagaba.
        await this.paymentsService.cancelRenewalCharge(tx, membership.id);
      }
      const updated = await tx.groupMembership.update({ where: { id: membership.id }, data: { autoRenew } });
      let cancelledReservations = 0;
      if (started && autoRenew) {
        // Si la ventana de 3 días ya abrió, se le genera el cobro de renovación en este momento.
        await this.paymentsService.ensureRenewalCharge(tx, membership.id);
        // Su lugar ya no se libera: quien lo había apartado (los más recientes primero) se queda sin él.
        const live = await tx.groupMembership.findMany({
          where: { groupId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
          select: { id: true, userId: true, status: true, autoRenew: true, joinedAt: true },
          orderBy: { joinedAt: 'desc' },
        });
        const leaving = live.filter((m) => m.status === MembershipStatus.ACTIVE && !m.autoRenew).length;
        const waiting = live.filter((m) => m.status === MembershipStatus.RESERVED);
        for (const reservation of waiting.slice(0, Math.max(0, waiting.length - leaving))) {
          await tx.groupMembership.update({ where: { id: reservation.id }, data: { status: MembershipStatus.CANCELLED, leftAt: new Date() } });
          await this.notificationsService.create(tx, {
            userId: reservation.userId,
            type: NotificationType.MEMBERSHIP_CANCELLED,
            groupId,
            payload: `El lugar que apartaste en el grupo de ${platform} ya no se liberará porque el miembro decidió renovar. Tu reserva se canceló sin costo alguno; puedes buscar otro grupo.`,
          });
          cancelledReservations += 1;
        }
      }
      return { updated, cancelledReservations };
    });
    if (started) {
      const until = membership.currentPeriodEnd.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
      await this.notificationsService.create(this.prisma, {
        userId: membership.group.ownerId,
        type: NotificationType.SYSTEM,
        email: false,
        payload: autoRenew
          ? `${membership.user.name} volvió a activar la renovación de su lugar en tu grupo de ${platform}.${cancelledReservations > 0 ? ' Como conserva su lugar, se canceló la reserva de quien lo había apartado.' : ''}`
          : `${membership.user.name} no renovará su lugar en tu grupo de ${platform}. Tendrá acceso hasta el ${until} y después el lugar quedará libre: ya se puede apartar desde el marketplace.`,
        groupId,
      });
    }
    return { id: updated.id, status: updated.status, currentPeriodEnd: updated.currentPeriodEnd, autoRenew: updated.autoRenew };
  }

  async findMembers(groupId: string, requester: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }

    const isOwner = group.ownerId === requester.id;
    if (isOwner || requester.role === Role.ADMIN) {
      const members = await this.prisma.groupMembership.findMany({
        // Solo quienes siguen en el grupo (o lo apartaron): los que ya salieron no son miembros.
        where: { groupId, status: { in: LIVE_MEMBERSHIP_STATUSES } },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          profile: { select: { id: true, label: true } },
          // Cobro del ciclo siguiente (renovación) del ciclo en curso, para ver quién ya renovó.
          payments: { where: { forNextCycle: true, billingCycle: { status: 'OPEN' } }, select: { status: true, receiptPath: true }, take: 1 },
        },
        orderBy: { joinedAt: 'desc' },
      });
      return members.map(({ payments, ...member }) => {
        let renewalStatus: RenewalStatus | null = null;
        if (group.startedAt) {
          const charge = payments[0];
          if (member.status === MembershipStatus.RESERVED) renewalStatus = 'RESERVED_NEXT';
          else if (member.status === MembershipStatus.ACTIVE && !member.autoRenew) renewalStatus = 'NOT_RENEWING';
          else if (member.status === MembershipStatus.ACTIVE && charge) {
            renewalStatus = charge.status === PaymentStatus.PAID ? 'RENEWED' : charge.receiptPath ? 'IN_REVIEW' : 'PENDING';
          }
        }
        return { ...member, renewalStatus };
      });
    }

    const activeMembership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId: requester.id, status: MembershipStatus.ACTIVE },
    });
    if (!activeMembership) {
      throw new ForbiddenException('Solo el owner, un miembro activo de este grupo, o un ADMIN pueden ver la lista de miembros.');
    }

    // Un miembro (no owner) solo ve a otros miembros ya activos — no a quienes siguen
    // esperando que se revise su comprobante de pago.
    return this.prisma.groupMembership.findMany({
      where: { groupId, status: MembershipStatus.ACTIVE },
      include: { user: { select: { id: true, name: true, avatarUrl: true } }, profile: { select: { id: true, label: true } } },
      orderBy: { joinedAt: 'desc' },
    });
  }

  /** Solo el owner del grupo puede crear/actualizar la credencial (es quien tiene el acceso real). */
  async upsertCredential(groupId: string, dto: UpsertCredentialDto, requester: AuthenticatedUser): Promise<CredentialResponseDto> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id) {
      throw new ForbiddenException('Solo el owner de este grupo puede establecer la credencial compartida.');
    }
    // Las cuentas de mayoreo que Partly entregó con credenciales son de Partly: se cambian desde su tienda (y se
    // copian aquí). Las que se entregan por panel las administra el vendedor.
    if ((await memberLeftContext(this.prisma, groupId)).wholesale) {
      throw new ForbiddenException('Las credenciales de una cuenta de mayoreo las administra Partly. Si necesitas cambiarlas, pídelo desde Mayoreo → Mis compras → Reportar.');
    }
    // Con el grupo en revisión, las credenciales solo se envían cuando Partly las pide (o para corregir unas
    // ya enviadas): antes de eso el vendedor todavía no sabe si acepta la comisión.
    if (group.approvalStatus === GroupApprovalStatus.PENDING && group.credentialReviewStatus === CredentialReviewStatus.NOT_REQUESTED) {
      throw new ForbiddenException('Partly todavía no te pide las credenciales. Te avisaremos cuando definan tu comisión y puedas enviarlas.');
    }
    const key = this.configService.get<string>('credentialsEncryptionKey')!;
    const byInvite = group.accessType === GroupAccessType.INVITE_LINK;
    const inviteLink = dto.inviteLink?.trim();
    if (byInvite ? !inviteLink : !dto.username || !dto.password) {
      throw new BadRequestException(byInvite ? 'Pega el link de invitación a tu grupo familiar.' : 'Escribe el correo (o usuario) y la contraseña de la cuenta.');
    }
    const data = {
      usernameEncrypted: byInvite ? null : encrypt(dto.username!, key),
      passwordEncrypted: byInvite ? null : encrypt(dto.password!, key),
      inviteLinkEncrypted: byInvite ? encrypt(inviteLink!, key) : null,
      notesEncrypted: dto.notes ? encrypt(dto.notes, key) : null,
    };
    const plain = (value: string | null) => (value ? decrypt(value, key) : null);

    // ¿Cambió de verdad el acceso? (solo las notas no amerita avisar a todos)
    const previous = await this.prisma.credential.findUnique({ where: { groupId } });
    const accessChanged =
      !previous ||
      (byInvite ? plain(previous.inviteLinkEncrypted) !== inviteLink : plain(previous.usernameEncrypted) !== dto.username || plain(previous.passwordEncrypted) !== dto.password);

    const credential = await this.prisma.$transaction(async (tx) => {
      const savedCredential = await tx.credential.upsert({
        where: { groupId },
        create: { groupId, ...data },
        update: data,
      });
      await tx.credentialHistory.create({
        data: { groupId, changedByUserId: requester.id, changeReason: dto.changeReason },
      });

      // Grupo ya aprobado y con un acceso nuevo: los miembros que siguen deben saber que la contraseña cambió.
      // El aviso no incluye la contraseña; la ven dentro de Partly.
      if (group.approvalStatus === GroupApprovalStatus.APPROVED && previous && accessChanged) {
        const platform = (await tx.plan.findUniqueOrThrow({ where: { id: group.planId }, select: { platform: { select: { name: true } } } })).platform.name;
        const members = await tx.groupMembership.findMany({
          where: { groupId, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] } },
          select: { userId: true },
        });
        const reason = dto.changeReason?.trim();
        for (const member of members) {
          await this.notificationsService.create(tx, {
            userId: member.userId,
            type: NotificationType.CREDENTIAL_UPDATED,
            groupId,
            payload: byInvite
              ? `El vendedor actualizó el link de invitación de tu grupo de ${platform}${reason ? ` (${reason})` : ''}. Entra a tu grupo para ver el nuevo.`
              : `El vendedor actualizó el acceso de tu cuenta de ${platform}${reason ? ` (${reason})` : ''}. Entra a tu grupo para ver la contraseña nueva.`,
          });
        }
      }

      if (group.approvalStatus === GroupApprovalStatus.PENDING) {
        await tx.group.update({
          where: { id: groupId },
          data: { credentialReviewStatus: CredentialReviewStatus.SUBMITTED, credentialsSubmittedAt: new Date() },
        });
        const admins = await tx.user.findMany({ where: { role: Role.ADMIN }, select: { id: true } });
        await Promise.all(
          admins.map((admin) =>
            this.notificationsService.create(tx, {
              userId: admin.id,
              type: NotificationType.SYSTEM,
              email: { subject: 'Credenciales listas para revisar' },
              payload: `El vendedor envió las credenciales del grupo. Ya están listas para que las revises antes de aprobarlo.`,
              groupId,
            }),
          ),
        );
      }
      return savedCredential;
    });

    await this.ensureDefaultProfiles(groupId, group.availableSlots);

    return new CredentialResponseDto({
      accessType: group.accessType,
      username: byInvite ? null : dto.username!,
      password: byInvite ? null : dto.password!,
      inviteLink: byInvite ? inviteLink! : null,
      notes: dto.notes ?? null,
      updatedAt: credential.updatedAt,
    });
  }

  /**
   * La primera vez que el owner sube la credencial, se crean automáticamente tantos perfiles
   * como availableSlots (uno por cupo) con nombres genéricos "Perfil 1", "Perfil 2"... El owner
   * los puede renombrar o agregar/quitar extras después (findProfiles/createProfile/etc). No
   * hace nada si el grupo ya tiene perfiles — evita duplicarlos en ediciones posteriores de la
   * credencial.
   */
  private async ensureDefaultProfiles(groupId: string, availableSlots: number): Promise<void> {
    const existing = await this.prisma.groupProfile.count({ where: { groupId } });
    if (existing > 0) {
      return;
    }
    await this.prisma.groupProfile.createMany({
      data: Array.from({ length: availableSlots }, (_, i) => ({ groupId, label: `Perfil ${i + 1}` })),
    });
  }

  /** Owner o ADMIN ven los perfiles de la cuenta compartida y a quién está asignado cada uno. */
  async findProfiles(groupId: string, requester: AuthenticatedUser): Promise<GroupProfileResponseDto[]> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo el owner de este grupo (o un ADMIN) puede ver sus perfiles.');
    }
    const profiles = await this.prisma.groupProfile.findMany({
      where: { groupId },
      include: { assignedMembership: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return profiles.map((p) => new GroupProfileResponseDto(p));
  }

  /** Solo el owner puede agregar perfiles extra — por ejemplo si su plan real tiene más cupos que availableSlots. */
  async createProfile(groupId: string, dto: UpsertGroupProfileDto, requester: AuthenticatedUser): Promise<GroupProfileResponseDto> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id) {
      throw new ForbiddenException('Solo el owner de este grupo puede administrar sus perfiles.');
    }
    const profile = await this.prisma.groupProfile.create({ data: { groupId, label: dto.label } });
    return new GroupProfileResponseDto({ ...profile, assignedMembership: null });
  }

  async renameProfile(groupId: string, profileId: string, dto: UpsertGroupProfileDto, requester: AuthenticatedUser): Promise<GroupProfileResponseDto> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id) {
      throw new ForbiddenException('Solo el owner de este grupo puede administrar sus perfiles.');
    }
    const profile = await this.prisma.groupProfile.findFirst({ where: { id: profileId, groupId } });
    if (!profile) {
      throw new NotFoundException('Ese perfil no existe en este grupo.');
    }
    const updated = await this.prisma.groupProfile.update({
      where: { id: profileId },
      data: { label: dto.label },
      include: { assignedMembership: { include: { user: { select: { id: true, name: true } } } } },
    });
    return new GroupProfileResponseDto(updated);
  }

  /** Solo se puede borrar un perfil que no esté asignado a nadie ahora mismo. */
  async deleteProfile(groupId: string, profileId: string, requester: AuthenticatedUser): Promise<void> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id) {
      throw new ForbiddenException('Solo el owner de este grupo puede administrar sus perfiles.');
    }
    const profile = await this.prisma.groupProfile.findFirst({ where: { id: profileId, groupId } });
    if (!profile) {
      throw new NotFoundException('Ese perfil no existe en este grupo.');
    }
    if (profile.assignedMembershipId) {
      throw new BadRequestException('No puedes borrar un perfil que está asignado a un miembro. Quítaselo primero.');
    }
    await this.prisma.groupProfile.delete({ where: { id: profileId } });
  }

  /**
   * Ven la credencial descifrada el owner y los miembros ACTIVE. Un ADMIN solo mientras la revisa (el vendedor la
   * envió y espera aprobación), y cada consulta queda en la bitácora: ser administrador no da acceso permanente a
   * las cuentas de los vendedores.
   */
  async getCredential(groupId: string, requester: AuthenticatedUser): Promise<CredentialResponseDto> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }

    const isOwner = group.ownerId === requester.id;
    const activeMembership = isOwner
      ? null
      : await this.prisma.groupMembership.findFirst({
          where: { groupId, userId: requester.id, status: MembershipStatus.ACTIVE },
          select: { id: true },
        });
    const adminReviewing = requester.role === Role.ADMIN && group.credentialReviewStatus === CredentialReviewStatus.SUBMITTED;
    if (!isOwner && !activeMembership && !adminReviewing) {
      throw new ForbiddenException('Solo el owner o un miembro activo de este grupo pueden ver la credencial.');
    }
    if (!isOwner && !activeMembership && adminReviewing) {
      await this.prisma.adminActionLog.create({
        data: { adminUserId: requester.id, actionType: 'CREDENTIAL_VIEWED', targetEntity: 'Group', targetId: groupId, reason: 'Revisión de credenciales enviadas' },
      });
    }

    const credential = await this.prisma.credential.findUnique({ where: { groupId } });
    if (!credential) {
      throw new NotFoundException('Este grupo todavía no tiene una credencial configurada.');
    }

    const key = this.configService.get<string>('credentialsEncryptionKey')!;
    const plain = (value: string | null) => (value ? decrypt(value, key) : null);
    return new CredentialResponseDto({
      accessType: group.accessType,
      username: plain(credential.usernameEncrypted),
      password: plain(credential.passwordEncrypted),
      inviteLink: plain(credential.inviteLinkEncrypted),
      notes: plain(credential.notesEncrypted),
      updatedAt: credential.updatedAt,
    });
  }

  /**
   * Para el vendedor: si alguien que ya había pagado (y vio la contraseña) salió del grupo DESPUÉS de la última vez
   * que actualizó las credenciales, hay un cambio de contraseña pendiente. Se quita solo al actualizarlas.
   */
  async getCredentialStatus(groupId: string, requester: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { ownerId: true } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id) {
      throw new ForbiddenException('Solo el vendedor de este grupo puede ver este aviso.');
    }
    const credential = await this.prisma.credential.findUnique({ where: { groupId }, select: { updatedAt: true } });
    if (!credential) {
      return { rotationPending: false, since: null as Date | null, departures: 0, lastMemberName: null as string | null };
    }
    const where: Prisma.GroupMembershipWhereInput = {
      groupId,
      status: { in: [MembershipStatus.CANCELLED, MembershipStatus.FINISHED] },
      leftAt: { gt: credential.updatedAt },
      payments: { some: { status: PaymentStatus.PAID } },
    };
    const [last, departures] = await Promise.all([
      this.prisma.groupMembership.findFirst({ where, orderBy: { leftAt: 'desc' }, include: { user: { select: { name: true } } } }),
      this.prisma.groupMembership.count({ where }),
    ]);
    return { rotationPending: departures > 0, since: last?.leftAt ?? null, departures, lastMemberName: last?.user.name ?? null };
  }

  /** Historial de cambios (quién y cuándo) — no expone valores viejos, solo lo mismo que puede ver getCredential. */
  async getCredentialHistory(groupId: string, requester: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }

    const isOwner = group.ownerId === requester.id;
    if (!isOwner) {
      const activeMembership = await this.prisma.groupMembership.findFirst({
        where: { groupId, userId: requester.id, status: MembershipStatus.ACTIVE },
      });
      if (!activeMembership) {
        throw new ForbiddenException('Solo el owner o un miembro activo de este grupo pueden ver este historial.');
      }
    }

    return this.prisma.credentialHistory.findMany({
      where: { groupId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { changedAt: 'desc' },
    });
  }
}
