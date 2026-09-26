import { ApiProperty } from '@nestjs/swagger';
import { ProviderProfile, ProviderProfileStatus, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type ProviderProfileWithUser = ProviderProfile & { user?: Pick<User, 'id' | 'name' | 'email'> };

class ApplicantSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  email: string;
}

@Exclude()
export class ProviderProfileResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty({ type: ApplicantSummaryDto, nullable: true, description: 'Solo viene poblado en el listado de ADMIN.' })
  @Expose()
  user: ApplicantSummaryDto | null;

  @ApiProperty({ example: 'Streaming Wholesale MX' })
  @Expose()
  businessName: string;

  @ApiProperty({ enum: ProviderProfileStatus, example: ProviderProfileStatus.PENDING })
  @Expose()
  status: ProviderProfileStatus;

  @ApiProperty({ example: '2026-09-13T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  constructor(profile: ProviderProfileWithUser) {
    this.id = profile.id;
    this.userId = profile.userId;
    this.user = profile.user ? { id: profile.user.id, name: profile.user.name, email: profile.user.email } : null;
    this.businessName = profile.businessName;
    this.status = profile.status;
    this.createdAt = profile.createdAt;
  }
}
