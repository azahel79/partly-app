import { ApiProperty } from '@nestjs/swagger';
import { Review, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type ReviewWithAuthor = Review & { author: Pick<User, 'id' | 'name' | 'avatarUrl' | 'profileNameVisible' | 'profileAvatarVisible'> };

class ReviewAuthorDto {
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

@Exclude()
export class ReviewResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ type: ReviewAuthorDto })
  @Expose()
  author: ReviewAuthorDto;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @Expose()
  rating: number;

  @ApiProperty({ nullable: true })
  @Expose()
  comment: string | null;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ nullable: true, description: 'Respuesta pública del vendedor.' })
  @Expose()
  sellerReply: string | null;

  @ApiProperty({ nullable: true })
  @Expose()
  sellerReplyAt: Date | null;

  constructor(review: ReviewWithAuthor) {
    this.id = review.id;
    this.author = {
      id: review.author.id,
      name: review.author.profileNameVisible ? review.author.name : 'Miembro de Vakeva',
      avatarUrl: review.author.profileAvatarVisible ? review.author.avatarUrl : null,
    };
    this.rating = review.rating;
    this.comment = review.comment;
    this.createdAt = review.createdAt;
    this.sellerReply = review.sellerReply;
    this.sellerReplyAt = review.sellerReplyAt;
  }
}
