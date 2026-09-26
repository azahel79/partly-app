import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IncidentContext, IncidentStatus, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { AddIncidentMessageDto } from './dto/add-incident-message.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';

const WITH_RELATIONS = {
  reportedBy: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} satisfies Prisma.IncidentInclude;

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

    await this.mailService.sendNotice(incident.assignedTo.email, `Nueva incidencia: ${dto.subject}`, dto.message);

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

  async findMessages(id: string, requester: AuthenticatedUser) {
    await this.findWithAccessCheck(id, requester);
    return this.prisma.incidentMessage.findMany({
      where: { incidentId: id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Avisa a todos los involucrados menos a quien acaba de escribir (incluye al ADMIN si intervino). */
  private notifyRecipients(incident: { reportedByUserId: string; assignedToUserId: string }, excludeUserId: string) {
    return [incident.reportedByUserId, incident.assignedToUserId].filter((id) => id !== excludeUserId);
  }

  async addMessage(id: string, dto: AddIncidentMessageDto, requester: AuthenticatedUser) {
    const incident = await this.findWithAccessCheck(id, requester);
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('Esta incidencia ya está resuelta, no se pueden agregar más mensajes.');
    }

    const recipientIds = this.notifyRecipients(incident, requester.id);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incidentMessage.create({
        data: { incidentId: id, authorUserId: requester.id, body: dto.body },
        include: { author: { select: { id: true, name: true } } },
      });

      for (const recipientId of recipientIds) {
        await this.notificationsService.create(tx, {
          userId: recipientId,
          type: NotificationType.INCIDENT_MESSAGE,
          payload: `Nuevo mensaje en la incidencia "${incident.subject}".`,
        });
      }

      return created;
    });

    const recipients = [incident.reportedBy, incident.assignedTo].filter((u) => u.id !== requester.id);
    for (const recipient of recipients) {
      await this.mailService.sendNotice(recipient.email, `Nuevo mensaje: ${incident.subject}`, dto.body);
    }

    return message;
  }

  async updateStatus(id: string, newStatus: IncidentStatus, requester: AuthenticatedUser) {
    const incident = await this.findWithAccessCheck(id, requester);

    if (incident.status === IncidentStatus.ESCALATED && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Esta incidencia está escalada: solo un ADMIN puede resolverla o regresarla a revisión.');
    }
    if (!STATUS_TRANSITIONS[incident.status].includes(newStatus)) {
      throw new BadRequestException(`No se puede pasar de ${incident.status} a ${newStatus}.`);
    }

    const recipientIds = this.notifyRecipients(incident, requester.id);

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
          payload: `La incidencia "${incident.subject}" ahora está: ${newStatus}.`,
        });
      }

      return updated;
    });
  }
}
