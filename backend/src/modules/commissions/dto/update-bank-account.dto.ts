import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateBankAccountDto {
  @ApiProperty({ example: 'Partly Tecnología SA de CV' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  holder: string;

  @ApiProperty({ example: 'BBVA México' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  bankName: string;

  @ApiProperty({ example: '012180001234567897', description: 'CLABE interbancaria de 18 dígitos.' })
  @Matches(/^\d{18}$/, { message: 'La CLABE debe tener 18 dígitos.' })
  clabe: string;

  @ApiPropertyOptional({ example: 'Escribe tu nombre en el concepto de la transferencia.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
