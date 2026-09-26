import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ProviderOrderCredentialResponseDto {
  @ApiProperty({ example: 'cuenta.mayoreo@example.com' })
  @Expose()
  username: string;

  @ApiProperty({ example: 'ContraseñaRealDeLaCuenta123' })
  @Expose()
  password: string;

  @ApiProperty({ nullable: true })
  @Expose()
  notes: string | null;

  @ApiProperty({ example: '2026-09-13T10:00:00.000Z' })
  @Expose()
  deliveredAt: Date;

  constructor(partial: ProviderOrderCredentialResponseDto) {
    Object.assign(this, partial);
  }
}
