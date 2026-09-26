import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminCommissionsController } from './admin-commissions.controller';
import { CommissionsController, EarningsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [EarningsController, CommissionsController, AdminCommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
