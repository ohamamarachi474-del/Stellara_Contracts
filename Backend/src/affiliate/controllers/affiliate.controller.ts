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
import { AffiliateService } from '../services/affiliate.service';
import { AnalyticsService } from '../services/analytics.service';
import { ExternalNetworkService } from '../services/external-network.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AffiliateStatus, ExternalAffiliateNetwork } from '@prisma/client';

@ApiTags('affiliate')
@Controller('affiliate')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AffiliateController {
  constructor(
    private readonly affiliateService: AffiliateService,
    private readonly analyticsService: AnalyticsService,
    private readonly externalNetworkService: ExternalNetworkService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register as an affiliate' })
  @ApiResponse({ status: 201, description: 'Affiliate registration successful' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async registerAffiliate(@Request() req, @Body() data: {
    customCode?: string;
    bio?: string;
    profileImage?: string;
    socialLinks?: Record<string, string>;
    marketingPreferences?: Record<string, any>;
  }) {
    return await this.affiliateService.registerAffiliate(req.user.id, data);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get affiliate profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(@Request() req) {
    return await this.affiliateService.getAffiliateProfile(req.user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update affiliate profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(@Request() req, @Body() data: {
    bio?: string;
    profileImage?: string;
    socialLinks?: Record<string, string>;
    marketingPreferences?: Record<string, any>;
    customLandingPage?: string;
  }) {
    return await this.affiliateService.updateAffiliateProfile(req.user.id, data);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get affiliate dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getDashboard(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.analyticsService.getDashboardData(affiliate.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get affiliate statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.affiliateService.getAffiliateStats(affiliate.id);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get referral analytics' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  async getAnalytics(
    @Request() req,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.affiliateService.getReferralAnalytics(affiliate.id, period);
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Get conversion funnel analytics' })
  @ApiResponse({ status: 200, description: 'Funnel analytics retrieved successfully' })
  async getConversionFunnel(
    @Request() req,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.analyticsService.getConversionFunnel(affiliate.id, period);
  }

  @Get('geographic')
  @ApiOperation({ summary: 'Get geographic analytics' })
  @ApiResponse({ status: 200, description: 'Geographic analytics retrieved successfully' })
  async getGeographicAnalytics(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.analyticsService.getGeographicAnalytics(affiliate.id);
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get device and browser analytics' })
  @ApiResponse({ status: 200, description: 'Device analytics retrieved successfully' })
  async getDeviceAnalytics(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.analyticsService.getDeviceAnalytics(affiliate.id);
  }

  // External Network Management
  @Get('external-networks')
  @ApiOperation({ summary: 'Get supported external networks' })
  @ApiResponse({ status: 200, description: 'Networks retrieved successfully' })
  async getSupportedNetworks() {
    return this.externalNetworkService.getSupportedNetworks();
  }

  @Post('external-networks/connect')
  @ApiOperation({ summary: 'Connect to external affiliate network' })
  @ApiResponse({ status: 201, description: 'Network connected successfully' })
  async connectExternalNetwork(@Request() req, @Body() data: {
    network: ExternalAffiliateNetwork;
    externalId: string;
    credentials: Record<string, string>;
  }) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.connectExternalAccount(affiliate.id, data);
  }

  @Get('external-networks/accounts')
  @ApiOperation({ summary: 'Get connected external accounts' })
  @ApiResponse({ status: 200, description: 'Accounts retrieved successfully' })
  async getExternalAccounts(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.getExternalAccounts(affiliate.id);
  }

  @Put('external-networks/:network/credentials')
  @ApiOperation({ summary: 'Update external network credentials' })
  @ApiResponse({ status: 200, description: 'Credentials updated successfully' })
  async updateCredentials(
    @Request() req,
    @Param('network') network: ExternalAffiliateNetwork,
    @Body() data: { credentials: Record<string, string> },
  ) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.updateCredentials(affiliate.id, network, data.credentials);
  }

  @Post('external-networks/sync')
  @ApiOperation({ summary: 'Sync all external accounts' })
  @ApiResponse({ status: 200, description: 'Sync completed successfully' })
  async syncAllAccounts(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.syncAllAccounts(affiliate.id);
  }

  @Get('external-networks/sync-status')
  @ApiOperation({ summary: 'Get sync status for external accounts' })
  @ApiResponse({ status: 200, description: 'Sync status retrieved successfully' })
  async getSyncStatus(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.getSyncStatus(affiliate.id);
  }

  @Get('external-networks/performance')
  @ApiOperation({ summary: 'Get external network performance data' })
  @ApiResponse({ status: 200, description: 'Performance data retrieved successfully' })
  async getNetworkPerformance(@Request() req) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.getNetworkPerformance(affiliate.id);
  }

  @Delete('external-networks/:network')
  @ApiOperation({ summary: 'Disconnect external network' })
  @ApiResponse({ status: 200, description: 'Network disconnected successfully' })
  async disconnectExternalNetwork(
    @Request() req,
    @Param('network') network: ExternalAffiliateNetwork,
  ) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.disconnectExternalAccount(affiliate.id, network);
  }

  @Put('external-networks/:network/toggle')
  @ApiOperation({ summary: 'Toggle external network active status' })
  @ApiResponse({ status: 200, description: 'Status toggled successfully' })
  async toggleNetworkStatus(
    @Request() req,
    @Param('network') network: ExternalAffiliateNetwork,
  ) {
    const affiliate = await this.affiliateService.getAffiliateProfile(req.user.id);
    return await this.externalNetworkService.toggleAccountStatus(affiliate.id, network);
  }

  // Admin endpoints
  @Get('admin/all')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all affiliates (admin only)' })
  @ApiResponse({ status: 200, description: 'Affiliates retrieved successfully' })
  async getAllAffiliates(@Query() filters: {
    status?: AffiliateStatus;
    tier?: number;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    return await this.affiliateService.getAllAffiliates(filters);
  }

  @Put('admin/:affiliateId/approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Approve affiliate application (admin only)' })
  @ApiResponse({ status: 200, description: 'Affiliate approved successfully' })
  async approveAffiliate(@Param('affiliateId') affiliateId: string, @Request() req) {
    return await this.affiliateService.approveAffiliate(affiliateId, req.user.id);
  }

  @Put('admin/:affiliateId/reject')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Reject affiliate application (admin only)' })
  @ApiResponse({ status: 200, description: 'Affiliate rejected successfully' })
  async rejectAffiliate(
    @Param('affiliateId') affiliateId: string,
    @Body() data: { reason: string },
    @Request() req,
  ) {
    return await this.affiliateService.rejectAffiliate(affiliateId, data.reason, req.user.id);
  }

  @Put('admin/:affiliateId/suspend')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Suspend affiliate (admin only)' })
  @ApiResponse({ status: 200, description: 'Affiliate suspended successfully' })
  async suspendAffiliate(
    @Param('affiliateId') affiliateId: string,
    @Body() data: { reason: string },
    @Request() req,
  ) {
    return await this.affiliateService.suspendAffiliate(affiliateId, data.reason, req.user.id);
  }

  @Put('admin/:affiliateId/reactivate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Reactivate suspended affiliate (admin only)' })
  @ApiResponse({ status: 200, description: 'Affiliate reactivated successfully' })
  async reactivateAffiliate(@Param('affiliateId') affiliateId: string, @Request() req) {
    return await this.affiliateService.reactivateAffiliate(affiliateId, req.user.id);
  }

  @Put('admin/:affiliateId/tier')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update affiliate tier (admin only)' })
  @ApiResponse({ status: 200, description: 'Tier updated successfully' })
  async updateAffiliateTier(
    @Param('affiliateId') affiliateId: string,
    @Body() data: { tier: number },
  ) {
    return await this.affiliateService.updateAffiliateTier(affiliateId, data.tier);
  }

  @Get('admin/analytics')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get admin analytics dashboard' })
  @ApiResponse({ status: 200, description: 'Admin analytics retrieved successfully' })
  async getAdminAnalytics() {
    return await this.analyticsService.getAdminAnalytics();
  }

  @Get('admin/funnel')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get platform-wide conversion funnel' })
  @ApiResponse({ status: 200, description: 'Funnel analytics retrieved successfully' })
  async getPlatformFunnel(@Query('period') period: 'daily' | 'weekly' | 'monthly' = 'monthly') {
    return await this.analyticsService.getConversionFunnel(undefined, period);
  }

  @Get('admin/geographic')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get platform-wide geographic analytics' })
  @ApiResponse({ status: 200, description: 'Geographic analytics retrieved successfully' })
  async getPlatformGeographic() {
    return await this.analyticsService.getGeographicAnalytics();
  }

  @Get('admin/devices')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get platform-wide device analytics' })
  @ApiResponse({ status: 200, description: 'Device analytics retrieved successfully' })
  async getPlatformDevices() {
    return await this.analyticsService.getDeviceAnalytics();
  }
}
