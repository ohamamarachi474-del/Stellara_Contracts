import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PeriodType } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update click analytics
   */
  async updateClickAnalytics(affiliateId: string, click: any) {
    const period = this.getCurrentPeriod('monthly');
    const periodType = 'MONTHLY' as PeriodType;

    await this.upsertPerformanceMetric(affiliateId, period, periodType, {
      clicks: 1,
    });
  }

  /**
   * Update signup analytics
   */
  async updateSignupAnalytics(affiliateId: string, signup: any) {
    const period = this.getCurrentPeriod('monthly');
    const periodType = 'MONTHLY' as PeriodType;

    await this.upsertPerformanceMetric(affiliateId, period, periodType, {
      signups: 1,
    });

    // Update conversion rate
    await this.updateConversionRate(affiliateId, period, periodType);
  }

  /**
   * Update conversion analytics
   */
  async updateConversionAnalytics(affiliateId: string, conversion: any) {
    const period = this.getCurrentPeriod('monthly');
    const periodType = 'MONTHLY' as PeriodType;

    await this.upsertPerformanceMetric(affiliateId, period, periodType, {
      conversions: 1,
      revenue: conversion.amount || 0,
    });

    // Update conversion rate and average commission
    await this.updateConversionRate(affiliateId, period, periodType);
    await this.updateAverageCommission(affiliateId, period, periodType);
  }

  /**
   * Get referral analytics for an affiliate
   */
  async getReferralAnalytics(affiliateId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly') {
    const periodType = period.toUpperCase() as PeriodType;
    
    // Get performance metrics for the last 12 periods
    const metrics = await this.prisma.affiliatePerformanceMetric.findMany({
      where: {
        affiliateId,
        periodType,
      },
      orderBy: { timestamp: 'desc' },
      take: 12,
    });

    // Get current period stats
    const currentPeriod = this.getCurrentPeriod(period);
    const currentMetrics = await this.prisma.affiliatePerformanceMetric.findFirst({
      where: {
        affiliateId,
        period: currentPeriod,
        periodType,
      },
    });

    // Get lifetime stats
    const lifetimeStats = await this.getLifetimeStats(affiliateId);

    // Get recent activity
    const recentActivity = await this.getRecentActivity(affiliateId);

    return {
      currentPeriod: currentMetrics || this.getDefaultMetrics(),
      historicalMetrics: metrics,
      lifetimeStats,
      recentActivity,
    };
  }

  /**
   * Get comprehensive affiliate dashboard data
   */
  async getDashboardData(affiliateId: string) {
    const [
      monthlyStats,
      weeklyStats,
      dailyStats,
      lifetimeStats,
      recentConversions,
      topPerformingLinks,
      tierInfo,
    ] = await Promise.all([
      this.getReferralAnalytics(affiliateId, 'monthly'),
      this.getReferralAnalytics(affiliateId, 'weekly'),
      this.getReferralAnalytics(affiliateId, 'daily'),
      this.getLifetimeStats(affiliateId),
      this.getRecentConversions(affiliateId, 10),
      this.getTopPerformingLinks(affiliateId, 5),
      this.getTierInfo(affiliateId),
    ]);

    return {
      monthly: monthlyStats,
      weekly: weeklyStats,
      daily: dailyStats,
      lifetime: lifetimeStats,
      recentConversions,
      topPerformingLinks,
      tierInfo,
    };
  }

  /**
   * Get real-time analytics for admin dashboard
   */
  async getAdminAnalytics() {
    const [
      totalAffiliates,
      activeAffiliates,
      totalClicks,
      totalSignups,
      totalConversions,
      totalRevenue,
      totalCommissions,
      monthlyGrowth,
      topPerformers,
    ] = await Promise.all([
      this.prisma.affiliate.count(),
      this.prisma.affiliate.count({ where: { status: 'APPROVED' } }),
      this.prisma.referralClick.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.referralSignup.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.referralConversion.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.getRevenueStats(),
      this.getCommissionStats(),
      this.getMonthlyGrowth(),
      this.getTopPerformers(10),
    ]);

    return {
      overview: {
        totalAffiliates,
        activeAffiliates,
        totalClicks,
        totalSignups,
        totalConversions,
        totalRevenue,
        totalCommissions,
      },
      growth: monthlyGrowth,
      topPerformers,
    };
  }

  /**
   * Get conversion funnel analytics
   */
  async getConversionFunnel(affiliateId?: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly') {
    const periodType = period.toUpperCase() as PeriodType;
    const currentPeriod = this.getCurrentPeriod(period);
    
    const whereClause: any = {
      periodType,
      period: currentPeriod,
    };

    if (affiliateId) {
      whereClause.affiliateId = affiliateId;
    }

    const metrics = await this.prisma.affiliatePerformanceMetric.findMany({
      where: whereClause,
    });

    const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
    const totalSignups = metrics.reduce((sum, m) => sum + m.signups, 0);
    const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);

    return {
      clicks: totalClicks,
      signups: totalSignups,
      conversions: totalConversions,
      clickToSignupRate: totalClicks > 0 ? (totalSignups / totalClicks) * 100 : 0,
      signupToConversionRate: totalSignups > 0 ? (totalConversions / totalSignups) * 100 : 0,
      overallConversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
    };
  }

  /**
   * Get geographic analytics
   */
  async getGeographicAnalytics(affiliateId?: string) {
    const whereClause: any = {};
    
    if (affiliateId) {
      whereClause.referralLink = { affiliateId };
    }

    const clicksByCountry = await this.prisma.referralClick.groupBy({
      by: ['country'],
      where: whereClause,
      _count: true,
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const signupsByCountry = await this.prisma.referralSignup.groupBy({
      by: ['country'],
      where: whereClause,
      _count: true,
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    return {
      clicksByCountry: clicksByCountry.map(c => ({
        country: c.country || 'Unknown',
        clicks: c._count,
      })),
      signupsByCountry: signupsByCountry.map(s => ({
        country: s.country || 'Unknown',
        signups: s._count,
      })),
    };
  }

  /**
   * Get device and browser analytics
   */
  async getDeviceAnalytics(affiliateId?: string) {
    const whereClause: any = {};
    
    if (affiliateId) {
      whereClause.referralLink = { affiliateId };
    }

    const [devices, browsers, operatingSystems] = await Promise.all([
      this.prisma.referralClick.groupBy({
        by: ['device'],
        where: whereClause,
        _count: true,
      }),
      this.prisma.referralClick.groupBy({
        by: ['browser'],
        where: whereClause,
        _count: true,
      }),
      this.prisma.referralClick.groupBy({
        by: ['os'],
        where: whereClause,
        _count: true,
      }),
    ]);

    return {
      devices: devices.map(d => ({ device: d.device || 'Unknown', count: d._count })),
      browsers: browsers.map(b => ({ browser: b.browser || 'Unknown', count: b._count })),
      operatingSystems: operatingSystems.map(os => ({ os: os.os || 'Unknown', count: os._count })),
    };
  }

  /**
   * Upsert performance metric
   */
  private async upsertPerformanceMetric(
    affiliateId: string,
    period: string,
    periodType: PeriodType,
    updates: {
      clicks?: number;
      signups?: number;
      conversions?: number;
      revenue?: number;
      commission?: number;
    },
  ) {
    const existing = await this.prisma.affiliatePerformanceMetric.findUnique({
      where: {
        affiliateId_period_periodType: {
          affiliateId,
          period,
          periodType,
        },
      },
    });

    if (existing) {
      return await this.prisma.affiliatePerformanceMetric.update({
        where: {
          affiliateId_period_periodType: {
            affiliateId,
            period,
            periodType,
          },
        },
        data: {
          clicks: existing.clicks + (updates.clicks || 0),
          signups: existing.signups + (updates.signups || 0),
          conversions: existing.conversions + (updates.conversions || 0),
          revenue: existing.revenue + (updates.revenue || 0),
          commission: existing.commission + (updates.commission || 0),
        },
      });
    } else {
      return await this.prisma.affiliatePerformanceMetric.create({
        data: {
          affiliateId,
          period,
          periodType,
          clicks: updates.clicks || 0,
          signups: updates.signups || 0,
          conversions: updates.conversions || 0,
          revenue: updates.revenue || 0,
          commission: updates.commission || 0,
          conversionRate: 0,
          avgCommissionPerConversion: 0,
        },
      });
    }
  }

  /**
   * Update conversion rate
   */
  private async updateConversionRate(affiliateId: string, period: string, periodType: PeriodType) {
    const metric = await this.prisma.affiliatePerformanceMetric.findUnique({
      where: {
        affiliateId_period_periodType: {
          affiliateId,
          period,
          periodType,
        },
      },
    });

    if (metric && metric.clicks > 0) {
      const conversionRate = (metric.conversions / metric.clicks) * 100;
      
      await this.prisma.affiliatePerformanceMetric.update({
        where: {
          affiliateId_period_periodType: {
            affiliateId,
            period,
            periodType,
          },
        },
        data: { conversionRate },
      });
    }
  }

  /**
   * Update average commission per conversion
   */
  private async updateAverageCommission(affiliateId: string, period: string, periodType: PeriodType) {
    const metric = await this.prisma.affiliatePerformanceMetric.findUnique({
      where: {
        affiliateId_period_periodType: {
          affiliateId,
          period,
          periodType,
        },
      },
    });

    if (metric && metric.conversions > 0) {
      const avgCommission = metric.commission / metric.conversions;
      
      await this.prisma.affiliatePerformanceMetric.update({
        where: {
          affiliateId_period_periodType: {
            affiliateId,
            period,
            periodType,
          },
        },
        data: { avgCommissionPerConversion: avgCommission },
      });
    }
  }

  /**
   * Get current period string
   */
  private getCurrentPeriod(period: 'daily' | 'weekly' | 'monthly'): string {
    const now = new Date();
    
    switch (period) {
      case 'daily':
        return now.toISOString().split('T')[0]; // YYYY-MM-DD
      case 'weekly':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        return `${startOfWeek.getFullYear()}-W${Math.ceil(startOfWeek.getDate() / 7)}`;
      case 'monthly':
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      default:
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  /**
   * Get default metrics
   */
  private getDefaultMetrics() {
    return {
      clicks: 0,
      signups: 0,
      conversions: 0,
      revenue: 0,
      commission: 0,
      conversionRate: 0,
      avgCommissionPerConversion: 0,
    };
  }

  /**
   * Get lifetime stats
   */
  private async getLifetimeStats(affiliateId: string) {
    const [totalClicks, totalSignups, totalConversions, totalRevenue, totalCommissions] = await Promise.all([
      this.prisma.referralLink.aggregate({
        where: { affiliateId },
        _sum: { clickCount: true },
      }),
      this.prisma.referralLink.aggregate({
        where: { affiliateId },
        _sum: { signupCount: true },
      }),
      this.prisma.referralLink.aggregate({
        where: { affiliateId },
        _sum: { conversionCount: true },
      }),
      this.prisma.commission.aggregate({
        where: { affiliateId, status: 'PAID' },
        _sum: { baseAmount: true },
      }),
      this.prisma.commission.aggregate({
        where: { affiliateId, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalClicks: totalClicks._sum.clickCount || 0,
      totalSignups: totalSignups._sum.signupCount || 0,
      totalConversions: totalConversions._sum.conversionCount || 0,
      totalRevenue: totalRevenue._sum.baseAmount || 0,
      totalCommissions: totalCommissions._sum.amount || 0,
      avgConversionRate: (totalSignups._sum.signupCount || 0) > 0 
        ? ((totalConversions._sum.conversionCount || 0) / (totalSignups._sum.signupCount || 0)) * 100 
        : 0,
    };
  }

  /**
   * Get recent activity
   */
  private async getRecentActivity(affiliateId: string) {
    const [recentClicks, recentSignups, recentConversions] = await Promise.all([
      this.prisma.referralClick.findMany({
        where: { referralLink: { affiliateId } },
        orderBy: { timestamp: 'desc' },
        take: 5,
      }),
      this.prisma.referralSignup.findMany({
        where: { referralLink: { affiliateId } },
        include: {
          referredUser: {
            select: { name: true, walletAddress: true },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 5,
      }),
      this.prisma.referralConversion.findMany({
        where: { referralLink: { affiliateId } },
        orderBy: { timestamp: 'desc' },
        take: 5,
      }),
    ]);

    return {
      recentClicks,
      recentSignups,
      recentConversions,
    };
  }

  /**
   * Get recent conversions
   */
  private async getRecentConversions(affiliateId: string, limit: number) {
    return await this.prisma.referralConversion.findMany({
      where: { referralLink: { affiliateId } },
      include: {
        referralSignup: {
          include: {
            referredUser: {
              select: { name: true, walletAddress: true },
            },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Get top performing links
   */
  private async getTopPerformingLinks(affiliateId: string, limit: number) {
    const links = await this.prisma.referralLink.findMany({
      where: { affiliateId, isActive: true },
      orderBy: { conversionCount: 'desc' },
      take: limit,
    });

    return links.map(link => ({
      ...link,
      conversionRate: link.clickCount > 0 ? (link.conversionCount / link.clickCount) * 100 : 0,
    }));
  }

  /**
   * Get tier info
   */
  private async getTierInfo(affiliateId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) return null;

    return {
      currentTier: affiliate.tier,
      tierBenefits: this.getTierBenefits(affiliate.tier),
    };
  }

  /**
   * Get tier benefits
   */
  private getTierBenefits(tier: number) {
    const benefits = {
      1: { commissionMultiplier: 1.0, maxPayoutBonus: 0, supportLevel: 'Basic' },
      2: { commissionMultiplier: 1.2, maxPayoutBonus: 10, supportLevel: 'Priority' },
      3: { commissionMultiplier: 1.5, maxPayoutBonus: 25, supportLevel: 'Enhanced' },
      4: { commissionMultiplier: 2.0, maxPayoutBonus: 50, supportLevel: 'Premium' },
      5: { commissionMultiplier: 2.5, maxPayoutBonus: 100, supportLevel: 'Elite' },
    };

    return benefits[tier as keyof typeof benefits] || benefits[1];
  }

  /**
   * Get revenue stats
   */
  private async getRevenueStats() {
    const result = await this.prisma.commission.aggregate({
      where: { status: 'PAID' },
      _sum: { baseAmount: true },
    });

    return result._sum.baseAmount || 0;
  }

  /**
   * Get commission stats
   */
  private async getCommissionStats() {
    const result = await this.prisma.commission.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
    });

    return result._sum.amount || 0;
  }

  /**
   * Get monthly growth
   */
  private async getMonthlyGrowth() {
    const currentMonth = this.getCurrentPeriod('monthly');
    const lastMonth = this.getLastPeriod('monthly');

    const [current, last] = await Promise.all([
      this.prisma.affiliatePerformanceMetric.aggregate({
        where: { period: currentMonth, periodType: 'MONTHLY' },
        _sum: { conversions: true, commission: true },
      }),
      this.prisma.affiliatePerformanceMetric.aggregate({
        where: { period: lastMonth, periodType: 'MONTHLY' },
        _sum: { conversions: true, commission: true },
      }),
    ]);

    const currentConversions = current._sum.conversions || 0;
    const lastConversions = last._sum.conversions || 0;
    const currentCommission = current._sum.commission || 0;
    const lastCommission = last._sum.commission || 0;

    return {
      conversionsGrowth: lastConversions > 0 
        ? ((currentConversions - lastConversions) / lastConversions) * 100 
        : 0,
      commissionGrowth: lastCommission > 0 
        ? ((currentCommission - lastCommission) / lastCommission) * 100 
        : 0,
    };
  }

  /**
   * Get top performers
   */
  private async getTopPerformers(limit: number) {
    return await this.prisma.affiliate.findMany({
      where: { status: 'APPROVED' },
      include: {
        referralLinks: {
          select: {
            clickCount: true,
            signupCount: true,
            conversionCount: true,
          },
        },
        commissions: {
          where: { status: 'PAID' },
          select: { amount: true },
        },
      },
      orderBy: [
        { referralLinks: { _sum: { conversionCount: 'desc' } } },
        { commissions: { _sum: { amount: 'desc' } } },
      ],
      take: limit,
    });
  }

  /**
   * Get last period
   */
  private getLastPeriod(period: 'daily' | 'weekly' | 'monthly'): string {
    const now = new Date();
    
    switch (period) {
      case 'daily':
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return yesterday.toISOString().split('T')[0];
      case 'weekly':
        const lastWeek = new Date(now);
        lastWeek.setDate(now.getDate() - 7);
        return `${lastWeek.getFullYear()}-W${Math.ceil(lastWeek.getDate() / 7)}`;
      case 'monthly':
        if (now.getMonth() === 0) {
          return `${now.getFullYear() - 1}-12`;
        } else {
          return `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
        }
      default:
        return `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
    }
  }
}
