import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

/**
 * Cómo se entrega una cuenta de mayoreo: con credenciales (correo y contraseña) o con el link de un panel donde el
 * vendedor administra el acceso de sus usuarios (con usuario y contraseña del panel, si los pide).
 */
export class DeliverProviderOrderCredentialDto {
  @ApiPropertyOptional({ example: 'cuenta.mayoreo@example.com', description: 'Correo o usuario de la cuenta (o del panel).' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  username?: string;

  @ApiPropertyOptional({ example: 'ContraseñaRealDeLaCuenta123', description: 'Contraseña de la cuenta (o del panel).' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @ApiPropertyOptional({ example: 'https://panel.proveedor.com/cliente/abc', description: 'Entrega por panel: link donde el vendedor da acceso a sus usuarios.' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] }, { message: 'El link del panel debe ser una dirección web completa (https://…).' })
  @MaxLength(500)
  panelUrl?: string;

  @ApiPropertyOptional({ example: 'Usa el perfil 3, PIN 1234.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
