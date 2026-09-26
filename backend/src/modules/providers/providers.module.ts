import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { GroupsModule } from '../groups/groups.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { ProviderProfilesService } from './provider-profiles.service';
import { ProviderProfilesController } from './provider-profiles.controller';
import { ProviderListingsService } from './provider-listings.service';
import { ProviderListingsController } from './provider-listings.controller';
import { ProviderOrdersService } from './provider-orders.service';
import { ProviderOrdersController } from './provider-orders.controller';
import { WholesaleAccessService } from './wholesale-access.service';
import { AdminWholesaleAccessController, WholesaleAccessController } from './wholesale-access.controller';

@Module({
  imports: [NotificationsModule, MailModule, GroupsModule, CommissionsModule],
  controllers: [ProviderProfilesController, ProviderListingsController, ProviderOrdersController, WholesaleAccessController, AdminWholesaleAccessController],
  providers: [ProviderProfilesService, ProviderListingsService, ProviderOrdersService, WholesaleAccessService],
  exports: [ProviderProfilesService, ProviderListingsService, ProviderOrdersService, WholesaleAccessService],
})
export class ProvidersModule {}
