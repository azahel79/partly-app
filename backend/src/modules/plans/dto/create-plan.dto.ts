import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ description: 'ID del servicio (Netflix, Spotify...) al que pertenece este plan' })
  @IsUUID('4')
  platformId: string;

  @ApiProperty({ example: 'Premium 4 pantallas' })
  @IsString()
  @MinLength(2)
  tierName: string;

  @ApiProperty({ example: 249.0, description: 'Precio real del proveedor (referencia, no lo que cobra cada grupo)' })
  @IsNumber()
  @IsPositive()
  officialPrice: number;

  @ApiProperty({ example: 4, description: 'Cupos totales que permite este plan según el proveedor' })
  @IsInt()
  @Min(1)
  maxSlots: number;

  @ApiPropertyOptional({ enum: BillingPeriod, default: BillingPeriod.MONTHLY })
  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;

  @ApiProperty({ example: 15, description: '% que se queda la plataforma por cada slot vendido bajo este plan' })
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
