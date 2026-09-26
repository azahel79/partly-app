import { ApiProperty } from '@nestjs/swagger';
import { CredentialHistory, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type HistoryWithChangedBy = CredentialHistory & { changedBy: Pick<User, 'id' | 'name'> };

@Exclude()
export class CredentialHistoryResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  changedBy: { id: string; name: string };

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  @Expose()
  changedAt: Date;

  @ApiProperty({ nullable: true, example: 'Rotación mensual de seguridad' })
  @Expose()
  changeReason: string | null;

  constructor(history: HistoryWithChangedBy) {
    this.id = history.id;
    this.changedBy = { id: history.changedBy.id, name: history.changedBy.name };
    this.changedAt = history.changedAt;
    this.changeReason = history.changeReason;
  }
}
