import { ApiProperty } from '@nestjs/swagger';
import { IncidentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateIncidentStatusDto {
  @ApiProperty({ enum: IncidentStatus, example: IncidentStatus.IN_REVIEW })
  @IsEnum(IncidentStatus)
  status: IncidentStatus;
}
