import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsService } from './reviews.service';
import { ReviewsController, ReviewsListController } from './reviews.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [ReviewsController, ReviewsListController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
