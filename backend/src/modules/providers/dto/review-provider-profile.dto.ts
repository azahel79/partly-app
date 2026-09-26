import { ApiProperty } from '@nestjs/swagger';
import { ProviderProfileStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ReviewProviderProfileDto {
  @ApiProperty({ enum: ProviderProfileStatus, example: ProviderProfileStatus.APPROVED })
  @IsEnum(ProviderProfileStatus)
  status: ProviderProfileStatus;
}
