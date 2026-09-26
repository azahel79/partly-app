import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentContext } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateIncidentDto {
  @ApiProperty({
    enum: IncidentContext,
    description: 'GROUP_MEMBERSHIP: reclamo de un comprador sobre su membresía. PROVIDER_ORDER: reclamo de un vendedor sobre una compra a un proveedor.',
  })
  @IsEnum(IncidentContext)
  context: IncidentContext;

  @ApiPropertyOptional({ description: 'Requerido si context = GROUP_MEMBERSHIP' })
  @IsOptional()
  @IsUUID('4')
  groupMembershipId?: string;

  @ApiPropertyOptional({ description: 'Requerido si context = PROVIDER_ORDER' })
  @IsOptional()
  @IsUUID('4')
  providerOrderId?: string;

  @ApiProperty({ example: 'La cuenta no permite iniciar sesión' })
  @IsString()
  @MinLength(3)
  subject: string;

  @ApiProperty({ example: 'Desde ayer me sale contraseña incorrecta aunque no la he cambiado.' })
  @IsString()
  @MinLength(1)
  message: string;
}
