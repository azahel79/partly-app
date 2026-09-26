import { ApiProperty } from '@nestjs/swagger';
import { ProviderProfileResponseDto } from './provider-profile-response.dto';

export class PaginatedProviderProfilesResponseDto {
  @ApiProperty({ type: [ProviderProfileResponseDto] })
  data: ProviderProfileResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
