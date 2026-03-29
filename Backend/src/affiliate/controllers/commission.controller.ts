import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CommissionService } from '../services/commission.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CommissionStatus, CommissionType } from '@prisma/client';

@ApiTags('commission')
@Controller('commission')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  @Get('my-commissions')
  @ApiOperation({ summary: 'Get affiliate commissions' })
  @ApiResponse({ status: 200, description: 'Commissions retrieved successfully' })
  async getMyCommissions(
    @Request() req,
    @Query() filters: {
      status?: CommissionStatus;
      tier?: number;
      type?: CommissionType;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const affiliate = await this.getAffiliateFromRequest(req);
    
    const startDate = filters.startDate ? new Date(filters.startDate) : undefined;
    const endDate = filters.endDate ? new Date(filters.endDate) : undefined;
    
    return await this.commissionService.getAffiliateCommissions(affiliate.id, {
      ...filters,
      startDate,
      endDate,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get commission statistics' })
  @ApiResponse({ status: 200, description: 'Commission statistics retrieved successfully' })
  async getCommissionStats(
    @Request() req,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.commissionService.getCommissionStats(affiliate.id, period);
  }

  @Get('lifetime-earnings')
  @ApiOperation({ summary: 'Get lifetime earnings' })
  @ApiResponse({ status: 200, description: 'Lifetime earnings retrieved successfully' })
  async getLifetimeEarnings(@Request() req) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.commissionService.getLifetimeEarnings(affiliate.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending commissions' })
  @ApiResponse({ status: 200, description: 'Pending commissions retrieved successfully' })
  async getPendingCommissions(@Request() req) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.commissionService.getPendingCommissions(affiliate.id);
  }

  @Post('calculate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate commission for a conversion (admin only)' })
  @ApiResponse({ status: 200, description: 'Commission calculated successfully' })
  async calculateCommission(@Body() data: {
    referralConversionId: string;
    amount: number;
    conversionType: string;
  }) {
    return await this.commissionService.calculateCommission({
      referralConversionId: data.referralConversionId,
      amount: data.amount,
      conversionType: data.conversionType as any,
    });
  }

  @Post('create')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create commission records (admin only)' })
  @ApiResponse({ status: 201, description: 'Commissions created successfully' })
  async createCommissions(@Body() data: {
    referralConversionId: string;
    amount: number;
    conversionType: string;
  }) {
    return await this.commissionService.createCommissions({
      referralConversionId: data.referralConversionId,
      amount: data.amount,
      conversionType: data.conversionType as any,
    });
  }

  @Put('approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Approve commissions (admin only)' })
  @ApiResponse({ status: 200, description: 'Commissions approved successfully' })
  async approveCommissions(@Body() data: { commissionIds: string[] }) {
    return await this.commissionService.approveCommissions(data.commissionIds);
  }

  @Put('reject')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Reject commissions (admin only)' })
  @ApiResponse({ status: 200, description: 'Commissions rejected successfully' })
  async rejectCommissions(@Body() data: {
    commissionIds: string[];
    reason: string;
  }) {
    return await this.commissionService.rejectCommissions(
      data.commissionIds,
      data.reason,
    );
  }

  // Admin endpoints
  @Get('admin/all')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all commissions (admin only)' })
  @ApiResponse({ status: 200, description: 'All commissions retrieved successfully' })
  async getAllCommissions(@Query() filters: {
    affiliateId?: string;
    status?: CommissionStatus;
    tier?: number;
    type?: CommissionType;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for all commissions' };
  }

  @Get('admin/summary')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get commission summary (admin only)' })
  @ApiResponse({ status: 200, description: 'Commission summary retrieved successfully' })
  async getCommissionSummary(@Query() filters: {
    period?: 'daily' | 'weekly' | 'monthly';
    startDate?: string;
    endDate?: string;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for commission summary' };
  }

  @Get('admin/tier-breakdown')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get commission breakdown by tier (admin only)' })
  @ApiResponse({ status: 200, description: 'Tier breakdown retrieved successfully' })
  async getTierBreakdown(@Query() filters: {
    period?: 'daily' | 'weekly' | 'monthly';
    startDate?: string;
    endDate?: string;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for tier breakdown' };
  }

  @Get('admin/type-breakdown')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get commission breakdown by type (admin only)' })
  @ApiResponse({ status: 200, description: 'Type breakdown retrieved successfully' })
  async getTypeBreakdown(@Query() filters: {
    period?: 'daily' | 'weekly' | 'monthly';
    startDate?: string;
    endDate?: string;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for type breakdown' };
  }

  @Get('admin/:commissionId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get commission details (admin only)' })
  @ApiResponse({ status: 200, description: 'Commission details retrieved successfully' })
  async getCommissionDetails(@Param('commissionId') commissionId: string) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for commission details' };
  }

  @Post('admin/recalculate/:commissionId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Recalculate commission (admin only)' })
  @ApiResponse({ status: 200, description: 'Commission recalculated successfully' })
  async recalculateCommission(@Param('commissionId') commissionId: string) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for recalculation' };
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
}
