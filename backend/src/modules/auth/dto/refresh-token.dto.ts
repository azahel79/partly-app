import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'f3a1c9d2b8e7...opaque-refresh-token' })
  @IsString()
  refreshToken: string;
}
