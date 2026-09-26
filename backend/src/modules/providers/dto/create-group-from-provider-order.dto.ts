import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class CreateGroupFromProviderOrderDto {
  @ApiProperty({ example: 65.0, description: 'Lo que le cobras a cada miembro por su cupo' })
  @IsNumber()
  @IsPositive()
  pricePerSlot: number;

  @ApiProperty({
    example: 3,
    description: 'Cupos que ofreces a OTROS (sin contar el tuyo). No puede superar los cupos del plan comprado.',
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
}
