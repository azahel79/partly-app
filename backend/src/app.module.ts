import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { PlansModule } from './modules/plans/plans.module';
import { GroupsModule } from './modules/groups/groups.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: (config) => {
        const { error, value } = validationSchema.validate(config, {
          abortEarly: false,
          allowUnknown: true,
        });
        if (error) throw error;
        return value;
      },
    }),
    // Límite general anti fuerza-bruta/spam; las rutas de auth sensibles
    // (login, register, refresh) usan un límite más estricto vía @Throttle().
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    PlatformsModule,
    PlansModule,
    GroupsModule,
    PaymentsModule,
    WalletModule,
    NotificationsModule,
    ReviewsModule,
    PayoutsModule,
    ProvidersModule,
    SupportModule,
    AdminModule,
    CommissionsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
