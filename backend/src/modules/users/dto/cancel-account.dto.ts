import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelAccountDto {
  @ApiPropertyOptional({ description: 'Obligatoria para cuentas con contraseña local.' })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
