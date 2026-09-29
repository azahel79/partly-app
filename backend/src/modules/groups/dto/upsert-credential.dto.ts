import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, IsUrl, MaxLength } from 'class-validator';

export class UpsertCredentialDto {
  @ApiPropertyOptional({ example: 'cuenta.compartida@example.com', description: 'Grupos con acceso por credenciales.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  username?: string;

  @ApiPropertyOptional({ example: 'ContraseñaRealDeNetflix123', description: 'Grupos con acceso por credenciales.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @ApiPropertyOptional({ example: 'https://www.spotify.com/mx/family/join/invite/abc123', description: 'Grupos con acceso por invitación.' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] }, { message: 'El link de invitación debe ser una dirección web completa (https://…).' })
  @MaxLength(500)
  inviteLink?: string;

  @ApiPropertyOptional({ example: 'El perfil "Casa" es para los miembros, no toquen los otros.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Rotación mensual de seguridad' })
  @IsOptional()
  @IsString()
  changeReason?: string;
}
