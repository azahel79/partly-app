import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { DeliverProviderOrderCredentialDto } from './deliver-provider-order-credential.dto';

/** Partly corrige o cambia las credenciales de una cuenta de mayoreo ya entregada. */
export class UpdateProviderOrderCredentialDto extends DeliverProviderOrderCredentialDto {
  @ApiPropertyOptional({ example: 'Cambiamos la contraseña por seguridad', description: 'Se le muestra al vendedor y a los miembros de su grupo.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  changeReason?: string;
}
