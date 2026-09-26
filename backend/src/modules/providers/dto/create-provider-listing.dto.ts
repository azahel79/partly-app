import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateProviderListingDto {
  @ApiPropertyOptional({ description: 'ID de un plan ya publicado del catálogo (opcional). Si no lo mandas, define la plataforma tú mismo con los campos de abajo.' })
  @IsOptional()
  @IsUUID('4')
  planId?: string;

  @ApiPropertyOptional({ example: 'Netflix', description: 'Nombre de la plataforma, si no eliges un plan existente. Tú tienes el control total de qué publicas.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  platformName?: string;

  @ApiPropertyOptional({ example: 'Premium 4 pantallas', description: 'Nombre del plan/tier que estás publicando.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  tierName?: string;

  @ApiPropertyOptional({ example: 99.0, description: 'Precio oficial de esta suscripción — lo que ve el vendedor para calcular su margen.' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  officialPrice?: number;

  @ApiPropertyOptional({ example: 2, description: 'Cupos/perfiles totales que trae esta cuenta.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSlots?: number;

  @ApiPropertyOptional({ enum: BillingPeriod, default: BillingPeriod.MONTHLY })
  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;

  @ApiProperty({ example: 45.0, description: 'Precio al por mayor que le cobras al vendedor' })
  @IsNumber()
  @IsPositive()
  wholesalePrice: number;

  @ApiProperty({ example: 10, description: 'Cuántas cuentas de este tipo tienes disponibles ahora' })
  @IsInt()
  @Min(0)
  stockQuantity: number;

  @ApiPropertyOptional({ default: true, description: 'Renovable = la misma cuenta sigue vigente si el vendedor paga la renovación. No renovable = se cambia cada periodo y hay que comprar una reposición.' })
  @IsOptional()
  @IsBoolean()
  renewable?: boolean;

  @ApiPropertyOptional({ default: 30, example: 30, description: 'Días de vigencia de cada compra (o de cada renovación).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(400)
  validityDays?: number;
}
