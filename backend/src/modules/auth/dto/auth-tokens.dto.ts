import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensDto {
  @ApiProperty({ description: 'JWT de corta duración para autorizar peticiones (Authorization: Bearer ...).' })
  accessToken: string;

  @ApiProperty({ description: 'Token opaco de larga duración. Se usa una sola vez: cada refresh emite uno nuevo.' })
  refreshToken: string;
}
