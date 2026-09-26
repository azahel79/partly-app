import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAutoRenewDto {
  @ApiProperty({ example: false, description: 'false = solo quiero los días de este ciclo; mi lugar queda libre al terminar.' })
  @IsBoolean()
  autoRenew!: boolean;
}
