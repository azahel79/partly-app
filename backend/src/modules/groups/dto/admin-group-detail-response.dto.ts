import { ApiProperty } from '@nestjs/swagger';
import { Group, Plan, Platform, User } from '@prisma/client';
import { Expose } from 'class-transformer';
import { GroupResponseDto } from './group-response.dto';

type AdminGroupWithRelations = Group & {
  plan: Pick<Plan, 'id' | 'tierName' | 'billingPeriod'> & {
    platform: Pick<Platform, 'id' | 'name' | 'logoUrl'> & { categories: { category: { name: string } }[] };
  };
  owner: Pick<User, 'id' | 'name' | 'avatarUrl' | 'ratingAvg' | 'createdAt' | 'emailVerified' | 'profileNameVisible' | 'profileAvatarVisible'>;
  credential: { id: string } | null;
};

/**
 * Solo para el panel de staff (`GET /groups/admin/:id`) — añade campos que jamás deben
 * llegar al endpoint público `GET /groups/:id` (notas internas y el conteo de ventas del
 * vendedor; `hasCredentials` ya lo expone GroupResponseDto para todo el mundo, no hace
 * falta repetirlo aquí). Por eso es un DTO aparte y no se tocó GroupResponseDto. Hereda
 * el @Exclude() de la clase base — por eso solo hace falta @Expose() en los campos nuevos.
 */
export class AdminGroupDetailResponseDto extends GroupResponseDto {
  @ApiProperty({ nullable: true, example: 'Vendedor confiable, ya tiene 3 grupos aprobados antes.' })
  @Expose()
  internalNotes: string | null;

  @ApiProperty({ example: 128, description: 'Pagos PAID confirmados en todos los grupos de este vendedor.' })
  @Expose()
  sellerSalesCount: number;

  constructor(group: AdminGroupWithRelations, sellerSalesCount: number) {
    super(group);
    this.internalNotes = group.internalNotes;
    this.sellerSalesCount = sellerSalesCount;
  }
}
