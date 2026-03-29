import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionType, CommissionStatus, ConversionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate commission for a referral conversion
   */
  async calculateCommission(data: {
    referralConversionId: string;
    amount: Decimal;
    conversionType: ConversionType;
  }): Promise<{ tier1Commission: Decimal; tier2Commission: Decimal; tier3Commission: Decimal }> {
    const referralConversion = await this.prisma.referralConversion.findUnique({
      where: { id: data.referralConversionId },
      include: {
        referralLink: {
          include: {
            affiliate: true,
          },
        },
        referralSignup: {
          include: {
            referredUser: true,
          },
        },
      },
    });

    if (!referralConversion) {
      throw new BadRequestException('Referral conversion not found');
    }

    const affiliate = referralConversion.referralLink.affiliate;
    
    // Get commission rates based on affiliate tier and conversion type
    const commissionRates = await this.getCommissionRates(affiliate.tier, data.conversionType);
    
    // Calculate tier 1 commission (direct affiliate)
    const tier1Commission = data.amount.mul(commissionRates.tier1);
    
    // Calculate tier 2 and 3 commissions (upline affiliates)
    const tier2Commission = await this.calculateUplineCommission(
      affiliate.id,
      data.amount,
      commissionRates.tier2,
      2,
    );
    
    const tier3Commission = await this.calculateUplineCommission(
      affiliate.id,
      data.amount,
      commissionRates.tier3,
      3,
    );

    return {
      tier1Commission,
      tier2Commission,
      tier3Commission,
    };
  }

  /**
   * Create commission records
   */
  async createCommissions(data: {
    referralConversionId: string;
    amount: Decimal;
    conversionType: ConversionType;
  }) {
    const commissions = await this.calculateCommission(data);

    const referralConversion = await this.prisma.referralConversion.findUnique({
      where: { id: data.referralConversionId },
      include: {
        referralLink: {
          include: {
            affiliate: true,
          },
        },
      },
    });

    if (!referralConversion) {
      throw new BadRequestException('Referral conversion not found');
    }

    const createdCommissions = [];

    // Create tier 1 commission
    if (commissions.tier1Commission.gt(0)) {
      const tier1Commission = await this.prisma.commission.create({
        data: {
          affiliateId: referralConversion.referralLink.affiliateId,
          referralConversionId: data.referralConversionId,
          tier: 1,
          type: this.mapConversionTypeToCommissionType(data.conversionType),
          amount: commissions.tier1Commission,
          rate: await this.getCommissionRate(
            referralConversion.referralLink.affiliate.tier,
            data.conversionType,
            1,
          ),
          baseAmount: data.amount,
          status: CommissionStatus.PENDING,
        },
      });
      createdCommissions.push(tier1Commission);
    }

    // Create tier 2 commission
    if (commissions.tier2Commission.gt(0)) {
      const tier2Affiliate = await this.getUplineAffiliate(
        referralConversion.referralLink.affiliateId,
        2,
      );
      
      if (tier2Affiliate) {
        const tier2Commission = await this.prisma.commission.create({
          data: {
            affiliateId: tier2Affiliate.id,
            referralConversionId: data.referralConversionId,
            tier: 2,
            type: CommissionType.TIER_OVERRIDE,
            amount: commissions.tier2Commission,
            rate: await this.getCommissionRate(tier2Affiliate.tier, data.conversionType, 2),
            baseAmount: data.amount,
            status: CommissionStatus.PENDING,
          },
        });
        createdCommissions.push(tier2Commission);
      }
    }

    // Create tier 3 commission
    if (commissions.tier3Commission.gt(0)) {
      const tier3Affiliate = await this.getUplineAffiliate(
        referralConversion.referralLink.affiliateId,
        3,
      );
      
      if (tier3Affiliate) {
        const tier3Commission = await this.prisma.commission.create({
          data: {
            affiliateId: tier3Affiliate.id,
            referralConversionId: data.referralConversionId,
            tier: 3,
            type: CommissionType.TIER_OVERRIDE,
            amount: commissions.tier3Commission,
            rate: await this.getCommissionRate(tier3Affiliate.tier, data.conversionType, 3),
            baseAmount: data.amount,
            status: CommissionStatus.PENDING,
          },
        });
        createdCommissions.push(tier3Commission);
      }
    }

    return createdCommissions;
  }

  /**
   * Get commission rates for an affiliate tier and conversion type
   */
  private async getCommissionRates(tier: number, conversionType: ConversionType) {
    // Default commission rates (can be overridden by database settings)
    const defaultRates = {
      [ConversionType.SIGNUP]: { tier1: 0.20, tier2: 0.10, tier3: 0.05 },
      [ConversionType.FIRST_TRADE]: { tier1: 0.15, tier2: 0.08, tier3: 0.04 },
      [ConversionType.DEPOSIT]: { tier1: 0.10, tier2: 0.05, tier3: 0.02 },
      [ConversionType.TRADING_VOLUME]: { tier1: 0.05, tier2: 0.03, tier3: 0.01 },
      [ConversionType.SUBSCRIPTION]: { tier1: 0.25, tier2: 0.12, tier3: 0.06 },
      [ConversionType.CUSTOM_ACTION]: { tier1: 0.30, tier2: 0.15, tier3: 0.07 },
    };

    const baseRates = defaultRates[conversionType] || defaultRates[ConversionType.SIGNUP];

    // Apply tier multipliers
    const tierMultipliers = {
      1: 1.0,   // Base tier
      2: 1.2,   // 20% bonus
      3: 1.5,   // 50% bonus
      4: 2.0,   // 100% bonus
      5: 2.5,   // 150% bonus
    };

    const multiplier = tierMultipliers[tier as keyof typeof tierMultipliers] || 1.0;

    return {
      tier1: baseRates.tier1 * multiplier,
      tier2: baseRates.tier2 * multiplier,
      tier3: baseRates.tier3 * multiplier,
    };
  }

  /**
   * Get commission rate for specific tier and conversion type
   */
  private async getCommissionRate(tier: number, conversionType: ConversionType, commissionTier: number): Promise<number> {
    const rates = await this.getCommissionRates(tier, conversionType);
    
    switch (commissionTier) {
      case 1:
        return rates.tier1;
      case 2:
        return rates.tier2;
      case 3:
        return rates.tier3;
      default:
        return 0;
    }
  }

  /**
   * Calculate upline commission
   */
  private async calculateUplineCommission(
    affiliateId: string,
    amount: Decimal,
    rate: number,
    tier: number,
  ): Promise<Decimal> {
    const uplineAffiliate = await this.getUplineAffiliate(affiliateId, tier);
    
    if (!uplineAffiliate) {
      return new Decimal(0);
    }

    return amount.mul(rate);
  }

  /**
   * Get upline affiliate for a given tier
   */
  private async getUplineAffiliate(affiliateId: string, tier: number) {
    // This is a simplified implementation
    // In a real system, you would track affiliate hierarchies
    
    if (tier === 2) {
      // Get the affiliate who referred this affiliate
      const affiliate = await this.prisma.affiliate.findUnique({
        where: { id: affiliateId },
      });

      if (!affiliate) return null;

      // Find who referred this affiliate's user
      const referralSignup = await this.prisma.referralSignup.findFirst({
        where: { referredUserId: affiliate.userId },
        include: { referralLink: { include: { affiliate: true } } },
      });

      return referralSignup?.referralLink.affiliate || null;
    }

    if (tier === 3) {
      // Get tier 2 affiliate, then find their referrer
      const tier2Affiliate = await this.getUplineAffiliate(affiliateId, 2);
      
      if (!tier2Affiliate) return null;

      const tier2ReferralSignup = await this.prisma.referralSignup.findFirst({
        where: { referredUserId: tier2Affiliate.userId },
        include: { referralLink: { include: { affiliate: true } } },
      });

      return tier2ReferralSignup?.referralLink.affiliate || null;
    }

    return null;
  }

  /**
   * Map conversion type to commission type
   */
  private mapConversionTypeToCommissionType(conversionType: ConversionType): CommissionType {
    switch (conversionType) {
      case ConversionType.SIGNUP:
        return CommissionType.REFERRAL_SIGNUP;
      case ConversionType.FIRST_TRADE:
      case ConversionType.TRADING_VOLUME:
        return CommissionType.TRADING_FEES;
      case ConversionType.DEPOSIT:
        return CommissionType.DEPOSIT_COMMISSION;
      case ConversionType.SUBSCRIPTION:
        return CommissionType.SUBSCRIPTION_COMMISSION;
      default:
        return CommissionType.PERFORMANCE_BONUS;
    }
  }

  /**
   * Get affiliate commissions
   */
  async getAffiliateCommissions(affiliateId: string, filters: {
    status?: CommissionStatus;
    tier?: number;
    type?: CommissionType;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, status, tier, type, startDate, endDate } = filters;
    const skip = (page - 1) * limit;

    const where: any = { affiliateId };

    if (status) where.status = status;
    if (tier) where.tier = tier;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.calculatedAt = {};
      if (startDate) where.calculatedAt.gte = startDate;
      if (endDate) where.calculatedAt.lte = endDate;
    }

    const [commissions, total] = await Promise.all([
      this.prisma.commission.findMany({
        where,
        include: {
          referralConversion: {
            include: {
              referralSignup: {
                include: {
                  referredUser: {
                    select: {
                      name: true,
                      walletAddress: true,
                    },
                  },
                },
              },
            },
          },
          payout: {
            select: {
              id: true,
              status: true,
              processedAt: true,
            },
          },
        },
        orderBy: { calculatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.commission.count({ where }),
    ]);

    return {
      commissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Approve commissions
   */
  async approveCommissions(commissionIds: string[]) {
    return await this.prisma.commission.updateMany({
      where: { id: { in: commissionIds } },
      data: { status: CommissionStatus.APPROVED },
    });
  }

  /**
   * Reject commissions
   */
  async rejectCommissions(commissionIds: string[], reason: string) {
    return await this.prisma.commission.updateMany({
      where: { id: { in: commissionIds } },
      data: { 
        status: CommissionStatus.CANCELLED,
        metadata: { rejectionReason: reason },
      },
    });
  }

  /**
   * Get commission statistics
   */
  async getCommissionStats(affiliateId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly') {
    let dateFormat: string;
    switch (period) {
      case 'daily':
        dateFormat = '%Y-%m-%d';
        break;
      case 'weekly':
        dateFormat = '%Y-%u';
        break;
      case 'monthly':
        dateFormat = '%Y-%m';
        break;
    }

    const stats = await this.prisma.$queryRaw`
      SELECT 
        DATE_FORMAT(calculated_at, ${dateFormat}) as period,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        tier,
        status
      FROM commissions
      WHERE affiliate_id = ${affiliateId}
        AND calculated_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY period, tier, status
      ORDER BY period DESC
    `;

    return stats;
  }

  /**
   * Calculate lifetime earnings for an affiliate
   */
  async getLifetimeEarnings(affiliateId: string) {
    const result = await this.prisma.commission.aggregate({
      where: { 
        affiliateId,
        status: CommissionStatus.PAID,
      },
      _sum: { amount: true },
      _count: true,
    });

    return {
      totalEarned: result._sum.amount || new Decimal(0),
      totalCommissions: result._count,
    };
  }

  /**
   * Get pending commissions for payout calculation
   */
  async getPendingCommissions(affiliateId: string) {
    return await this.prisma.commission.aggregate({
      where: {
        affiliateId,
        status: CommissionStatus.APPROVED,
        payoutId: null,
      },
      _sum: { amount: true },
      _count: true,
    });
  }
}
