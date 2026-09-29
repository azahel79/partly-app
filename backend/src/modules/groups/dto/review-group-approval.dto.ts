import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GroupApprovalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewGroupApprovalDto {
  @ApiProperty({ enum: GroupApprovalStatus, example: GroupApprovalStatus.APPROVED })
  @IsEnum(GroupApprovalStatus)
  status: GroupApprovalStatus;

  @ApiPropertyOptional({
    example: 'La plataforma que describes no está permitida en el catálogo de Partly.',
    description: 'Obligatorio si status es REJECTED — el vendedor lo ve tal cual.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
