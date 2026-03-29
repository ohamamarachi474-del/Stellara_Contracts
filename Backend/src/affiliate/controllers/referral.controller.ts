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
import { ReferralService } from '../services/referral.service';
import { CodeGenerationService } from '../services/code-generation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('referral')
@Controller('referral')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReferralController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly codeGenerationService: CodeGenerationService,
  ) {}

  @Post('track-click')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track a referral click' })
  @ApiResponse({ status: 200, description: 'Click tracked successfully' })
  @ApiResponse({ status: 404, description: 'Referral link not found' })
  async trackClick(@Body() data: {
    referralCode: string;
    ipAddress: string;
    userAgent?: string;
    referer?: string;
    campaignId?: string;
  }) {
    return await this.referralService.trackClick(data);
  }

  @Post('track-signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Track a referral signup' })
  @ApiResponse({ status: 201, description: 'Signup tracked successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or suspicious activity' })
  async trackSignup(@Body() data: {
    referralCode: string;
    userId: string;
    ipAddress: string;
    userAgent?: string;
  }) {
    return await this.referralService.trackSignup(data);
  }

  @Put('confirm-signup/:signupId')
  @ApiOperation({ summary: 'Confirm a referral signup' })
  @ApiResponse({ status: 200, description: 'Signup confirmed successfully' })
  async confirmSignup(@Param('signupId') signupId: string) {
    return await this.referralService.confirmSignup(signupId);
  }

  @Post('track-conversion')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Track a referral conversion' })
  @ApiResponse({ status: 201, description: 'Conversion tracked successfully' })
  async trackConversion(@Body() data: {
    userId: string;
    type: 'FIRST_TRADE' | 'DEPOSIT' | 'TRADING_VOLUME' | 'SUBSCRIPTION' | 'CUSTOM_ACTION';
    amount?: number;
    currency?: string;
    description?: string;
    metadata?: any;
  }) {
    return await this.referralService.trackConversion(data);
  }

  // Referral Link Management
  @Get('links')
  @ApiOperation({ summary: 'Get referral links for affiliate' })
  @ApiResponse({ status: 200, description: 'Referral links retrieved successfully' })
  async getReferralLinks(@Request() req, @Query('includeStats') includeStats: string = 'true') {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.referralService.getReferralLinks(
      affiliate.id,
      includeStats === 'true',
    );
  }

  @Post('links')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new referral link' })
  @ApiResponse({ status: 201, description: 'Referral link created successfully' })
  async createReferralLink(@Request() req, @Body() data: {
    name?: string;
    description?: string;
    destinationUrl?: string;
    campaignId?: string;
    customCode?: string;
  }) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.referralService.createReferralLink(affiliate.id, data);
  }

  @Get('links/:linkId/stats')
  @ApiOperation({ summary: 'Get referral link statistics' })
  @ApiResponse({ status: 200, description: 'Link statistics retrieved successfully' })
  async getReferralLinkStats(@Param('linkId') linkId: string) {
    return await this.referralService.getReferralLinkStats(linkId);
  }

  @Put('links/:linkId')
  @ApiOperation({ summary: 'Update referral link' })
  @ApiResponse({ status: 200, description: 'Referral link updated successfully' })
  async updateReferralLink(
    @Request() req,
    @Param('linkId') linkId: string,
    @Body() data: {
      name?: string;
      description?: string;
      destinationUrl?: string;
      isActive?: boolean;
    },
  ) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.referralService.updateReferralLink(linkId, affiliate.id, data);
  }

  @Delete('links/:linkId')
  @ApiOperation({ summary: 'Delete referral link' })
  @ApiResponse({ status: 200, description: 'Referral link deleted successfully' })
  async deleteReferralLink(@Request() req, @Param('linkId') linkId: string) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.referralService.deleteReferralLink(linkId, affiliate.id);
  }

  @Post('links/generate-tracking-url')
  @ApiOperation({ summary: 'Generate tracking URL for referral code' })
  @ApiResponse({ status: 200, description: 'Tracking URL generated successfully' })
  async generateTrackingUrl(@Body() data: {
    referralCode: string;
    campaignId?: string;
  }) {
    return await this.codeGenerationService.generateTrackingLink(
      data.referralCode,
      data.campaignId,
    );
  }

  @Post('links/generate-short-url')
  @ApiOperation({ summary: 'Generate short URL for tracking' })
  @ApiResponse({ status: 200, description: 'Short URL generated successfully' })
  async generateShortUrl(@Body() data: { fullUrl: string }) {
    return await this.codeGenerationService.generateShortUrl(data.fullUrl);
  }

  // Code validation
  @Post('validate-code')
  @ApiOperation({ summary: 'Validate referral code availability' })
  @ApiResponse({ status: 200, description: 'Code validation completed' })
  async validateReferralCode(@Body() data: { code: string }) {
    return await this.codeGenerationService.validateReferralCode(data.code);
  }

  @Post('generate-codes')
  @ApiOperation({ summary: 'Generate multiple referral codes' })
  @ApiResponse({ status: 200, description: 'Codes generated successfully' })
  async generateMultipleCodes(@Body() data: { count: number }) {
    return await this.codeGenerationService.generateMultipleReferralCodes(data.count);
  }

  // Analytics endpoints
  @Get('analytics')
  @ApiOperation({ summary: 'Get referral analytics' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  async getReferralAnalytics(
    @Request() req,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ) {
    const affiliate = await this.getAffiliateFromRequest(req);
    return await this.referralService.getReferralAnalytics(affiliate.id, period);
  }

  // Admin endpoints
  @Get('admin/all-links')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all referral links (admin only)' })
  @ApiResponse({ status: 200, description: 'All referral links retrieved successfully' })
  async getAllReferralLinks(@Query() filters: {
    affiliateId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for all referral links' };
  }

  @Get('admin/clicks')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get referral clicks (admin only)' })
  @ApiResponse({ status: 200, description: 'Referral clicks retrieved successfully' })
  async getReferralClicks(@Query() filters: {
    referralLinkId?: string;
    affiliateId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for referral clicks' };
  }

  @Get('admin/signups')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get referral signups (admin only)' })
  @ApiResponse({ status: 200, description: 'Referral signups retrieved successfully' })
  async getReferralSignups(@Query() filters: {
    referralLinkId?: string;
    affiliateId?: string;
    confirmed?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for referral signups' };
  }

  @Get('admin/conversions')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get referral conversions (admin only)' })
  @ApiResponse({ status: 200, description: 'Referral conversions retrieved successfully' })
  async getReferralConversions(@Query() filters: {
    referralLinkId?: string;
    affiliateId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    // This would be implemented in the service
    return { message: 'Admin endpoint for referral conversions' };
  }

  /**
   * Helper method to get affiliate from request
   * This would typically use a decorator or middleware
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
