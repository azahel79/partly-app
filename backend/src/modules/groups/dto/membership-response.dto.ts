import { ApiProperty } from '@nestjs/swagger';
import { GroupMembership, GroupProfile, MembershipStatus, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

export type RenewalStatus = 'RENEWED' | 'IN_REVIEW' | 'PENDING' | 'NOT_RENEWING' | 'RESERVED_NEXT';

type MembershipWithUser = GroupMembership & {
  user: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  profile?: Pick<GroupProfile, 'id' | 'label'> | null;
  renewalStatus?: RenewalStatus | null;
};

class MemberSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ nullable: true })
  @Expose()
  avatarUrl: string | null;
}

class MemberProfileDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  label: string;
}

@Exclude()
export class MembershipResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  groupId: string;

  @ApiProperty({ type: MemberSummaryDto })
  @Expose()
  user: MemberSummaryDto;

  @ApiProperty({ enum: MembershipStatus, example: MembershipStatus.PENDING_PAYMENT })
  @Expose()
  status: MembershipStatus;

  @ApiProperty({ example: true })
  @Expose()
  autoRenew: boolean;

  @ApiProperty({ example: '2026-09-09T10:00:00.000Z' })
  @Expose()
  joinedAt: Date;

  @ApiProperty({ nullable: true })
  @Expose()
  leftAt: Date | null;

  @ApiProperty({ example: '2026-10-15T00:00:00.000Z' })
  @Expose()
  currentPeriodEnd: Date;

  @ApiProperty({ nullable: true, enum: ['RENEWED', 'IN_REVIEW', 'PENDING', 'NOT_RENEWING', 'RESERVED_NEXT'], description: 'Solo lo ve el vendedor en grupos iniciados: si el miembro ya renovó, está por pagar, no renovará, o es quien apartó un lugar que se libera.' })
  @Expose()
  renewalStatus: RenewalStatus | null;

  @ApiProperty({ type: MemberProfileDto, nullable: true, description: 'Perfil de la cuenta compartida asignado a este miembro (null si aún no se le asigna uno).' })
  @Expose()
  profile: MemberProfileDto | null;

  constructor(membership: MembershipWithUser) {
    this.id = membership.id;
    this.groupId = membership.groupId;
    this.user = { id: membership.user.id, name: membership.user.name, avatarUrl: membership.user.avatarUrl };
    this.status = membership.status;
    this.autoRenew = membership.autoRenew;
    this.joinedAt = membership.joinedAt;
    this.leftAt = membership.leftAt;
    this.currentPeriodEnd = membership.currentPeriodEnd;
    this.renewalStatus = membership.renewalStatus ?? null;
    this.profile = membership.profile ? { id: membership.profile.id, label: membership.profile.label } : null;
  }
}
