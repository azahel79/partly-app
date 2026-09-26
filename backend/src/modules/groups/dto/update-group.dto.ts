import { ApiPropertyOptional } from '@nestjs/swagger';
import { GroupStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 70.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  pricePerSlot?: number;

  @ApiPropertyOptional({ example: 3, description: 'No puede bajar de los cupos ya ocupados' })
  @IsOptional()
  @IsInt()
  @Min(1)
  availableSlots?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billingDay?: number;

  @ApiPropertyOptional({
    enum: GroupStatus,
    description: 'FULL se calcula solo; aquí solo aplica para pausar/reabrir/cancelar el grupo.',
  })
  @IsOptional()
  @IsEnum(GroupStatus)
  status?: GroupStatus;

  @ApiPropertyOptional({ example: '646180112345678901', description: 'Cuenta/CLABE donde tus miembros te depositan.' })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;
}
