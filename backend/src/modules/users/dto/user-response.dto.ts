import { ApiProperty } from '@nestjs/swagger';
import { AuthProvider, PayoutAccountType, Role, User } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class UserResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Ana García' })
  @Expose()
  name: string;

  @ApiProperty({ example: 'ana@example.com' })
  @Expose()
  email: string;

  @ApiProperty({ example: '+52 55 1234 5678', nullable: true })
  @Expose()
  phone: string | null;

  @ApiProperty({ enum: Role, example: Role.USER })
  @Expose()
  role: Role;

  @ApiProperty({ enum: AuthProvider, example: AuthProvider.LOCAL })
  @Expose()
  authProvider: AuthProvider;

  @ApiProperty({ example: false })
  @Expose()
  emailVerified: boolean;

  @ApiProperty({ example: 'https://lh3.googleusercontent.com/a/xyz', nullable: true })
  @Expose()
  avatarUrl: string | null;

  @ApiProperty({ example: 4.8 })
  @Expose()
  @Transform(({ value }) => value?.toString())
  ratingAvg: string;

  @ApiProperty({ example: false, description: 'Derecho ARCO de Oposición: true = no recibir comunicaciones de marketing.' })
  @Expose()
  marketingOptOut: boolean;

  @Expose()
  emailNotifications: boolean;

  @Expose()
  inAppNotifications: boolean;

  @Expose()
  notifyPayments: boolean;

  @Expose()
  notifyGroups: boolean;

  @Expose()
  notifyCredentials: boolean;

  @Expose()
  notifyPayouts: boolean;

  @Expose()
  profileNameVisible: boolean;

  @Expose()
  profileAvatarVisible: boolean;

  @Expose()
  timezone: string;

  @Expose()
  payoutAccountHolder: string | null;

  @Expose()
  payoutBankName: string | null;

  @Expose()
  payoutAccountType: PayoutAccountType | null;

  @Expose()
  payoutAccountNumberLast4: string | null;

  @Expose()
  payoutVerified: boolean;

  @ApiProperty({ example: '2026-09-08T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}
