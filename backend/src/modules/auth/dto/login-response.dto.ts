import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { AuthTokensDto } from './auth-tokens.dto';

export class LoginResponseDto extends AuthTokensDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
