import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { CommissionChargeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListAdminCommissionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CommissionChargeStatus })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(CommissionChargeStatus)
  status?: CommissionChargeStatus;

  @ApiPropertyOptional({ description: 'Busca por nombre o correo del vendedor.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'true = solo los que ya pasaron su fecha límite sin pagar.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  overdueOnly?: boolean;
}
