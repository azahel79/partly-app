import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutAccountType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ana García' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/ana.png' })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  @Matches(/^(https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/, {
    message: 'La imagen debe ser una URL segura o una imagen PNG, JPEG o WebP.',
  })
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'Elimina la fotografía actual.' })
  @IsOptional()
  @IsBoolean()
  clearAvatar?: boolean;

  @ApiPropertyOptional({ description: 'Obligatoria si envías newPassword (cuentas locales, no Google)' })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiPropertyOptional({
    example: 'NuevaContraseñaSegura123',
    minLength: 8,
    description: 'Mínimo 8 caracteres, con al menos una letra y un número.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'La contraseña debe incluir al menos una letra y un número.' })
  newPassword?: string;

  @ApiPropertyOptional({
    description: 'Derecho ARCO de Oposición: si es true, dejas de recibir comunicaciones de marketing/promocionales.',
  })
  @IsOptional()
  @IsBoolean()
  marketingOptOut?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyPayments?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGroups?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyCredentials?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyPayouts?: boolean;

  @IsOptional()
  @IsBoolean()
  profileNameVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  profileAvatarVisible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payoutAccountHolder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  payoutBankName?: string;

  @ApiPropertyOptional({
    example: '012180015978622507',
    description: 'CLABE de 18 dígitos o número de tarjeta de débito de 16 dígitos.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{16}|\d{18})$/, { message: 'Usa una tarjeta de débito de 16 dígitos o una CLABE de 18.' })
  payoutAccountNumber?: string;

  @ApiPropertyOptional({ enum: PayoutAccountType })
  @IsOptional()
  @IsEnum(PayoutAccountType)
  payoutAccountType?: PayoutAccountType;

  @IsOptional()
  @IsBoolean()
  clearPayoutAccount?: boolean;
}
