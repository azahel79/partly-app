import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminCommissionsController } from './admin-commissions.controller';
import { AdminCommissionRateController, CommissionRateController } from './commission-rates.controller';
import { CommissionRatesService } from './commission-rates.service';
import { CommissionsController, EarningsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [EarningsController, CommissionRateController, CommissionsController, AdminCommissionsController, AdminCommissionRateController],
  providers: [CommissionsService, CommissionRatesService],
  exports: [CommissionsService, CommissionRatesService],
})
export class CommissionsModule {}
