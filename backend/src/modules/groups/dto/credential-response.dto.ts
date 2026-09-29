import { ApiProperty } from '@nestjs/swagger';
import { GroupAccessType } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class CredentialResponseDto {
  @ApiProperty({ enum: GroupAccessType, description: 'Credenciales (correo y contraseña) o link de invitación al grupo familiar.' })
  @Expose()
  accessType: GroupAccessType;

  @ApiProperty({ nullable: true, example: 'cuenta.compartida@example.com' })
  @Expose()
  username: string | null;

  @ApiProperty({ nullable: true, example: 'ContraseñaRealDeNetflix123' })
  @Expose()
  password: string | null;

  @ApiProperty({ nullable: true, example: 'https://www.spotify.com/mx/family/join/invite/abc123' })
  @Expose()
  inviteLink: string | null;

  @ApiProperty({ nullable: true })
  @Expose()
  notes: string | null;

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  @Expose()
  updatedAt: Date;

  constructor(partial: CredentialResponseDto) {
    Object.assign(this, partial);
  }
}
