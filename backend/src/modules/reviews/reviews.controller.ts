import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Query, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ReviewsService } from './reviews.service';
import { UpsertReviewDto } from './dto/upsert-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { PaginatedReviewsResponseDto } from './dto/paginated-reviews-response.dto';

@ApiTags('groups')
@Controller('groups/:id/review')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crea o actualiza tu reseña de este grupo (solo si fuiste miembro)',
    description:
      'Una reseña por persona por grupo (se actualiza si ya tenías una). El promedio se refleja en el ' +
      'ratingAvg del owner, no en el grupo individual.',
  })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Es tu propio grupo, o nunca fuiste miembro.' })
  async upsert(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: UpsertReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviewsService.upsert(groupId, user.id, dto);
    return new ReviewResponseDto(review);
  }

  @Get('eligibility')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Si ya puedes reseñar este grupo (pago validado y 7 días con el servicio) y, si no, por qué' })
  async eligibility(@Param('id', ParseUUIDPipe) groupId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reviewsService.eligibility(groupId, user.id);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina tu reseña de este grupo' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'No tienes una reseña en este grupo.' })
  async remove(@Param('id', ParseUUIDPipe) groupId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.reviewsService.remove(groupId, user.id);
  }
}

@ApiTags('groups')
@Controller('groups/:id/reviews')
export class ReviewsListController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Put(':reviewId/reply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'El vendedor responde públicamente a una reseña de su grupo' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  async reply(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReplyReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    return new ReviewResponseDto(await this.reviewsService.reply(groupId, reviewId, user.id, dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista las reseñas de un grupo (público)' })
  @ApiResponse({ status: 200, type: PaginatedReviewsResponseDto })
  async findAll(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<PaginatedReviewsResponseDto> {
    const { data, total } = await this.reviewsService.findMany(groupId, query);
    return {
      data: data.map((r) => new ReviewResponseDto(r)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }
}
