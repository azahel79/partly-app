import { ApiProperty } from '@nestjs/swagger';
import { Incident, IncidentContext, IncidentStatus, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type PlanSummary = { tierName: string; platform: { name: string; logoUrl: string | null } };

type IncidentWithRelations = Incident & {
  reportedBy: Pick<User, 'id' | 'name'>;
  assignedTo: Pick<User, 'id' | 'name'>;
  groupMembership?: {
    group: { id: string; plan: PlanSummary; sourceProviderOrder?: { id: string; credential: { panelUrlEncrypted: string | null } | null } | null };
    profile: { label: string } | null;
  } | null;
  providerOrder?: { id: string; listing: { plan: PlanSummary } } | null;
};

/** De qué se trata la incidencia, para mostrarlo sin tener que adivinar. */
export interface IncidentAbout {
  kind: 'GROUP' | 'WHOLESALE';
  platformName: string;
  platformLogoUrl: string | null;
  tierName: string;
  /** Grupo del reporte (solo en incidencias de un grupo). */
  groupId: string | null;
  /** Perfil de la cuenta que tiene asignado quien reportó. */
  profileLabel: string | null;
  providerOrderId: string | null;
  /** El grupo usa una cuenta de mayoreo cuya contraseña administra Partly: el vendedor pide el cambio, no lo hace. */
  credentialsManagedByPartly: boolean;
}

class PartySummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;
}

@Exclude()
export class IncidentResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ enum: IncidentContext })
  @Expose()
  context: IncidentContext;

  @ApiProperty({ nullable: true })
  @Expose()
  groupMembershipId: string | null;

  @ApiProperty({ nullable: true })
  @Expose()
  providerOrderId: string | null;

  @ApiProperty({ type: PartySummaryDto })
  @Expose()
  reportedBy: PartySummaryDto;

  @ApiProperty({ type: PartySummaryDto })
  @Expose()
  assignedTo: PartySummaryDto;

  @ApiProperty({ example: 'La cuenta no permite iniciar sesión' })
  @Expose()
  subject: string;

  @ApiProperty({ enum: IncidentStatus, example: IncidentStatus.OPEN })
  @Expose()
  status: IncidentStatus;

  @ApiProperty({ example: '2026-09-13T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ nullable: true })
  @Expose()
  resolvedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Última vez que escribió el responsable.' })
  @Expose()
  lastAssigneeReplyAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Cuándo le pidió Partly una respuesta al responsable.' })
  @Expose()
  responseRequestedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Hasta cuándo tiene para responder (null si ya respondió o si ya venció el plazo).' })
  @Expose()
  responseDueAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Grupo (con el perfil de quien reportó) o compra de mayoreo de la que trata.' })
  @Expose()
  about: IncidentAbout | null;

  constructor(incident: IncidentWithRelations) {
    this.id = incident.id;
    this.context = incident.context;
    this.groupMembershipId = incident.groupMembershipId;
    this.providerOrderId = incident.providerOrderId;
    this.reportedBy = { id: incident.reportedBy.id, name: incident.reportedBy.name };
    this.assignedTo = { id: incident.assignedTo.id, name: incident.assignedTo.name };
    this.subject = incident.subject;
    this.status = incident.status;
    this.createdAt = incident.createdAt;
    this.resolvedAt = incident.resolvedAt;
    this.lastAssigneeReplyAt = incident.lastAssigneeReplyAt;
    this.responseRequestedAt = incident.responseRequestedAt;
    this.responseDueAt = incident.responseDueAt;
    const membership = incident.groupMembership;
    const order = incident.providerOrder;
    const plan = membership?.group.plan ?? order?.listing.plan ?? null;
    this.about = plan
      ? {
          kind: membership ? 'GROUP' : 'WHOLESALE',
          platformName: plan.platform.name,
          platformLogoUrl: plan.platform.logoUrl,
          tierName: plan.tierName,
          groupId: membership?.group.id ?? null,
          profileLabel: membership?.profile?.label ?? null,
          providerOrderId: order?.id ?? membership?.group.sourceProviderOrder?.id ?? null,
          credentialsManagedByPartly: !!membership?.group.sourceProviderOrder?.credential && !membership.group.sourceProviderOrder.credential.panelUrlEncrypted,
        }
      : null;
  }
}
