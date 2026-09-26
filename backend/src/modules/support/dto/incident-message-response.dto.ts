import { ApiProperty } from '@nestjs/swagger';
import { IncidentMessage, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type MessageWithAuthor = IncidentMessage & { author: Pick<User, 'id' | 'name'> };

@Exclude()
export class IncidentMessageResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  author: { id: string; name: string };

  @ApiProperty({ example: 'Ya revisé, parece que alguien más cambió el perfil.' })
  @Expose()
  body: string;

  @ApiProperty({ example: '2026-09-13T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  constructor(message: MessageWithAuthor) {
    this.id = message.id;
    this.author = { id: message.author.id, name: message.author.name };
    this.body = message.body;
    this.createdAt = message.createdAt;
  }
}
