import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class ReviewPaymentReceiptDto {
  @ApiProperty({ example: true, description: 'true = ya te cayó el dinero, márcalo como pagado. false = recházalo.' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ example: 'El monto no coincide con lo que me depositaron.' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Perfil de la cuenta compartida que le asignas al comprador. Obligatorio al aprobar su primer pago ' +
      '(cuando todavía no tiene un perfil asignado); se ignora en renovaciones, donde ya conserva el suyo.',
  })
  @IsOptional()
  @IsUUID('4')
  profileId?: string;
}
