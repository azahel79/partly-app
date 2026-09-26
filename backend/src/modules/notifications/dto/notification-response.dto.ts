import { ApiProperty } from '@nestjs/swagger';
import { Notification, NotificationType } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class NotificationResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: NotificationType, example: NotificationType.PAYMENT_DUE_SOON })
  @Expose()
  type: NotificationType;

  @ApiProperty()
  @Expose()
  payload: string;

  @ApiProperty({ nullable: true })
  @Expose()
  readAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Grupo al que se refiere este aviso, si aplica.' })
  @Expose()
  groupId: string | null;

  @ApiProperty({ nullable: true, example: 'Netflix · Premium 4 pantallas', description: 'Plataforma y plan del grupo al que se refiere el aviso.' })
  @Expose()
  groupLabel: string | null;

  @ApiProperty({ example: '2026-09-11T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  constructor(notification: Notification & { group?: { plan: { tierName: string; platform: { name: string } } } | null }) {
    this.id = notification.id;
    this.type = notification.type;
    this.payload = notification.payload;
    this.readAt = notification.readAt;
    this.groupId = notification.groupId;
    this.groupLabel = notification.group ? `${notification.group.plan.platform.name} · ${notification.group.plan.tierName}` : null;
    this.createdAt = notification.createdAt;
  }
}
