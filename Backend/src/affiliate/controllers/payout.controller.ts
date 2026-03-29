import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutService } from '../services/payout.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PayoutStatus } from '@prisma/client';

@ApiTags('payout')
@Controller('payout')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Get('history')
  @ApiOperation({ summary: 'Get payout history' })
  @ApiResponse({ status: 200, description: 'Payout history retrieved successfully' })
  async getPayoutHistory(
    @Request() req,
    @Query() filters: {
      status?: PayoutStatus;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const affiliate = await this.getAffiliateFromRequest(req);
    
    const startDate = filters.startDate ? new Date(filters.startDate) : undefined;
    const endDate = filters.endDate ? new Date(filters.endDate) : undefined;
    
    return await this.payoutService.getPayoutHistory(affiliate.id, {
      ...filters,
      startDate,
      endDate,
    });
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending commissions' })
  @ApiResponse({ status: 200, description: 'Pending commissions retrieved successfully' })
  async getPendingCommissions(@Request() req) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.payoutService.getPendingCommissions(affiliate.id);
  }

  @Post('request-manual')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request manual payout' })
  @ApiResponse({ status: 201, description: 'Payout request submitted successfully' })
  async requestManualPayout(@Request() req) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.payoutService.requestManualPayout(affiliate.id);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get payout statistics' })
  @ApiResponse({ status: 200, description: 'Payout statistics retrieved successfully' })
  async getPayoutStatistics(@Request() req) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.payoutService.getPayoutStatistics(affiliate.id);
  }

  @Put('retry/:payoutId')
  @ApiOperation({ summary: 'Retry failed payout' })
  @ApiResponse({ status: 200, description: 'Payout retry initiated successfully' })
  async retryFailedPayout(@Request() req, @Param('payoutId') payoutId: string) {
    const affiliate = await this.getAffiliateFromRequest(req);
    
    // Verify the payout belongs to this affiliate
    const payoutHistory = await this.payoutService.getPayoutHistory(affiliate.id, { page: 1, limit: 1000 });
    const payout = payoutHistory.payouts.find(p => p.id === payoutId);
    
    if (!payout) {
      throw new Error('Payout not found or does not belong to this affiliate');
    }
    
    return await this.payoutService.retryFailedPayout(payoutId);
  }

  @Put('cancel/:payoutId')
  @ApiOperation({ summary: 'Cancel payout' })
  @ApiResponse({ status: 200, description: 'Payout cancelled successfully' })
  async cancelPayout(
    @Request() req,
    @Param('payoutId') payoutId: string,
    @Body() data: { reason: string },
  ) {
    const affiliate = await this.getAffiliateFromRequest(req);
    
    // Verify the payout belongs to this affiliate
    const payoutHistory = await this.payoutService.getPayoutHistory(affiliate.id, { page: 1, limit: 1000 });
    const payout = payoutHistory.payouts.find(p => p.id === payoutId);
    
    if (!payout) {
      throw new Error('Payout not found or does not belong to this affiliate');
    }
    
    return await this.payoutService.cancelPayout(payoutId, data.reason);
  }

  @Get(':payoutId')
  @ApiOperation({ summary: 'Get payout details' })
  @ApiResponse({ status: 200, description: 'Payout details retrieved successfully' })
  async getPayoutDetails(@Request() req, @Param('payoutId') payoutId: string) {
    const affiliate = await this.getAffiliateFromRequest(req);
    
    // Verify the payout belongs to this affiliate
    const payoutHistory = await this.payoutService.getPayoutHistory(affiliate.id, { page: 1, limit: 1000 });
    const payout = payoutHistory.payouts.find(p => p.id === payoutId);
    
    if (!payout) {
      throw new Error('Payout not found or does not belong to this affiliate');
    }
    
    return payout;
  }

  // Admin endpoints
  @Post('admin/process-monthly')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process monthly payouts (admin only)' })
  @ApiResponse({ status: 200, description: 'Monthly payouts processed successfully' })
  async processMonthlyPayouts(@Body() data: {
    periodStart?: string;
    periodEnd?: string;
  }) {
    const periodStart = data.periodStart ? new Date(data.periodStart) : undefined;
    const periodEnd = data.periodEnd ? new Date(data.periodEnd) : undefined;
    
    return await this.payoutService.processMonthlyPayouts(periodStart, periodEnd);
  }

  @Post('admin/process-affiliate/:affiliateId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process payout for specific affiliate (admin only)' })
  @ApiResponse({ status: 200, description: 'Affiliate payout processed successfully' })
  async processAffiliatePayout(
    @Param('affiliateId') affiliateId: string,
    @Body() data: {
      periodStart?: string;
      periodEnd?: string;
    },
  ) {
    const periodStart = data.periodStart ? new Date(data.periodStart) : undefined;
    const periodEnd = data.periodEnd ? new Date(data.periodEnd) : undefined;
    const payoutPeriod = this.getPayoutPeriod(periodStart, periodEnd);
    
    return await this.payoutService.processAffiliatePayout(affiliateId, payoutPeriod);
  }

  @Get('admin/all')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all payouts (admin only)' })
  @ApiResponse({ status: 200, description: 'All payouts retrieved successfully' })
  async getAllPayouts(@Query() filters: {
    affiliateId?: string;
    status?: PayoutStatus;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for all payouts' };
  }

  @Get('admin/statistics')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get platform payout statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Platform statistics retrieved successfully' })
  async getPlatformPayoutStatistics() {
    return await this.payoutService.getPayoutStatistics();
  }

  @Put('admin/retry/:payoutId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Retry failed payout (admin only)' })
  @ApiResponse({ status: 200, description: 'Payout retry initiated successfully' })
  async adminRetryFailedPayout(@Param('payoutId') payoutId: string) {
    return await this.payoutService.retryFailedPayout(payoutId);
  }

  @Put('admin/cancel/:payoutId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Cancel payout (admin only)' })
  @ApiResponse({ status: 200, description: 'Payout cancelled successfully' })
  async adminCancelPayout(
    @Param('payoutId') payoutId: string,
    @Body() data: { reason: string },
  ) {
    return await this.payoutService.cancelPayout(payoutId, data.reason);
  }

  @Get('admin/:payoutId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get payout details (admin only)' })
  @ApiResponse({ status: 200, description: 'Payout details retrieved successfully' })
  async adminGetPayoutDetails(@Param('payoutId') payoutId: string) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for payout details' };
  }

  @Post('admin/batch-process')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process batch payouts (admin only)' })
  @ApiResponse({ status: 200, description: 'Batch payouts processed successfully' })
  async processBatchPayouts(@Body() data: {
    affiliateIds: string[];
    periodStart?: string;
    periodEnd?: string;
  }) {
    const results = {
      successful: 0,
      failed: 0,
      total: data.affiliateIds.length,
      payouts: [],
      errors: [],
    };

    const periodStart = data.periodStart ? new Date(data.periodStart) : undefined;
    const periodEnd = data.periodEnd ? new Date(data.periodEnd) : undefined;
    const payoutPeriod = this.getPayoutPeriod(periodStart, periodEnd);

    for (const affiliateId of data.affiliateIds) {
      try {
        const payout = await this.payoutService.processAffiliatePayout(affiliateId, payoutPeriod);
        if (payout) {
          results.successful++;
          results.payouts.push(payout);
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          affiliateId,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Helper method to get affiliate from request
   */
  private async getAffiliateFromRequest(req: any) {
    // In a real implementation, you would get the affiliate from the user
    // For now, we'll assume there's a method to get affiliate by userId
    const AffiliateService = require('../services/affiliate.service').AffiliateService;
    const affiliateService = new AffiliateService(/* dependencies */);
    
    try {
      return await affiliateService.getAffiliateProfile(req.user.id);
    } catch (error) {
      throw new Error('Affiliate profile not found');
    }
  }

  /**
   * Helper method to get payout period
   */
  private getPayoutPeriod(periodStart?: Date, periodEnd?: Date) {
    if (periodStart && periodEnd) {
      return { start: periodStart, end: periodEnd };
    }

    // Default to previous calendar month
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    return {
      start: lastMonth,
      end: endOfLastMonth,
    };
  }
}
