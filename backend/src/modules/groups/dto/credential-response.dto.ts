import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class CredentialResponseDto {
  @ApiProperty({ example: 'cuenta.compartida@example.com' })
  @Expose()
  username: string;

  @ApiProperty({ example: 'ContraseñaRealDeNetflix123' })
  @Expose()
  password: string;

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
