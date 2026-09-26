import { ApiProperty } from '@nestjs/swagger';
import { Incident, IncidentContext, IncidentStatus, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type IncidentWithRelations = Incident & {
  reportedBy: Pick<User, 'id' | 'name'>;
  assignedTo: Pick<User, 'id' | 'name'>;
};

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
  }
}
