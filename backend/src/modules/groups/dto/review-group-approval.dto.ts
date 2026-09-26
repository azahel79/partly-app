import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GroupApprovalStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReviewGroupApprovalDto {
  @ApiProperty({ enum: GroupApprovalStatus, example: GroupApprovalStatus.APPROVED })
  @IsEnum(GroupApprovalStatus)
  status: GroupApprovalStatus;

  @ApiPropertyOptional({
    example: 'La plataforma que describes no está permitida en el catálogo de Vakeva.',
    description: 'Obligatorio si status es REJECTED — el vendedor lo ve tal cual.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    example: 12,
    description: 'Obligatorio si status es APPROVED — % que se queda Vakeva de cada cobro a los miembros de este grupo (rango permitido 10%-15%).',
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(15)
  commissionPercentage?: number;
}
