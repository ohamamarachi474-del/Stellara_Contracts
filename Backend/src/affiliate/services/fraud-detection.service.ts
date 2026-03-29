import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FraudType, FraudSeverity, FraudStatus } from '@prisma/client';

@Injectable()
export class FraudDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyze a referral click for fraud indicators
   */
  async analyzeReferralClick(data: {
    referralLinkId: string;
    ipAddress: string;
    userAgent?: string;
    referer?: string;
    timestamp: Date;
  }): Promise<{ fraudScore: number; flags: string[] }> {
    const flags: string[] = [];
    let fraudScore = 0;

    // Check for IP-based fraud
    const ipAnalysis = await this.analyzeIPAddress(data.ipAddress, data.timestamp);
    fraudScore += ipAnalysis.score;
    flags.push(...ipAnalysis.flags);

    // Check for user agent anomalies
    if (data.userAgent) {
      const uaAnalysis = this.analyzeUserAgent(data.userAgent);
      fraudScore += uaAnalysis.score;
      flags.push(...uaAnalysis.flags);
    }

    // Check for rapid clicking patterns
    const rapidClickAnalysis = await this.checkRapidClicking(
      data.referralLinkId,
      data.ipAddress,
      data.timestamp,
    );
    fraudScore += rapidClickAnalysis.score;
    flags.push(...rapidClickAnalysis.flags);

    // Check for proxy/VPN usage
    const proxyAnalysis = await this.checkProxyUsage(data.ipAddress);
    fraudScore += proxyAnalysis.score;
    flags.push(...proxyAnalysis.flags);

    // Normalize score to 0-100
    fraudScore = Math.min(100, Math.max(0, fraudScore));

    return { fraudScore, flags };
  }

  /**
   * Analyze a referral signup for fraud
   */
  async analyzeReferralSignup(data: {
    referralLinkId: string;
    referredUserId: string;
    ipAddress: string;
    userAgent?: string;
    timestamp: Date;
  }): Promise<{ fraudScore: number; flags: string[]; shouldBlock: boolean }> {
    const flags: string[] = [];
    let fraudScore = 0;
    let shouldBlock = false;

    // Check for self-referral
    const selfReferralCheck = await this.checkSelfReferral(
      data.referralLinkId,
      data.referredUserId,
      data.ipAddress,
    );
    if (selfReferralCheck.isSelfReferral) {
      fraudScore += 50;
      flags.push('SELF_REFERRAL');
      shouldBlock = true;
    }

    // Check for duplicate accounts
    const duplicateCheck = await this.checkDuplicateAccounts(
      data.referredUserId,
      data.ipAddress,
    );
    if (duplicateCheck.isDuplicate) {
      fraudScore += 30;
      flags.push('DUPLICATE_ACCOUNT');
    }

    // Check for suspicious signup patterns
    const patternAnalysis = await this.analyzeSignupPatterns(
      data.referralLinkId,
      data.ipAddress,
      data.timestamp,
    );
    fraudScore += patternAnalysis.score;
    flags.push(...patternAnalysis.flags);

    // Normalize score
    fraudScore = Math.min(100, Math.max(0, fraudScore));

    // Block if score is too high
    if (fraudScore >= 70) {
      shouldBlock = true;
    }

    return { fraudScore, flags, shouldBlock };
  }

  /**
   * Create a fraud flag
   */
  async createFraudFlag(data: {
    affiliateId: string;
    type: FraudType;
    severity: FraudSeverity;
    description: string;
    evidence?: any;
  }) {
    return await this.prisma.affiliateFraudFlag.create({
      data: {
        affiliateId: data.affiliateId,
        type: data.type,
        severity: data.severity,
        description: data.description,
        evidence: data.evidence,
        status: FraudStatus.ACTIVE,
      },
    });
  }

  /**
   * Get fraud flags for an affiliate
   */
  async getAffiliateFraudFlags(affiliateId: string) {
    return await this.prisma.affiliateFraudFlag.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Resolve a fraud flag
   */
  async resolveFraudFlag(flagId: string, resolution: string, resolvedBy: string) {
    return await this.prisma.affiliateFraudFlag.update({
      where: { id: flagId },
      data: {
        status: FraudStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy,
        resolution,
      },
    });
  }

  /**
   * Analyze IP address for fraud indicators
   */
  private async analyzeIPAddress(ipAddress: string, timestamp: Date) {
    const flags: string[] = [];
    let score = 0;

    // Check for multiple clicks from same IP in short time
    const recentClicks = await this.prisma.referralClick.count({
      where: {
        ipAddress,
        timestamp: {
          gte: new Date(timestamp.getTime() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
    });

    if (recentClicks > 20) {
      score += 25;
      flags.push('HIGH_FREQUENCY_CLICKS');
    }

    // Check for multiple signups from same IP
    const recentSignups = await this.prisma.referralSignup.count({
      where: {
        ipAddress,
        timestamp: {
          gte: new Date(timestamp.getTime() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    if (recentSignups > 5) {
      score += 30;
      flags.push('MULTIPLE_SIGNUPS');
    }

    // Check if IP is from known data center or proxy
    const isDataCenter = await this.isDataCenterIP(ipAddress);
    if (isDataCenter) {
      score += 20;
      flags.push('DATACENTER_IP');
    }

    return { score, flags };
  }

  /**
   * Analyze user agent for anomalies
   */
  private analyzeUserAgent(userAgent: string) {
    const flags: string[] = [];
    let score = 0;

    // Check for empty or very short user agent
    if (!userAgent || userAgent.length < 10) {
      score += 15;
      flags.push('SUSPICIOUS_USER_AGENT');
    }

    // Check for common bot patterns
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
      /headless/i,
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        score += 20;
        flags.push('BOT_USER_AGENT');
        break;
      }
    }

    // Check for outdated browsers
    const outdatedPatterns = [
      /MSIE [6-8]/,
      /Firefox\/[1-9]\./,
      /Chrome\/[1-4]\./,
    ];

    for (const pattern of outdatedPatterns) {
      if (pattern.test(userAgent)) {
        score += 10;
        flags.push('OUTDATED_BROWSER');
        break;
      }
    }

    return { score, flags };
  }

  /**
   * Check for rapid clicking patterns
   */
  private async checkRapidClicking(referralLinkId: string, ipAddress: string, timestamp: Date) {
    const flags: string[] = [];
    let score = 0;

    // Check clicks in last minute
    const clicksLastMinute = await this.prisma.referralClick.count({
      where: {
        referralLinkId,
        ipAddress,
        timestamp: {
          gte: new Date(timestamp.getTime() - 60 * 1000), // Last minute
        },
      },
    });

    if (clicksLastMinute > 10) {
      score += 20;
      flags.push('RAPID_CLICKING');
    }

    // Check for exact timestamp patterns (bot-like behavior)
    const recentClicks = await this.prisma.referralClick.findMany({
      where: {
        referralLinkId,
        ipAddress,
        timestamp: {
          gte: new Date(timestamp.getTime() - 10 * 60 * 1000), // Last 10 minutes
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    // Check if clicks are at regular intervals (bot behavior)
    if (recentClicks.length >= 5) {
      const intervals = [];
      for (let i = 1; i < recentClicks.length; i++) {
        intervals.push(
          recentClicks[i - 1].timestamp.getTime() - recentClicks[i].timestamp.getTime(),
        );
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => {
        return sum + Math.pow(interval - avgInterval, 2);
      }, 0) / intervals.length;

      // Low variance indicates bot-like regular intervals
      if (variance < 1000) { // Less than 1 second variance
        score += 25;
        flags.push('REGULAR_INTERVALS');
      }
    }

    return { score, flags };
  }

  /**
   * Check for proxy/VPN usage
   */
  private async checkProxyUsage(ipAddress: string) {
    const flags: string[] = [];
    let score = 0;

    // In a real implementation, you would use a service like MaxMind, IP2Location, etc.
    // For now, we'll do basic checks

    // Check if IP is in private ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
    ];

    for (const range of privateRanges) {
      if (range.test(ipAddress)) {
        score += 15;
        flags.push('PRIVATE_IP');
        break;
      }
    }

    // Check for known proxy ports (simplified)
    const proxyPorts = [8080, 3128, 8888, 1080, 80];
    for (const port of proxyPorts) {
      if (ipAddress.includes(`:${port}`)) {
        score += 10;
        flags.push('PROXY_PORT');
        break;
      }
    }

    return { score, flags };
  }

  /**
   * Check for self-referral
   */
  private async checkSelfReferral(
    referralLinkId: string,
    referredUserId: string,
    ipAddress: string,
  ) {
    // Get the affiliate who owns this referral link
    const referralLink = await this.prisma.referralLink.findUnique({
      where: { id: referralLinkId },
      include: { affiliate: { include: { user: true } } },
    });

    if (!referralLink) {
      return { isSelfReferral: false };
    }

    // Check if referred user is the affiliate
    if (referralLink.affiliate.userId === referredUserId) {
      return { isSelfReferral: true };
    }

    // Check if IP address matches affiliate's recent activity
    const affiliateRecentActivity = await this.prisma.userLocation.findMany({
      where: {
        userId: referralLink.affiliate.userId,
        ipAddress,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    });

    if (affiliateRecentActivity.length > 0) {
      return { isSelfReferral: true };
    }

    return { isSelfReferral: false };
  }

  /**
   * Check for duplicate accounts
   */
  private async checkDuplicateAccounts(userId: string, ipAddress: string) {
    // Check if other users have signed up from same IP
    const otherUsersFromIP = await this.prisma.referralSignup.findMany({
      where: {
        ipAddress,
        referredUserId: { not: userId },
      },
      distinct: ['referredUserId'],
    });

    return { isDuplicate: otherUsersFromIP.length > 2 };
  }

  /**
   * Analyze signup patterns
   */
  private async analyzeSignupPatterns(
    referralLinkId: string,
    ipAddress: string,
    timestamp: Date,
  ) {
    const flags: string[] = [];
    let score = 0;

    // Check for multiple signups from same IP for same affiliate
    const signupsFromIP = await this.prisma.referralSignup.count({
      where: {
        referralLink: { affiliateId: { not: undefined } },
        ipAddress,
        timestamp: {
          gte: new Date(timestamp.getTime() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    if (signupsFromIP > 3) {
      score += 20;
      flags.push('MULTIPLE_SIGNUPS_SAME_AFFILIATE');
    }

    return { score, flags };
  }

  /**
   * Check if IP is from data center
   */
  private async isDataCenterIP(ipAddress: string): Promise<boolean> {
    // In a real implementation, you would use a geolocation/IP intelligence service
    // For now, return false (would implement with service like MaxMind)
    return false;
  }

  /**
   * Get fraud statistics
   */
  async getFraudStatistics() {
    const stats = await this.prisma.affiliateFraudFlag.groupBy({
      by: ['type', 'severity', 'status'],
      _count: true,
    });

    const totalFlags = await this.prisma.affiliateFraudFlag.count();
    const activeFlags = await this.prisma.affiliateFraudFlag.count({
      where: { status: FraudStatus.ACTIVE },
    });

    return {
      totalFlags,
      activeFlags,
      breakdown: stats,
    };
  }

  /**
   * Review high-risk affiliates
   */
  async getHighRiskAffiliates() {
    // Get affiliates with multiple fraud flags
    const affiliatesWithFlags = await this.prisma.affiliateFraudFlag.groupBy({
      by: ['affiliateId'],
      where: { status: FraudStatus.ACTIVE },
      _count: true,
      having: {
        affiliateId: {
          _count: {
            gt: 2,
          },
        },
      },
    });

    const affiliateIds = affiliatesWithFlags.map(f => f.affiliateId);

    if (affiliateIds.length === 0) {
      return [];
    }

    return await this.prisma.affiliate.findMany({
      where: { id: { in: affiliateIds } },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            walletAddress: true,
          },
        },
        fraudFlags: {
          where: { status: FraudStatus.ACTIVE },
        },
        _count: {
          select: {
            fraudFlags: true,
          },
        },
      },
    });
  }
}
