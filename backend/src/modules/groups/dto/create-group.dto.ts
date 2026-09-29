import { BillingPeriod, GroupAccessType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min, MinLength, IsEnum } from 'class-validator';

export class CreateGroupDto {
  @ApiPropertyOptional({ description: 'ID de un plan del catálogo (opcional). Si no lo mandas, manda platformName + maxSlots.' })
  @IsOptional()
  @IsUUID('4')
  planId?: string;

  @ApiPropertyOptional({ example: 'Netflix', description: 'Nombre de la plataforma, si no eliges un plan del catálogo.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  platformName?: string;

  @ApiPropertyOptional({ example: 'Premium 4 pantallas', description: 'Cómo se llama tu plan/tier (opcional).' })
  @IsOptional()
  @IsString()
  tierName?: string;

  @ApiPropertyOptional({
    example: 4,
    description: 'Cupos totales de tu plan (incluyéndote a ti), si no eliges uno del catálogo. Mínimo 2.',
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  maxSlots?: number;

  @ApiPropertyOptional({ example: 249.0, description: 'Lo que tú pagas por esta suscripción (opcional, solo de referencia).' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  officialPrice?: number;

  @ApiProperty({ example: 65.0, description: 'Lo que le cobras a cada miembro por su cupo' })
  @IsNumber()
  @IsPositive()
  pricePerSlot: number;

  @ApiProperty({
    example: 3,
    description:
      'Cupos que ofreces a OTROS (sin contar el tuyo). No puede superar maxSlots del plan menos 1 (tu propio cupo).',
  })
  @IsInt()
  @Min(1)
  availableSlots: number;

  @ApiProperty({ example: 15, minimum: 1, maximum: 31, description: 'Día del mes en que se cobra' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billingDay?: number;

  @ApiPropertyOptional({
    example: '646180112345678901',
    description: 'Cuenta/CLABE donde tus miembros te depositan — la ven para saber a dónde pagar.',
  })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional({ enum: BillingPeriod, default: BillingPeriod.MONTHLY, description: 'Cada cuánto se cobra: 1, 2, 3, 6 o 12 meses.' })
  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;

  @ApiPropertyOptional({
    enum: GroupAccessType,
    default: GroupAccessType.CREDENTIALS,
    description: 'INVITE_LINK = los miembros entran con un link al grupo familiar (solo YouTube, Spotify y Canva).',
  })
  @IsOptional()
  @IsEnum(GroupAccessType)
  accessType?: GroupAccessType;
}
