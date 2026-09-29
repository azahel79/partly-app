import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IncidentContext, IncidentMessageAudience, IncidentStatus, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { AddIncidentMessageDto } from './dto/add-incident-message.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';

const PLAN_SUMMARY = { select: { tierName: true, platform: { select: { name: true, logoUrl: true } } } } as const;

const WITH_RELATIONS = {
  reportedBy: { select: { id: true, name: true, email: true, role: true } },
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  // De qué se trata: el grupo (y el perfil del comprador) o la compra de mayoreo.
  groupMembership: {
    select: {
      group: { select: { id: true, plan: PLAN_SUMMARY, sourceProviderOrder: { select: { id: true, credential: { select: { panelUrlEncrypted: true } } } } } },
      profile: { select: { label: true } },
    },
  },
  providerOrder: { select: { id: true, listing: { select: { plan: PLAN_SUMMARY } } } },
} satisfies Prisma.IncidentInclude;

const STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: 'abierta',
  IN_REVIEW: 'en revisión',
  ESCALATED: 'escalada a Partly',
  RESOLVED: 'resuelta',
};

const HOUR_MS = 60 * 60 * 1000;
/** Plazo que da Partly al responsable cuando le pide respuesta. */
const RESPONSE_WINDOW_MS = 24 * HOUR_MS;
/** Sin respuesta del vendedor: recordatorio al día y escalada automática a los 3 días. */
const REMINDER_AFTER_MS = 24 * HOUR_MS;
const AUTO_ESCALATE_AFTER_MS = 72 * HOUR_MS;

/** Pantalla de la incidencia para cada quien: el admin tiene la suya. */
const incidentPath = (id: string, forAdmin = false) => (forAdmin ? `/admin/incidencias/${id}` : `/panel/soporte/${id}`);

