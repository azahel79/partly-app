import { ApiProperty } from '@nestjs/swagger';
import { GroupProfile } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type ProfileWithAssignment = GroupProfile & {
  assignedMembership: { id: string; user: { id: string; name: string } } | null;
};

class AssignedToDto {
  @ApiProperty()
  @Expose()
  membershipId: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  userName: string;
}

@Exclude()
export class GroupProfileResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  label: string;

  @ApiProperty({ type: AssignedToDto, nullable: true })
  @Expose()
  assignedTo: AssignedToDto | null;

  constructor(profile: ProfileWithAssignment) {
    this.id = profile.id;
    this.label = profile.label;
    this.assignedTo = profile.assignedMembership
      ? {
          membershipId: profile.assignedMembership.id,
          userId: profile.assignedMembership.user.id,
          userName: profile.assignedMembership.user.name,
        }
      : null;
  }
}
