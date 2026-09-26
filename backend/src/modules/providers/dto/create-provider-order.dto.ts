import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateProviderOrderDto {
  @ApiProperty({ description: 'Servicio de proveedor que quieres comprar' })
  @IsUUID('4')
  listingId: string;
}
