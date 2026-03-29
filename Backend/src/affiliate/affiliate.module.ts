import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { QueueModule } from '../queues/queue.module';
import { AffiliateController } from './controllers/affiliate.controller';
import { ReferralController } from './controllers/referral.controller';
import { CommissionController } from './controllers/commission.controller';
import { PayoutController } from './controllers/payout.controller';
import { AffiliateService } from './services/affiliate.service';
import { ReferralService } from './services/referral.service';
import { CommissionService } from './services/commission.service';
import { PayoutService } from './services/payout.service';
import { FraudDetectionService } from './services/fraud-detection.service';
import { AnalyticsService } from './services/analytics.service';
import { CodeGenerationService } from './services/code-generation.service';
import { ExternalNetworkService } from './services/external-network.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([]),
    AuthModule,
    PrismaModule,
    NotificationModule,
    QueueModule,
  ],
  controllers: [
    AffiliateController,
    ReferralController,
    CommissionController,
    PayoutController,
  ],
  providers: [
    AffiliateService,
    ReferralService,
    CommissionService,
    PayoutService,
    FraudDetectionService,
    AnalyticsService,
    CodeGenerationService,
    ExternalNetworkService,
  ],
  exports: [
    AffiliateService,
    ReferralService,
    CommissionService,
    PayoutService,
    FraudDetectionService,
    AnalyticsService,
    CodeGenerationService,
    ExternalNetworkService,
  ],
})
export class AffiliateModule {}
