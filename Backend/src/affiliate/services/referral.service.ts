import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CodeGenerationService } from './code-generation.service';
import { FraudDetectionService } from './fraud-detection.service';
import { CommissionService } from './commission.service';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGenerationService: CodeGenerationService,
    private readonly fraudDetectionService: FraudDetectionService,
    private readonly commissionService: CommissionService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * Track a referral click
   */
  async trackClick(data: {
    referralCode: string;
    ipAddress: string;
    userAgent?: string;
    referer?: string;
    campaignId?: string;
  }) {
    // Find the referral link
    const referralLink = await this.prisma.referralLink.findFirst({
      where: {
        code: data.referralCode.toUpperCase(),
        isActive: true,
      },
      include: {
        affiliate: true,
      },
    });

    if (!referralLink) {
      throw new NotFoundException('Referral link not found');
    }

    // Analyze for fraud
    const fraudAnalysis = await this.fraudDetectionService.analyzeReferralClick({
      referralLinkId: referralLink.id,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      referer: data.referer,
      timestamp: new Date(),
    });

    // Create click record
    const click = await this.prisma.referralClick.create({
      data: {
        referralLinkId: referralLink.id,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        referer: data.referer,
        country: await this.getCountryFromIP(data.ipAddress),
        city: await this.getCityFromIP(data.ipAddress),
        device: this.extractDevice(data.userAgent),
        browser: this.extractBrowser(data.userAgent),
        os: this.extractOS(data.userAgent),
        fraudScore: fraudAnalysis.fraudScore,
        metadata: {
          campaignId: data.campaignId,
          fraudFlags: fraudAnalysis.flags,
        },
      },
    });

    // Update click count
    await this.prisma.referralLink.update({
      where: { id: referralLink.id },
      data: { clickCount: { increment: 1 } },
    });

    // Update analytics
    await this.analyticsService.updateClickAnalytics(referralLink.affiliateId, click);

    return {
      success: true,
      referralLink: {
        id: referralLink.id,
        code: referralLink.code,
        destinationUrl: referralLink.destinationUrl,
        affiliate: {
          id: referralLink.affiliate.id,
          referralCode: referralLink.affiliate.referralCode,
        },
      },
      fraudScore: fraudAnalysis.fraudScore,
    };
  }

  /**
   * Track a referral signup
   */
  async trackSignup(data: {
    referralCode: string;
    userId: string;
    ipAddress: string;
    userAgent?: string;
  }) {
    // Find the referral link
    const referralLink = await this.prisma.referralLink.findFirst({
      where: {
        code: data.referralCode.toUpperCase(),
        isActive: true,
      },
      include: {
        affiliate: true,
      },
    });

    if (!referralLink) {
      throw new NotFoundException('Referral link not found');
    }

    // Check if user already has a referral signup
    const existingSignup = await this.prisma.referralSignup.findFirst({
      where: { referredUserId: data.userId },
    });

    if (existingSignup) {
      throw new BadRequestException('User already has a referral signup');
    }

    // Analyze for fraud
    const fraudAnalysis = await this.fraudDetectionService.analyzeReferralSignup({
      referralLinkId: referralLink.id,
      referredUserId: data.userId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      timestamp: new Date(),
    });

    // Block if fraud score is too high
    if (fraudAnalysis.shouldBlock) {
      await this.fraudDetectionService.createFraudFlag({
        affiliateId: referralLink.affiliateId,
        type: 'SELF_REFERRAL',
        severity: 'HIGH',
        description: 'High fraud score detected during signup',
        evidence: {
          fraudScore: fraudAnalysis.fraudScore,
          flags: fraudAnalysis.flags,
          ipAddress: data.ipAddress,
          userId: data.userId,
        },
      });

      throw new BadRequestException('Signup blocked due to suspicious activity');
    }

    // Create signup record
    const signup = await this.prisma.referralSignup.create({
      data: {
        referralLinkId: referralLink.id,
        referredUserId: data.userId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        fraudScore: fraudAnalysis.fraudScore,
        metadata: {
          fraudFlags: fraudAnalysis.flags,
        },
      },
    });

    // Update signup count
    await this.prisma.referralLink.update({
      where: { id: referralLink.id },
      data: { signupCount: { increment: 1 } },
    });

    // Update analytics
    await this.analyticsService.updateSignupAnalytics(referralLink.affiliateId, signup);

    return signup;
  }

  /**
   * Confirm a referral signup (when user completes verification)
   */
  async confirmSignup(signupId: string) {
    const signup = await this.prisma.referralSignup.findUnique({
      where: { id: signupId },
    });

    if (!signup) {
      throw new NotFoundException('Referral signup not found');
    }

    if (signup.isConfirmed) {
      throw new BadRequestException('Signup already confirmed');
    }

    const updatedSignup = await this.prisma.referralSignup.update({
      where: { id: signupId },
      data: {
        isConfirmed: true,
        confirmedAt: new Date(),
      },
    });

    // Create conversion for signup
    await this.createConversion({
      referralLinkId: signup.referralLinkId,
      referralSignupId: signup.id,
      userId: signup.referredUserId,
      type: 'SIGNUP',
      amount: null, // Signups might not have monetary value
      description: 'User successfully signed up and verified',
    });

    return updatedSignup;
  }

  /**
   * Track a conversion (e.g., first trade, deposit, etc.)
   */
  async trackConversion(data: {
    userId: string;
    type: 'FIRST_TRADE' | 'DEPOSIT' | 'TRADING_VOLUME' | 'SUBSCRIPTION' | 'CUSTOM_ACTION';
    amount?: number;
    currency?: string;
    description?: string;
    metadata?: any;
  }) {
    // Find the user's referral signup
    const referralSignup = await this.prisma.referralSignup.findFirst({
      where: {
        referredUserId: data.userId,
        isConfirmed: true,
      },
      include: {
        referralLink: true,
      },
    });

    if (!referralSignup) {
      throw new NotFoundException('No confirmed referral signup found for user');
    }

    // Create conversion
    const conversion = await this.createConversion({
      referralLinkId: referralSignup.referralLinkId,
      referralSignupId: referralSignup.id,
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      metadata: data.metadata,
    });

    // Calculate and create commissions
    if (data.amount && data.amount > 0) {
      await this.commissionService.createCommissions({
        referralConversionId: conversion.id,
        amount: data.amount,
        conversionType: data.type,
      });
    }

    return conversion;
  }

  /**
   * Create a conversion record
   */
  private async createConversion(data: {
    referralLinkId: string;
    referralSignupId: string;
    userId: string;
    type: string;
    amount?: number | null;
    currency?: string;
    description?: string;
    metadata?: any;
  }) {
    const conversion = await this.prisma.referralConversion.create({
      data: {
        referralLinkId: data.referralLinkId,
        referralSignupId: data.referralSignupId,
        userId: data.userId,
        type: data.type as any,
        amount: data.amount ? data.amount : null,
        currency: data.currency || 'USD',
        description: data.description,
        metadata: data.metadata,
      },
    });

    // Update conversion count
    await this.prisma.referralLink.update({
      where: { id: data.referralLinkId },
      data: { conversionCount: { increment: 1 } },
    });

    // Update analytics
    await this.analyticsService.updateConversionAnalytics(
      (await this.prisma.referralLink.findUnique({ where: { id: data.referralLinkId } }))!.affiliateId,
      conversion,
    );

    return conversion;
  }

  /**
   * Create a new referral link for an affiliate
   */
  async createReferralLink(affiliateId: string, data: {
    name?: string;
    description?: string;
    destinationUrl?: string;
    campaignId?: string;
    customCode?: string;
  }) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    if (affiliate.status !== 'APPROVED') {
      throw new BadRequestException('Affiliate is not approved');
    }

    // Generate unique code
    let code: string;
    if (data.customCode) {
      const validation = await this.codeGenerationService.validateReferralCode(data.customCode);
      if (!validation.valid || !validation.available) {
        throw new BadRequestException(validation.message || 'Invalid custom code');
      }
      code = data.customCode.toUpperCase();
    } else {
      code = await this.codeGenerationService.generateReferralCode(affiliateId);
    }

    // Check if code already exists for this affiliate
    const existingLink = await this.prisma.referralLink.findFirst({
      where: {
        affiliateId,
        code,
      },
    });

    if (existingLink) {
      throw new BadRequestException('Referral link with this code already exists');
    }

    const referralLink = await this.prisma.referralLink.create({
      data: {
        affiliateId,
        code,
        name: data.name || `Link - ${code}`,
        description: data.description,
        destinationUrl: data.destinationUrl || '/signup',
        campaignId: data.campaignId,
        isActive: true,
      },
    });

    return referralLink;
  }

  /**
   * Get referral links for an affiliate
   */
  async getReferralLinks(affiliateId: string, includeStats: boolean = true) {
    const referralLinks = await this.prisma.referralLink.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
    });

    if (!includeStats) {
      return referralLinks;
    }

    // Add full URLs and stats
    const linksWithStats = await Promise.all(
      referralLinks.map(async (link) => {
        const fullUrl = await this.codeGenerationService.generateTrackingLink(
          link.code,
          link.campaignId,
        );

        const stats = await this.getReferralLinkStats(link.id);

        return {
          ...link,
          fullUrl,
          stats,
        };
      }),
    );

    return linksWithStats;
  }

  /**
   * Get referral link statistics
   */
  async getReferralLinkStats(referralLinkId: string) {
    const [clicks, signups, conversions, revenue] = await Promise.all([
      this.prisma.referralClick.count({ where: { referralLinkId } }),
      this.prisma.referralSignup.count({ where: { referralLinkId } }),
      this.prisma.referralConversion.count({ where: { referralLinkId } }),
      this.prisma.commission.aggregate({
        where: {
          referralConversion: { referralLinkId },
          status: 'PAID',
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      clicks,
      signups,
      conversions,
      revenue: revenue._sum.amount || 0,
      conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
    };
  }

  /**
   * Update referral link
   */
  async updateReferralLink(referralLinkId: string, affiliateId: string, data: {
    name?: string;
    description?: string;
    destinationUrl?: string;
    isActive?: boolean;
  }) {
    const referralLink = await this.prisma.referralLink.findFirst({
      where: { id: referralLinkId, affiliateId },
    });

    if (!referralLink) {
      throw new NotFoundException('Referral link not found');
    }

    return await this.prisma.referralLink.update({
      where: { id: referralLinkId },
      data,
    });
  }

  /**
   * Delete referral link
   */
  async deleteReferralLink(referralLinkId: string, affiliateId: string) {
    const referralLink = await this.prisma.referralLink.findFirst({
      where: { id: referralLinkId, affiliateId },
    });

    if (!referralLink) {
      throw new NotFoundException('Referral link not found');
    }

    // Soft delete by deactivating
    return await this.prisma.referralLink.update({
      where: { id: referralLinkId },
      data: { isActive: false },
    });
  }

  /**
   * Get referral analytics for an affiliate
   */
  async getReferralAnalytics(affiliateId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly') {
    return await this.analyticsService.getReferralAnalytics(affiliateId, period);
  }

  /**
   * Helper methods for extracting device/browser info
   */
  private extractDevice(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    
    if (/mobile/i.test(userAgent)) return 'Mobile';
    if (/tablet/i.test(userAgent)) return 'Tablet';
    if (/desktop/i.test(userAgent)) return 'Desktop';
    return 'Unknown';
  }

  private extractBrowser(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    
    if (/chrome/i.test(userAgent)) return 'Chrome';
    if (/firefox/i.test(userAgent)) return 'Firefox';
    if (/safari/i.test(userAgent)) return 'Safari';
    if (/edge/i.test(userAgent)) return 'Edge';
    if (/opera/i.test(userAgent)) return 'Opera';
    return 'Unknown';
  }

  private extractOS(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    
    if (/windows/i.test(userAgent)) return 'Windows';
    if (/mac/i.test(userAgent)) return 'macOS';
    if (/linux/i.test(userAgent)) return 'Linux';
    if (/android/i.test(userAgent)) return 'Android';
    if (/ios/i.test(userAgent)) return 'iOS';
    return 'Unknown';
  }

  /**
   * Get country from IP (simplified implementation)
   */
  private async getCountryFromIP(ipAddress: string): Promise<string> {
    // In a real implementation, you would use a geolocation service
    // For now, return unknown
    return 'Unknown';
  }

  /**
   * Get city from IP (simplified implementation)
   */
  private async getCityFromIP(ipAddress: string): Promise<string> {
    // In a real implementation, you would use a geolocation service
    // For now, return unknown
    return 'Unknown';
  }
}