// A qué estados se puede pasar desde cada uno. RESOLVED es terminal (no se reabre en v1).
// Una vez ESCALATED, solo un ADMIN puede sacarla de ahí (se valida aparte en updateStatus).
const STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: [IncidentStatus.IN_REVIEW, IncidentStatus.RESOLVED, IncidentStatus.ESCALATED],
  IN_REVIEW: [IncidentStatus.RESOLVED, IncidentStatus.ESCALATED],
  ESCALATED: [IncidentStatus.IN_REVIEW, IncidentStatus.RESOLVED],
  RESOLVED: [],
};

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Un solo modelo para los dos casos hablados: comprador reporta a su vendedor
   * (GROUP_MEMBERSHIP, se asigna al owner del grupo) o vendedor reporta a su proveedor
   * (PROVIDER_ORDER, se asigna al dueño del ProviderProfile). El destinatario se calcula
   * solo, no lo manda quien reporta.
   */
  async create(reporterUserId: string, dto: CreateIncidentDto) {
    let assignedToUserId: string;

    if (dto.context === IncidentContext.GROUP_MEMBERSHIP) {
      if (!dto.groupMembershipId) {
        throw new BadRequestException('groupMembershipId es requerido para el contexto GROUP_MEMBERSHIP.');
      }
      const membership = await this.prisma.groupMembership.findUnique({
        where: { id: dto.groupMembershipId },
        include: { group: true },
      });
      if (!membership) {
        throw new NotFoundException('Membresía no encontrada.');
      }
      if (membership.userId !== reporterUserId) {
        throw new ForbiddenException('Solo el miembro de esa membresía puede reportar un problema sobre ella.');
      }
      assignedToUserId = membership.group.ownerId;
    } else {
      if (!dto.providerOrderId) {
        throw new BadRequestException('providerOrderId es requerido para el contexto PROVIDER_ORDER.');
      }
      const order = await this.prisma.providerOrder.findUnique({
        where: { id: dto.providerOrderId },
        include: { listing: { include: { providerProfile: true } } },
      });
      if (!order) {
        throw new NotFoundException('Orden de proveedor no encontrada.');
      }
      if (order.buyerUserId !== reporterUserId) {
        throw new ForbiddenException('Solo quien compró esa orden puede reportar un problema sobre ella.');
      }
      assignedToUserId = order.listing.providerProfile.userId;
    }

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          context: dto.context,
          groupMembershipId: dto.groupMembershipId,
          providerOrderId: dto.providerOrderId,
          reportedByUserId: reporterUserId,
          assignedToUserId,
          subject: dto.subject,
          messages: { create: { authorUserId: reporterUserId, body: dto.message } },
        },
        include: WITH_RELATIONS,
      });

      await this.notificationsService.create(tx, {
        userId: assignedToUserId,
        type: NotificationType.INCIDENT_OPENED,
        payload: `Nueva incidencia: "${dto.subject}"`,
      });

      return created;
    });

    await this.mailService.sendNotice(incident.assignedTo.email, `Nueva incidencia: ${dto.subject}`, `${incident.reportedBy.name} reportó: ${dto.message}`, {
      label: 'Responder',
      path: incidentPath(incident.id, incident.assignedTo.role === Role.ADMIN),
    });

    return incident;
  }

  /** Mías: donde soy quien reportó, o a quien se le asignó responder. */
  async findMine(userId: string, query: ListIncidentsQueryDto) {
    const where: Prisma.IncidentWhereInput = {
      status: query.status,
      OR: [{ reportedByUserId: userId }, { assignedToUserId: userId }],
    };
    return this.paginate(where, query);
  }

  /** Todas — pensada para la cola de escaladas, pero sirve para cualquier filtro (solo ADMIN). */
  async findAllForAdmin(query: ListIncidentsQueryDto) {
    return this.paginate({ status: query.status }, query);
  }

  private async paginate(where: Prisma.IncidentWhereInput, query: ListIncidentsQueryDto) {
    const [data, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        include: WITH_RELATIONS,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.incident.count({ where }),
    ]);
    return { data, total };
  }

  private async findWithAccessCheck(id: string, requester: AuthenticatedUser) {
    const incident = await this.prisma.incident.findUnique({ where: { id }, include: WITH_RELATIONS });
    if (!incident) {
      throw new NotFoundException('Incidencia no encontrada.');
    }
    const isParty = incident.reportedByUserId === requester.id || incident.assignedToUserId === requester.id;
    if (!isParty && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes acceso a esta incidencia.');
    }
    return incident;
  }

  async findById(id: string, requester: AuthenticatedUser) {
    return this.findWithAccessCheck(id, requester);
  }

  /**
   * Hilo de la incidencia. Partly ve todo; cada parte ve los mensajes para todos y los privados entre ella y Partly.
   */
  async findMessages(id: string, requester: AuthenticatedUser) {
    const incident = await this.findWithAccessCheck(id, requester);
    const visible: IncidentMessageAudience[] =
      requester.role === Role.ADMIN
        ? [IncidentMessageAudience.ALL, IncidentMessageAudience.REPORTER, IncidentMessageAudience.ASSIGNEE]
        : [IncidentMessageAudience.ALL, ...(requester.id === incident.reportedByUserId ? [IncidentMessageAudience.REPORTER] : []), ...(requester.id === incident.assignedToUserId ? [IncidentMessageAudience.ASSIGNEE] : [])];
    return this.prisma.incidentMessage.findMany({
      where: { incidentId: id, audience: { in: visible } },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Las dos partes menos quien hizo el cambio (avisos de cambio de estado). */
  private notifyRecipients(incident: { reportedByUserId: string; assignedToUserId: string }, excludeUserId: string) {
    return [incident.reportedByUserId, incident.assignedToUserId].filter((id) => id !== excludeUserId);
  }

  /** Partly ya está metido: la incidencia está escalada o le pidió respuesta al responsable. */
  private partlyInvolved(incident: { status: IncidentStatus; responseRequestedAt: Date | null }): boolean {
    return incident.status === IncidentStatus.ESCALATED || incident.responseRequestedAt !== null;
  }

  private activeAdmins() {
    return this.prisma.user.findMany({ where: { role: Role.ADMIN, deletedAt: null }, select: { id: true, email: true, role: true } });
  }

  /**
   * Un mensaje puede ir a todos o ser privado entre Partly y una de las partes. Partly escribe en privado cuando quiere;
   * quien reportó o el responsable pueden contestarle en privado a Partly una vez que Partly intervino.
   */
  async addMessage(id: string, dto: AddIncidentMessageDto, requester: AuthenticatedUser) {
    const incident = await this.findWithAccessCheck(id, requester);
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('Esta incidencia ya está resuelta, no se pueden agregar más mensajes.');
    }

    const isAdmin = requester.role === Role.ADMIN;
    const isReporter = requester.id === incident.reportedByUserId;
    const isAssignee = requester.id === incident.assignedToUserId;
    const audience = dto.audience ?? IncidentMessageAudience.ALL;
    if (audience !== IncidentMessageAudience.ALL && !isAdmin) {
      const ownAudience = isReporter ? IncidentMessageAudience.REPORTER : IncidentMessageAudience.ASSIGNEE;
      if (audience !== ownAudience) {
        throw new ForbiddenException('Solo puedes escribirle en privado a Partly, no a la otra persona.');
      }
      if (!this.partlyInvolved(incident)) {
        throw new BadRequestException('Podrás escribirle en privado a Partly cuando intervenga en esta incidencia.');
      }
    }

    // A quién le llega: las partes que pueden ver el mensaje (menos quien escribe) y Partly si ya está involucrado.
    const parties = [incident.reportedBy, incident.assignedTo].filter(
      (u, i, all) => all.findIndex((x) => x.id === u.id) === i && u.id !== requester.id,
    );
    const partyRecipients = parties.filter((u) =>
      audience === IncidentMessageAudience.ALL ? true : audience === IncidentMessageAudience.REPORTER ? u.id === incident.reportedByUserId : u.id === incident.assignedToUserId,
    );
    const admins = !isAdmin && this.partlyInvolved(incident) ? (await this.activeAdmins()).filter((a) => a.id !== requester.id && !partyRecipients.some((p) => p.id === a.id)) : [];
    const isPrivate = audience !== IncidentMessageAudience.ALL;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incidentMessage.create({
        data: { incidentId: id, authorUserId: requester.id, body: dto.body, audience },
        include: { author: { select: { id: true, name: true } } },
      });
      if (isAssignee) {
        // Contestó el responsable: cuenta para los recordatorios y cumple si Partly le había pedido respuesta.
        await tx.incident.update({ where: { id }, data: { lastAssigneeReplyAt: new Date(), responseDueAt: null } });
        // En cuanto el responsable contesta, el reporte deja de estar "abierto": ya lo está atendiendo.
        if (incident.status === IncidentStatus.OPEN) {
          await tx.incident.updateMany({ where: { id, status: IncidentStatus.OPEN }, data: { status: IncidentStatus.IN_REVIEW } });
        }
      }

      for (const recipient of [...partyRecipients, ...admins]) {
        await this.notificationsService.create(tx, {
          userId: recipient.id,
          type: NotificationType.INCIDENT_MESSAGE,
          payload: isPrivate
            ? isAdmin
              ? `Partly te escribió en privado sobre "${incident.subject}".`
              : `${created.author.name} le escribió en privado a Partly sobre "${incident.subject}".`
            : `Nuevo mensaje en la incidencia "${incident.subject}".`,
        });
      }
      return created;
    });

    for (const recipient of [...partyRecipients, ...admins]) {
      await this.mailService.sendNotice(
        recipient.email,
        isPrivate && isAdmin ? `Partly te escribió: ${incident.subject}` : `Nuevo mensaje: ${incident.subject}`,
        isPrivate && isAdmin ? `Mensaje privado (solo tú y Partly lo ven): ${dto.body}` : dto.body,
        { label: 'Ver la conversación', path: incidentPath(incident.id, recipient.role === Role.ADMIN) },
      );
    }

    return message;
  }

  /**
   * Partly le pide al responsable que conteste en 24 horas. Queda anotado en la incidencia; si no contesta a tiempo,
   * el seguimiento automático le avisa al equipo de Partly.
   */
  async requestResponse(id: string, requester: AuthenticatedUser) {
    const incident = await this.findWithAccessCheck(id, requester);
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('Esta incidencia ya está resuelta.');
    }
    if (incident.assignedTo.role === Role.ADMIN) {
      throw new BadRequestException('El responsable de esta incidencia es Partly.');
    }
    const now = new Date();
    const due = new Date(now.getTime() + RESPONSE_WINDOW_MS);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({ where: { id }, data: { responseRequestedAt: now, responseDueAt: due }, include: WITH_RELATIONS });
      await this.notificationsService.create(tx, {
        userId: incident.assignedToUserId,
        type: NotificationType.INCIDENT_STATUS_CHANGED,
        payload: `Partly te pide responder la incidencia "${incident.subject}" de ${incident.reportedBy.name} antes del ${this.dateTimeLabel(due)}.`,
      });
      await this.notificationsService.create(tx, {
        userId: incident.reportedByUserId,
        type: NotificationType.INCIDENT_STATUS_CHANGED,
        payload: `Partly le pidió a ${incident.assignedTo.name} que responda tu reporte "${incident.subject}" en las próximas 24 horas.`,
      });
      return result;
    });
    await this.mailService.sendNotice(
      incident.assignedTo.email,
      `Partly te pide responder: ${incident.subject}`,
      `${incident.reportedBy.name} reportó un problema y todavía no tiene respuesta. Contesta antes del ${this.dateTimeLabel(due)}; si no respondes, Partly decidirá con la información que tenga.`,
      { label: 'Responder ahora', path: incidentPath(id) },
    );
    return updated;
  }

  /**
   * Seguimiento automático de las incidencias de grupos (cada hora):
   *  - 24 h sin respuesta del vendedor: se le recuerda.
   *  - 72 h sin respuesta: se escala sola a Partly.
   *  - Partly le pidió respuesta y venció el plazo: se le avisa al equipo de Partly.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processFollowUps(now: Date = new Date()): Promise<void> {
    const unanswered = await this.prisma.incident.findMany({
      where: {
        context: IncidentContext.GROUP_MEMBERSHIP,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW] },
        lastAssigneeReplyAt: null,
        followUpStage: { lt: 2 },
        createdAt: { lte: new Date(now.getTime() - REMINDER_AFTER_MS) },
      },
      include: WITH_RELATIONS,
    });
    for (const incident of unanswered) {
      const age = now.getTime() - incident.createdAt.getTime();
      if (age >= AUTO_ESCALATE_AFTER_MS) {
        await this.autoEscalate(incident);
      } else if (incident.followUpStage === 0) {
        const moved = await this.prisma.incident.updateMany({ where: { id: incident.id, followUpStage: 0 }, data: { followUpStage: 1 } });
        if (moved.count === 0) continue;
        await this.prisma.$transaction((tx) =>
          this.notificationsService.create(tx, {
            userId: incident.assignedToUserId,
            type: NotificationType.INCIDENT_STATUS_CHANGED,
            payload: `Tienes un reporte sin responder de ${incident.reportedBy.name}: "${incident.subject}". Si no contestas en 2 días, pasa a Partly.`,
          }),
        );
        await this.mailService.sendNotice(
          incident.assignedTo.email,
          `Tienes un reporte sin responder: ${incident.subject}`,
          `${incident.reportedBy.name} lleva un día esperando tu respuesta. Si no contestas en 2 días, el reporte pasa al equipo de Partly.`,
          { label: 'Responder', path: incidentPath(incident.id) },
        );
      }
    }

    const overdue = await this.prisma.incident.findMany({
      where: { status: { not: IncidentStatus.RESOLVED }, responseDueAt: { lte: now } },
      include: WITH_RELATIONS,
    });
    for (const incident of overdue) {
      const cleared = await this.prisma.incident.updateMany({ where: { id: incident.id, responseDueAt: incident.responseDueAt }, data: { responseDueAt: null } });
      if (cleared.count === 0) continue;
      const admins = await this.activeAdmins();
      await this.prisma.$transaction(async (tx) => {
        for (const admin of admins) {
          await this.notificationsService.create(tx, {
            userId: admin.id,
            type: NotificationType.INCIDENT_STATUS_CHANGED,
            payload: `${incident.assignedTo.name} no respondió a tiempo la incidencia "${incident.subject}" que le pidió Partly.`,
          });
        }
      });
      for (const admin of admins) {
        await this.mailService.sendNotice(admin.email, `Sin respuesta del vendedor: ${incident.subject}`, `${incident.assignedTo.name} no contestó en las 24 horas que le dio Partly. Revisa la incidencia y decide con la información que tengas.`, {
          label: 'Revisar incidencia',
          path: incidentPath(incident.id, true),
        });
      }
    }
  }

  /** 72 horas sin respuesta del responsable: la incidencia pasa sola a Partly. */
  private async autoEscalate(incident: Prisma.IncidentGetPayload<{ include: typeof WITH_RELATIONS }>): Promise<void> {
    const admins = await this.activeAdmins();
    const moved = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.updateMany({
        where: { id: incident.id, status: { in: [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW] }, lastAssigneeReplyAt: null },
        data: { status: IncidentStatus.ESCALATED, followUpStage: 2 },
      });
      if (result.count === 0) return false;
      const payload = `"${incident.subject}" pasó a Partly porque ${incident.assignedTo.name} no respondió en 3 días.`;
      for (const userId of [incident.reportedByUserId, incident.assignedToUserId, ...admins.map((a) => a.id)]) {
        await this.notificationsService.create(tx, { userId, type: NotificationType.INCIDENT_STATUS_CHANGED, payload });
      }
      return true;
    });
    if (!moved) return;
    for (const admin of admins) {
      await this.mailService.sendNotice(admin.email, `Incidencia escalada sola: ${incident.subject}`, `${incident.assignedTo.name} no respondió en 3 días el reporte de ${incident.reportedBy.name}. Ahora la atiende Partly.`, {
        label: 'Revisar incidencia',
        path: incidentPath(incident.id, true),
      });
    }
  }

  private dateTimeLabel(date: Date): string {
    return date.toLocaleString('es-MX', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' }).replace(/\./g, '');
  }

  async updateStatus(id: string, newStatus: IncidentStatus, requester: AuthenticatedUser) {
    const incident = await this.findWithAccessCheck(id, requester);

    if (incident.status === IncidentStatus.ESCALATED && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Esta incidencia está escalada: solo un ADMIN puede resolverla o regresarla a revisión.');
    }
    if (!STATUS_TRANSITIONS[incident.status].includes(newStatus)) {
      throw new BadRequestException(`Una incidencia ${STATUS_LABEL[incident.status]} no se puede marcar como ${STATUS_LABEL[newStatus]}.`);
    }
    // Quien reportó es quien sabe si ya funciona: el responsable avisa en el chat y el reportante confirma.
    if (newStatus === IncidentStatus.RESOLVED && requester.id !== incident.reportedByUserId && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo quien reportó el problema puede darlo por resuelto. Si ya lo arreglaste, avísale en la conversación para que lo confirme.');
    }

    const recipientIds = this.notifyRecipients(incident, requester.id);
    const admins =
      newStatus === IncidentStatus.ESCALATED ? await this.prisma.user.findMany({ where: { role: Role.ADMIN, deletedAt: null }, select: { id: true, email: true } }) : [];

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.incident.update({
        where: { id },
        data: { status: newStatus, resolvedAt: newStatus === IncidentStatus.RESOLVED ? new Date() : null },
        include: WITH_RELATIONS,
      });

      for (const recipientId of recipientIds) {
        await this.notificationsService.create(tx, {
          userId: recipientId,
          type: NotificationType.INCIDENT_STATUS_CHANGED,
          payload: `La incidencia "${incident.subject}" ahora está ${STATUS_LABEL[newStatus]}.`,
        });
      }
      // Escalada: la atiende Partly, así que se le avisa al equipo (antes solo aparecía en su cola).
      for (const admin of admins.filter((a) => a.id !== requester.id)) {
        await this.notificationsService.create(tx, {
          userId: admin.id,
          type: NotificationType.INCIDENT_STATUS_CHANGED,
          payload: `${incident.reportedBy.name} y ${incident.assignedTo.name} necesitan ayuda con "${incident.subject}": la incidencia se escaló a Partly.`,
        });
      }

      return updated;
    }).then(async (updated) => {
      for (const admin of admins.filter((a) => a.id !== requester.id)) {
        await this.mailService.sendNotice(admin.email, `Incidencia escalada: ${incident.subject}`, `${incident.reportedBy.name} (reportó) y ${incident.assignedTo.name} (responsable) no lograron resolverla y pidieron ayuda a Partly.`, {
          label: 'Revisar incidencia',
          path: incidentPath(incident.id, true),
        });
      }
      return updated;
    });
  }
}
