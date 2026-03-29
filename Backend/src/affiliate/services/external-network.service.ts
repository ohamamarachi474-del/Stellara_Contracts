import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalAffiliateNetwork, SyncStatus } from '@prisma/client';

@Injectable()
export class ExternalNetworkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Connect affiliate account to external network
   */
  async connectExternalAccount(affiliateId: string, data: {
    network: ExternalAffiliateNetwork;
    externalId: string;
    credentials: Record<string, string>;
  }) {
    // Check if affiliate exists
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    // Check if already connected to this network
    const existing = await this.prisma.externalAffiliateAccount.findFirst({
      where: {
        affiliateId,
        network: data.network,
      },
    });

    if (existing) {
      throw new BadRequestException('Already connected to this network');
    }

    // Validate credentials based on network
    await this.validateCredentials(data.network, data.credentials);

    // Encrypt credentials (in real implementation, use proper encryption)
    const encryptedCredentials = await this.encryptCredentials(data.credentials);

    // Create external account
    const externalAccount = await this.prisma.externalAffiliateAccount.create({
      data: {
        affiliateId,
        network: data.network,
        externalId: data.externalId,
        credentials: encryptedCredentials,
        isActive: true,
        syncStatus: SyncStatus.PENDING,
      },
    });

    // Initial sync
    await this.syncAccountData(externalAccount.id);

    return externalAccount;
  }

  /**
   * Sync data from external network
   */
  async syncAccountData(externalAccountId: string) {
    const externalAccount = await this.prisma.externalAffiliateAccount.findUnique({
      where: { id: externalAccountId },
    });

    if (!externalAccount) {
      throw new NotFoundException('External account not found');
    }

    // Update status to in progress
    await this.prisma.externalAffiliateAccount.update({
      where: { id: externalAccountId },
      data: {
        syncStatus: SyncStatus.IN_PROGRESS,
        lastSyncAt: new Date(),
      },
    });

    try {
      // Decrypt credentials
      const credentials = await this.decryptCredentials(externalAccount.credentials);

      // Sync based on network
      switch (externalAccount.network) {
        case ExternalAffiliateNetwork.SHAREASALE:
          await this.syncShareASaleData(externalAccount, credentials);
          break;
        case ExternalAffiliateNetwork.COMMISSION_JUNCTION:
          await this.syncCommissionJunctionData(externalAccount, credentials);
          break;
        case ExternalAffiliateNetwork.RAKUTEN:
          await this.syncRakutenData(externalAccount, credentials);
          break;
        case ExternalAffiliateNetwork.IMPACT_RADIUS:
          await this.syncImpactRadiusData(externalAccount, credentials);
          break;
        default:
          throw new BadRequestException('Unsupported network');
      }

      // Update status to success
      await this.prisma.externalAffiliateAccount.update({
        where: { id: externalAccountId },
        data: {
          syncStatus: SyncStatus.SUCCESS,
          lastSyncAt: new Date(),
        },
      });

    } catch (error) {
      // Update status to failed
      await this.prisma.externalAffiliateAccount.update({
        where: { id: externalAccountId },
        data: {
          syncStatus: SyncStatus.FAILED,
          lastSyncAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Sync ShareASale data
   */
  private async syncShareASaleData(externalAccount: any, credentials: Record<string, string>) {
    // In a real implementation, this would make API calls to ShareASale
    // For demo purposes, we'll simulate the sync
    
    const { apiKey, affiliateId: shareasaleId } = credentials;
    
    if (!apiKey || !shareasaleId) {
      throw new BadRequestException('Missing ShareASale credentials');
    }

    // Simulate API call
    console.log(`Syncing ShareASale data for affiliate ${shareasaleId}`);
    
    // In real implementation:
    // 1. Fetch commission data
    // 2. Fetch click data
    // 3. Fetch conversion data
    // 4. Update local database with synced data
    
    // Store sync metadata
    await this.prisma.externalAffiliateAccount.update({
      where: { id: externalAccount.id },
      data: {
        metadata: {
          lastSyncData: {
            commissions: 0,
            clicks: 0,
            conversions: 0,
            syncedAt: new Date(),
          },
        },
      },
    });
  }

  /**
   * Sync Commission Junction data
   */
  private async syncCommissionJunctionData(externalAccount: any, credentials: Record<string, string>) {
    const { apiKey, cid, websiteId } = credentials;
    
    if (!apiKey || !cid || !websiteId) {
      throw new BadRequestException('Missing Commission Junction credentials');
    }

    console.log(`Syncing Commission Junction data for CID ${cid}`);
    
    // In real implementation, make API calls to CJ
    // For now, just update metadata
    await this.prisma.externalAffiliateAccount.update({
      where: { id: externalAccount.id },
      data: {
        metadata: {
          lastSyncData: {
            cid,
            websiteId,
            commissions: 0,
            clicks: 0,
            conversions: 0,
            syncedAt: new Date(),
          },
        },
      },
    });
  }

  /**
   * Sync Rakuten data
   */
  private async syncRakutenData(externalAccount: any, credentials: Record<string, string>) {
    const { apiKey, publisherId } = credentials;
    
    if (!apiKey || !publisherId) {
      throw new BadRequestException('Missing Rakuten credentials');
    }

    console.log(`Syncing Rakuten data for publisher ${publisherId}`);
    
    // In real implementation, make API calls to Rakuten
    await this.prisma.externalAffiliateAccount.update({
      where: { id: externalAccount.id },
      data: {
        metadata: {
          lastSyncData: {
            publisherId,
            commissions: 0,
            clicks: 0,
            conversions: 0,
            syncedAt: new Date(),
          },
        },
      },
    });
  }

  /**
   * Sync Impact Radius data
   */
  private async syncImpactRadiusData(externalAccount: any, credentials: Record<string, string>) {
    const { apiKey, accountSid, mediaId } = credentials;
    
    if (!apiKey || !accountSid || !mediaId) {
      throw new BadRequestException('Missing Impact Radius credentials');
    }

    console.log(`Syncing Impact Radius data for account ${accountSid}`);
    
    // In real implementation, make API calls to Impact Radius
    await this.prisma.externalAffiliateAccount.update({
      where: { id: externalAccount.id },
      data: {
        metadata: {
          lastSyncData: {
            accountSid,
            mediaId,
            commissions: 0,
            clicks: 0,
            conversions: 0,
            syncedAt: new Date(),
          },
        },
      },
    });
  }

  /**
   * Validate credentials for specific network
   */
  private async validateCredentials(network: ExternalAffiliateNetwork, credentials: Record<string, string>) {
    switch (network) {
      case ExternalAffiliateNetwork.SHAREASALE:
        if (!credentials.apiKey || !credentials.affiliateId) {
          throw new BadRequestException('ShareASale requires apiKey and affiliateId');
        }
        break;
      case ExternalAffiliateNetwork.COMMISSION_JUNCTION:
        if (!credentials.apiKey || !credentials.cid || !credentials.websiteId) {
          throw new BadRequestException('Commission Junction requires apiKey, cid, and websiteId');
        }
        break;
      case ExternalAffiliateNetwork.RAKUTEN:
        if (!credentials.apiKey || !credentials.publisherId) {
          throw new BadRequestException('Rakuten requires apiKey and publisherId');
        }
        break;
      case ExternalAffiliateNetwork.IMPACT_RADIUS:
        if (!credentials.apiKey || !credentials.accountSid || !credentials.mediaId) {
          throw new BadRequestException('Impact Radius requires apiKey, accountSid, and mediaId');
        }
        break;
      default:
        throw new BadRequestException('Unsupported network');
    }
  }

  /**
   * Encrypt credentials (simplified implementation)
   */
  private async encryptCredentials(credentials: Record<string, string>): Promise<any> {
    // In a real implementation, use proper encryption like AES-256
    // For now, just return as-is (NOT SECURE - for demo only)
    return {
      encrypted: true,
      data: credentials,
      timestamp: new Date(),
    };
  }

  /**
   * Decrypt credentials (simplified implementation)
   */
  private async decryptCredentials(encryptedCredentials: any): Promise<Record<string, string>> {
    // In a real implementation, use proper decryption
    // For now, just return the data (NOT SECURE - for demo only)
    return encryptedCredentials.data || encryptedCredentials;
  }

  /**
   * Get external accounts for an affiliate
   */
  async getExternalAccounts(affiliateId: string) {
    return await this.prisma.externalAffiliateAccount.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Disconnect external account
   */
  async disconnectExternalAccount(affiliateId: string, network: ExternalAffiliateNetwork) {
    const externalAccount = await this.prisma.externalAffiliateAccount.findFirst({
      where: {
        affiliateId,
        network,
      },
    });

    if (!externalAccount) {
      throw new NotFoundException('External account not found');
    }

    return await this.prisma.externalAffiliateAccount.delete({
      where: { id: externalAccount.id },
    });
  }

  /**
   * Update external account credentials
   */
  async updateCredentials(affiliateId: string, network: ExternalAffiliateNetwork, credentials: Record<string, string>) {
    const externalAccount = await this.prisma.externalAffiliateAccount.findFirst({
      where: {
        affiliateId,
        network,
      },
    });

    if (!externalAccount) {
      throw new NotFoundException('External account not found');
    }

    // Validate new credentials
    await this.validateCredentials(network, credentials);

    // Encrypt and update credentials
    const encryptedCredentials = await this.encryptCredentials(credentials);

    const updatedAccount = await this.prisma.externalAffiliateAccount.update({
      where: { id: externalAccount.id },
      data: {
        credentials: encryptedCredentials,
        syncStatus: SyncStatus.PENDING,
      },
    });

    // Trigger sync with new credentials
    await this.syncAccountData(externalAccount.id);

    return updatedAccount;
  }

  /**
   * Get sync status for all external accounts
   */
  async getSyncStatus(affiliateId: string) {
    const accounts = await this.prisma.externalAffiliateAccount.findMany({
      where: { affiliateId },
      select: {
        id: true,
        network: true,
        syncStatus: true,
        lastSyncAt: true,
        isActive: true,
        metadata: true,
      },
    });

    return accounts.map(account => ({
      ...account,
      lastSyncAt: account.lastSyncAt,
      needsSync: !account.lastSyncAt || 
        (new Date().getTime() - account.lastSyncAt.getTime()) > 24 * 60 * 60 * 1000, // 24 hours
    }));
  }

  /**
   * Manually trigger sync for all accounts
   */
  async syncAllAccounts(affiliateId: string) {
    const accounts = await this.prisma.externalAffiliateAccount.findMany({
      where: {
        affiliateId,
        isActive: true,
      },
    });

    const results = {
      successful: 0,
      failed: 0,
      total: accounts.length,
      errors: [],
    };

    for (const account of accounts) {
      try {
        await this.syncAccountData(account.id);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          accountId: account.id,
          network: account.network,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks() {
    return [
      {
        network: ExternalAffiliateNetwork.SHAREASALE,
        name: 'ShareASale',
        description: 'One of the largest affiliate networks with thousands of merchants',
        requiredFields: ['apiKey', 'affiliateId'],
        website: 'https://www.shareasale.com',
      },
      {
        network: ExternalAffiliateNetwork.COMMISSION_JUNCTION,
        name: 'Commission Junction (CJ)',
        description: 'Leading global affiliate marketing network',
        requiredFields: ['apiKey', 'cid', 'websiteId'],
        website: 'https://www.cj.com',
      },
      {
        network: ExternalAffiliateNetwork.RAKUTEN,
        name: 'Rakuten Advertising',
        description: 'Global affiliate marketing network formerly known as LinkShare',
        requiredFields: ['apiKey', 'publisherId'],
        website: 'https://www.rakutenadvertising.com',
      },
      {
        network: ExternalAffiliateNetwork.IMPACT_RADIUS,
        name: 'Impact Radius',
        description: 'Partnership automation platform for affiliate marketing',
        requiredFields: ['apiKey', 'accountSid', 'mediaId'],
        website: 'https://impact.com',
      },
    ];
  }

  /**
   * Get network performance data
   */
  async getNetworkPerformance(affiliateId: string) {
    const accounts = await this.prisma.externalAffiliateAccount.findMany({
      where: {
        affiliateId,
        isActive: true,
      },
    });

    const performance = [];

    for (const account of accounts) {
      const metadata = account.metadata as any;
      const lastSyncData = metadata?.lastSyncData || {};

      performance.push({
        network: account.network,
        syncStatus: account.syncStatus,
        lastSyncAt: account.lastSyncAt,
        performance: {
          commissions: lastSyncData.commissions || 0,
          clicks: lastSyncData.clicks || 0,
          conversions: lastSyncData.conversions || 0,
        },
      });
    }

    return performance;
  }

  /**
   * Toggle account active status
   */
  async toggleAccountStatus(affiliateId: string, network: ExternalAffiliateNetwork) {
    const externalAccount = await this.prisma.externalAffiliateAccount.findFirst({
      where: {
        affiliateId,
        network,
      },
    });

    if (!externalAccount) {
      throw new NotFoundException('External account not found');
    }

    return await this.prisma.externalAffiliateAccount.update({
      where: { id: externalAccount.id },
      data: {
        isActive: !externalAccount.isActive,
      },
    });
  }
}
