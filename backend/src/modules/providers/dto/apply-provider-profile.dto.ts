import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ApplyProviderProfileDto {
  @ApiProperty({ example: 'Streaming Wholesale MX' })
  @IsString()
  @MinLength(2)
  businessName: string;
}
