import { IsString, IsOptional, IsObject, IsUrl, IsEmail, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterAffiliateDto {
  @ApiPropertyOptional({ description: 'Custom referral code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customCode?: string;

  @ApiPropertyOptional({ description: 'Affiliate bio' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsUrl()
  profileImage?: string;

  @ApiPropertyOptional({ description: 'Social media links' })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Marketing preferences' })
  @IsOptional()
  @IsObject()
  marketingPreferences?: Record<string, any>;
}

export class UpdateAffiliateProfileDto {
  @ApiPropertyOptional({ description: 'Affiliate bio' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsUrl()
  profileImage?: string;

  @ApiPropertyOptional({ description: 'Social media links' })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Marketing preferences' })
  @IsOptional()
  @IsObject()
  marketingPreferences?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Custom landing page URL' })
  @IsOptional()
  @IsUrl()
  customLandingPage?: string;
}

export class CreateReferralLinkDto {
  @ApiPropertyOptional({ description: 'Link name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Link description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Destination URL' })
  @IsOptional()
  @IsUrl()
  destinationUrl?: string;

  @ApiPropertyOptional({ description: 'Campaign ID' })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Custom referral code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customCode?: string;
}

export class UpdateReferralLinkDto {
  @ApiPropertyOptional({ description: 'Link name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Link description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Destination URL' })
  @IsOptional()
  @IsUrl()
  destinationUrl?: string;

  @ApiPropertyOptional({ description: 'Is link active' })
  @IsOptional()
  isActive?: boolean;
}

export class TrackClickDto {
  @ApiProperty({ description: 'Referral code' })
  @IsString()
  referralCode: string;

  @ApiProperty({ description: 'IP address' })
  @IsString()
  ipAddress: string;

  @ApiPropertyOptional({ description: 'User agent' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Referer' })
  @IsOptional()
  @IsString()
  referer?: string;

  @ApiPropertyOptional({ description: 'Campaign ID' })
  @IsOptional()
  @IsString()
  campaignId?: string;
}

export class TrackSignupDto {
  @ApiProperty({ description: 'Referral code' })
  @IsString()
  referralCode: string;

  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'IP address' })
  @IsString()
  ipAddress: string;

  @ApiPropertyOptional({ description: 'User agent' })
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class TrackConversionDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ 
    description: 'Conversion type',
    enum: ['FIRST_TRADE', 'DEPOSIT', 'TRADING_VOLUME', 'SUBSCRIPTION', 'CUSTOM_ACTION']
  })
  @IsString()
  type: 'FIRST_TRADE' | 'DEPOSIT' | 'TRADING_VOLUME' | 'SUBSCRIPTION' | 'CUSTOM_ACTION';

  @ApiPropertyOptional({ description: 'Conversion amount' })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ description: 'Currency' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class ConnectExternalNetworkDto {
  @ApiProperty({ 
    description: 'External network',
    enum: ['SHAREASALE', 'COMMISSION_JUNCTION', 'RAKUTEN', 'IMPACT_RADIUS', 'PEFLY', 'CLICKBANK', 'CUSTOM']
  })
  network: string;

  @ApiProperty({ description: 'External affiliate ID' })
  @IsString()
  externalId: string;

  @ApiProperty({ description: 'Network credentials' })
  @IsObject()
  credentials: Record<string, string>;
}

export class UpdateCredentialsDto {
  @ApiProperty({ description: 'Network credentials' })
  @IsObject()
  credentials: Record<string, string>;
}

export class ValidateReferralCodeDto {
  @ApiProperty({ description: 'Referral code to validate' })
  @IsString()
  code: string;
}

export class GenerateCodesDto {
  @ApiProperty({ description: 'Number of codes to generate' })
  number: number;
}

export class GenerateTrackingUrlDto {
  @ApiProperty({ description: 'Referral code' })
  @IsString()
  referralCode: string;

  @ApiPropertyOptional({ description: 'Campaign ID' })
  @IsOptional()
  @IsString()
  campaignId?: string;
}

export class GenerateShortUrlDto {
  @ApiProperty({ description: 'Full URL to shorten' })
  @IsUrl()
  fullUrl: string;
}

export class ApproveAffiliateDto {
  @ApiProperty({ description: 'Approval notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectAffiliateDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class SuspendAffiliateDto {
  @ApiProperty({ description: 'Suspension reason' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class UpdateAffiliateTierDto {
  @ApiProperty({ description: 'New tier level' })
  tier: number;
}

export class ProcessMonthlyPayoutsDto {
  @ApiPropertyOptional({ description: 'Period start date' })
  @IsOptional()
  @IsString()
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Period end date' })
  @IsOptional()
  @IsString()
  periodEnd?: string;
}

export class RequestManualPayoutDto {
  @ApiPropertyOptional({ description: 'Payout notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelPayoutDto {
  @ApiProperty({ description: 'Cancellation reason' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ApproveCommissionsDto {
  @ApiProperty({ description: 'Commission IDs to approve' })
  commissionIds: string[];
}

export class RejectCommissionsDto {
  @ApiProperty({ description: 'Commission IDs to reject' })
  commissionIds: string[];

  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class CalculateCommissionDto {
  @ApiProperty({ description: 'Referral conversion ID' })
  referralConversionId: string;

  @ApiProperty({ description: 'Amount' })
  amount: number;

  @ApiProperty({ description: 'Conversion type' })
  conversionType: string;
}

export class CreateCommissionsDto {
  @ApiProperty({ description: 'Referral conversion ID' })
  referralConversionId: string;

  @ApiProperty({ description: 'Amount' })
  amount: number;

  @ApiProperty({ description: 'Conversion type' })
  conversionType: string;
}

export class BatchProcessPayoutsDto {
  @ApiProperty({ description: 'Affiliate IDs to process' })
  affiliateIds: string[];

  @ApiPropertyOptional({ description: 'Period start date' })
  @IsOptional()
  @IsString()
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Period end date' })
  @IsOptional()
  @IsString()
  periodEnd?: string;
}
