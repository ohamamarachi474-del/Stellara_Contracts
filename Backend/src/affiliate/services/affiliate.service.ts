import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CodeGenerationService } from './code-generation.service';
import { FraudDetectionService } from './fraud-detection.service';
import { NotificationService } from '../notification/notification.service';
import { AffiliateStatus, ExternalAffiliateNetwork } from '@prisma/client';
import { generateReferralCode } from '../utils/referral-code-generator';

@Injectable()
export class AffiliateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGenerationService: CodeGenerationService,
    private readonly fraudDetectionService: FraudDetectionService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Register a new affiliate
   */
  async registerAffiliate(userId: string, data: {
    customCode?: string;
    bio?: string;
    profileImage?: string;
    socialLinks?: Record<string, string>;
    marketingPreferences?: Record<string, any>;
  }) {
    // Check if user is already an affiliate
    const existingAffiliate = await this.prisma.affiliate.findUnique({
      where: { userId },
    });

    if (existingAffiliate) {
      throw new BadRequestException('User is already registered as an affiliate');
    }

    // Generate referral code
    const referralCode = await this.codeGenerationService.generateReferralCode(
      userId,
      data.customCode,
    );

    // Create affiliate record
    const affiliate = await this.prisma.affiliate.create({
      data: {
        userId,
        referralCode,
        bio: data.bio,
        profileImage: data.profileImage,
        socialLinks: data.socialLinks,
        marketingPreferences: data.marketingPreferences,
        status: AffiliateStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            walletAddress: true,
          },
        },
      },
    });

    // Send notification to admin for approval
    await this.notificationService.sendAdminNotification({
      type: 'AFFILIATE_APPLICATION',
      title: 'New Affiliate Application',
      message: `User ${affiliate.user.name || affiliate.user.walletAddress} has applied to become an affiliate`,
      data: {
        affiliateId: affiliate.id,
        userId: affiliate.userId,
      },
    });

    return affiliate;
  }

  /**
   * Approve an affiliate application
   */
  async approveAffiliate(affiliateId: string, approvedBy: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: { user: true },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    if (affiliate.status !== AffiliateStatus.PENDING) {
      throw new BadRequestException('Affiliate is not pending approval');
    }

    // Update affiliate status
    const updatedAffiliate = await this.prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        status: AffiliateStatus.APPROVED,
        approvedAt: new Date(),
      },
    });

    // Create default referral link
    await this.prisma.referralLink.create({
      data: {
        affiliateId,
        code: affiliate.referralCode,
        name: 'Default Link',
        destinationUrl: '/signup',
        isActive: true,
      },
    });

    // Send notification to affiliate
    await this.notificationService.sendNotification(affiliate.userId, {
      type: 'AFFILIATE_APPROVED',
      title: 'Affiliate Application Approved',
      message: 'Congratulations! Your affiliate application has been approved.',
      data: {
        referralCode: affiliate.referralCode,
      },
    });

    return updatedAffiliate;
  }

  /**
   * Reject an affiliate application
   */
  async rejectAffiliate(affiliateId: string, reason: string, rejectedBy: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    if (affiliate.status !== AffiliateStatus.PENDING) {
      throw new BadRequestException('Affiliate is not pending approval');
    }

    const updatedAffiliate = await this.prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        status: AffiliateStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    // Send notification to affiliate
    await this.notificationService.sendNotification(affiliate.userId, {
      type: 'AFFILIATE_REJECTED',
      title: 'Affiliate Application Rejected',
      message: `Your affiliate application has been rejected. Reason: ${reason}`,
    });

    return updatedAffiliate;
  }

  /**
   * Get affiliate profile
   */
  async getAffiliateProfile(userId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { userId },
      include: {
        referralLinks: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        performanceMetrics: {
          orderBy: { timestamp: 'desc' },
          take: 12, // Last 12 periods
        },
        commissions: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Recent commissions
        },
        payouts: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Recent payouts
        },
      },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate profile not found');
    }

    return affiliate;
  }

  /**
   * Update affiliate profile
   */
  async updateAffiliateProfile(userId: string, data: {
    bio?: string;
    profileImage?: string;
    socialLinks?: Record<string, string>;
    marketingPreferences?: Record<string, any>;
    customLandingPage?: string;
  }) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { userId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate profile not found');
    }

    if (affiliate.status !== AffiliateStatus.APPROVED) {
      throw new ForbiddenException('Affiliate is not approved');
    }

    return await this.prisma.affiliate.update({
      where: { userId },
      data,
    });
  }

  /**
   * Suspend an affiliate
   */
  async suspendAffiliate(affiliateId: string, reason: string, suspendedBy: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    if (affiliate.status === AffiliateStatus.SUSPENDED) {
      throw new BadRequestException('Affiliate is already suspended');
    }

    const updatedAffiliate = await this.prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        status: AffiliateStatus.SUSPENDED,
      },
    });

    // Deactivate all referral links
    await this.prisma.referralLink.updateMany({
      where: { affiliateId },
      data: { isActive: false },
    });

    // Send notification to affiliate
    await this.notificationService.sendNotification(affiliate.userId, {
      type: 'AFFILIATE_SUSPENDED',
      title: 'Affiliate Account Suspended',
      message: `Your affiliate account has been suspended. Reason: ${reason}`,
    });

    return updatedAffiliate;
  }

  /**
   * Reactivate a suspended affiliate
   */
  async reactivateAffiliate(affiliateId: string, reactivatedBy: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    if (affiliate.status !== AffiliateStatus.SUSPENDED) {
      throw new BadRequestException('Affiliate is not suspended');
    }

    const updatedAffiliate = await this.prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        status: AffiliateStatus.APPROVED,
      },
    });

    // Reactivate all referral links
    await this.prisma.referralLink.updateMany({
      where: { affiliateId },
      data: { isActive: true },
    });

    // Send notification to affiliate
    await this.notificationService.sendNotification(affiliate.userId, {
      type: 'AFFILIATE_REACTIVATED',
      title: 'Affiliate Account Reactivated',
      message: 'Your affiliate account has been reactivated.',
    });

    return updatedAffiliate;
  }

  /**
   * Get all affiliates (admin only)
   */
  async getAllAffiliates(filters: {
    status?: AffiliateStatus;
    tier?: number;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { page = 1, limit = 20, status, tier, search } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) where.status = status;
    if (tier) where.tier = tier;
    if (search) {
      where.OR = [
        { referralCode: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { walletAddress: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [affiliates, total] = await Promise.all([
      this.prisma.affiliate.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              walletAddress: true,
              createdAt: true,
            },
          },
          referralLinks: {
            select: {
              id: true,
              code: true,
              clickCount: true,
              signupCount: true,
              conversionCount: true,
            },
          },
          _count: {
            select: {
              commissions: true,
              payouts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.affiliate.count({ where }),
    ]);

    return {
      affiliates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get affiliate statistics
   */
  async getAffiliateStats(affiliateId: string) {
    const stats = await this.prisma.affiliatePerformanceMetric.findMany({
      where: { affiliateId },
      orderBy: { timestamp: 'desc' },
      take: 12,
    });

    const totalStats = await this.prisma.affiliatePerformanceMetric.aggregate({
      where: { affiliateId },
      _sum: {
        clicks: true,
        signups: true,
        conversions: true,
        revenue: true,
        commission: true,
      },
    });

    const recentCommissions = await this.prisma.commission.count({
      where: {
        affiliateId,
        status: 'PAID',
        calculatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    });

    return {
      monthlyStats: stats,
      totalStats: totalStats._sum,
      recentCommissionsCount: recentCommissions,
    };
  }

  /**
   * Update affiliate tier
   */
  async updateAffiliateTier(affiliateId: string, newTier: number) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    if (newTier < 1 || newTier > 5) {
      throw new BadRequestException('Tier must be between 1 and 5');
    }

    const updatedAffiliate = await this.prisma.affiliate.update({
      where: { id: affiliateId },
      data: { tier: newTier },
    });

    // Send notification to affiliate
    await this.notificationService.sendNotification(affiliate.userId, {
      type: 'TIER_UPDATED',
      title: 'Affiliate Tier Updated',
      message: `Your affiliate tier has been updated to ${newTier}`,
      data: { newTier },
    });

    return updatedAffiliate;
  }
}
