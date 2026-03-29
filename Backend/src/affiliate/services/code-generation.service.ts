import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { generateReferralCode } from '../utils/referral-code-generator';

@Injectable()
export class CodeGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a unique referral code for an affiliate
   */
  async generateReferralCode(userId: string, customCode?: string): Promise<string> {
    let code: string;

    if (customCode) {
      // Validate custom code
      if (!this.isValidCustomCode(customCode)) {
        throw new BadRequestException('Invalid custom code format');
      }

      // Check if custom code is already taken
      const existing = await this.prisma.affiliate.findUnique({
        where: { referralCode: customCode },
      });

      if (existing) {
        throw new BadRequestException('Custom code already taken');
      }

      code = customCode.toUpperCase();
    } else {
      // Generate unique code
      code = await this.generateUniqueCode();
    }

    return code;
  }

  /**
   * Generate multiple unique referral codes for bulk operations
   */
  async generateMultipleReferralCodes(count: number): Promise<string[]> {
    const codes: string[] = [];
    const existingCodes = new Set();

    // Get existing codes to avoid duplicates
    const existingAffiliates = await this.prisma.affiliate.findMany({
      select: { referralCode: true },
    });
    existingAffiliates.forEach(a => existingCodes.add(a.referralCode));

    while (codes.length < count) {
      const code = generateReferralCode();
      if (!existingCodes.has(code) && !codes.includes(code)) {
        codes.push(code);
      }
    }

    return codes;
  }

  /**
   * Generate a unique tracking link
   */
  async generateTrackingLink(referralCode: string, campaignId?: string): Promise<string> {
    const baseUrl = process.env.BASE_URL || 'https://stellara.network';
    const trackingParams = new URLSearchParams({
      ref: referralCode,
    });

    if (campaignId) {
      trackingParams.append('campaign', campaignId);
    }

    return `${baseUrl}/signup?${trackingParams.toString()}`;
  }

  /**
   * Generate a short URL for referral links
   */
  async generateShortUrl(fullUrl: string): Promise<string> {
    const shortCode = randomBytes(4).toString('hex').toUpperCase();
    const baseUrl = process.env.SHORT_URL_BASE || 'https://stellara.io';
    
    // In a real implementation, you would store this mapping in the database
    // For now, return a deterministic short URL
    return `${baseUrl}/r/${shortCode}`;
  }

  /**
   * Validate custom code format
   */
  private isValidCustomCode(code: string): boolean {
    // Must be 3-20 characters, alphanumeric and hyphens only
    const codeRegex = /^[A-Z0-9-]{3,20}$/i;
    return codeRegex.test(code) && !code.startsWith('-') && !code.endsWith('-');
  }

  /**
   * Generate a unique code automatically
   */
  private async generateUniqueCode(): Promise<string> {
    const maxAttempts = 100;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const code = generateReferralCode();
      
      // Check if code exists
      const existing = await this.prisma.affiliate.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }

      attempts++;
    }

    throw new BadRequestException('Unable to generate unique code after multiple attempts');
  }

  /**
   * Generate campaign-specific referral codes
   */
  async generateCampaignCodes(campaignId: string, affiliateIds: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    for (const affiliateId of affiliateIds) {
      const affiliate = await this.prisma.affiliate.findUnique({
        where: { id: affiliateId },
        include: { user: true },
      });

      if (!affiliate) {
        continue;
      }

      // Generate campaign-specific code
      const campaignCode = `${affiliate.referralCode}-${campaignId.slice(0, 4).toUpperCase()}`;
      
      try {
        const uniqueCode = await this.generateUniqueCodeWithPrefix(campaignCode);
        results.set(affiliateId, uniqueCode);
      } catch (error) {
        // Fallback to base code
        results.set(affiliateId, affiliate.referralCode);
      }
    }

    return results;
  }

  /**
   * Generate code with specific prefix
   */
  private async generateUniqueCodeWithPrefix(prefix: string): Promise<string> {
    const maxAttempts = 50;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const suffix = randomBytes(2).toString('hex').toUpperCase();
      const code = `${prefix}${suffix}`;
      
      const existing = await this.prisma.affiliate.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }

      attempts++;
    }

    throw new BadRequestException('Unable to generate unique campaign code');
  }

  /**
   * Validate referral code format and availability
   */
  async validateReferralCode(code: string): Promise<{ valid: boolean; available: boolean; message?: string }> {
    if (!code || code.length < 3 || code.length > 20) {
      return { valid: false, available: false, message: 'Code must be 3-20 characters' };
    }

    if (!/^[A-Z0-9-]+$/i.test(code)) {
      return { valid: false, available: false, message: 'Code can only contain letters, numbers, and hyphens' };
    }

    if (code.startsWith('-') || code.endsWith('-')) {
      return { valid: false, available: false, message: 'Code cannot start or end with a hyphen' };
    }

    const existing = await this.prisma.affiliate.findUnique({
      where: { referralCode: code.toUpperCase() },
      select: { id: true },
    });

    return {
      valid: true,
      available: !existing,
      message: existing ? 'Code already taken' : undefined,
    };
  }
}
