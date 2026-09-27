import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export enum ReceiptFilter {
  UPLOADED = 'UPLOADED',
  MISSING = 'MISSING',
}

export class ListAdminPaymentsQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: ReceiptFilter })
  @IsOptional()
  @IsEnum(ReceiptFilter)
  receipt?: ReceiptFilter;

  @ApiPropertyOptional({ description: 'Filtra los movimientos a un solo grupo — para la pestaña de actividad del panel de staff.' })
  @IsOptional()
  @IsUUID('4')
  groupId?: string;

  @ApiPropertyOptional({ description: 'Busca por nombre o correo del comprador o del vendedor, o por la plataforma del grupo.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? 50 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
