import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionService } from './commission.service';
import { NotificationService } from '../notification/notification.service';
import { PayoutStatus, CommissionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionService: CommissionService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Process monthly payouts for all affiliates
   */
  async processMonthlyPayouts(periodStart?: Date, periodEnd?: Date) {
    const payoutPeriod = this.getPayoutPeriod(periodStart, periodEnd);
    
    // Get all approved affiliates with pending commissions
    const affiliatesWithPendingCommissions = await this.getAffiliatesWithPendingCommissions(
      payoutPeriod.start,
      payoutPeriod.end,
    );

    const results = {
      successful: 0,
      failed: 0,
      skipped: 0,
      totalAmount: new Decimal(0),
      payouts: [],
    };

    for (const affiliate of affiliatesWithPendingCommissions) {
      try {
        const payout = await this.processAffiliatePayout(affiliate.id, payoutPeriod);
        
        if (payout) {
          results.successful++;
          results.totalAmount = results.totalAmount.add(payout.totalAmount);
          results.payouts.push(payout);
        } else {
          results.skipped++;
        }
      } catch (error) {
        console.error(`Failed to process payout for affiliate ${affiliate.id}:`, error);
        results.failed++;
        
        // Create failed payout record
        await this.createFailedPayout(affiliate.id, payoutPeriod, error.message);
      }
    }

    // Send summary notification to admins
    await this.notificationService.sendAdminNotification({
      type: 'PAYOUT_BATCH_COMPLETED',
      title: 'Monthly Payout Processing Completed',
      message: `Processed ${results.successful} successful payouts, ${results.failed} failed, ${results.skipped} skipped. Total amount: $${results.totalAmount}`,
      data: results,
    });

    return results;
  }

  /**
   * Process payout for a single affiliate
   */
  async processAffiliatePayout(affiliateId: string, payoutPeriod: { start: Date; end: Date }) {
    // Get pending commissions for the period
    const pendingCommissions = await this.prisma.commission.findMany({
      where: {
        affiliateId,
        status: CommissionStatus.APPROVED,
        payoutId: null,
        calculatedAt: {
          gte: payoutPeriod.start,
          lte: payoutPeriod.end,
        },
      },
    });

    if (pendingCommissions.length === 0) {
      return null; // No commissions to payout
    }

    // Calculate total amount
    const totalAmount = pendingCommissions.reduce(
      (sum, commission) => sum.add(commission.amount),
      new Decimal(0),
    );

    // Check minimum payout threshold
    const minPayoutAmount = new Decimal(process.env.MIN_PAYOUT_AMOUNT || '10.00');
    if (totalAmount.lt(minPayoutAmount)) {
      return null; // Below minimum threshold
    }

    // Get affiliate details
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: { user: true },
    });

    if (!affiliate || affiliate.status !== 'APPROVED') {
      throw new BadRequestException('Affiliate not found or not approved');
    }

    // Create payout record
    const payout = await this.prisma.payout.create({
      data: {
        affiliateId,
        totalAmount,
        currency: 'USD',
        status: PayoutStatus.PROCESSING,
        paymentMethod: await this.getPaymentMethod(affiliateId),
        paymentAddress: await this.getPaymentAddress(affiliateId),
        periodStart: payoutPeriod.start,
        periodEnd: payoutPeriod.end,
      },
    });

    // Update commissions to link to this payout
    await this.prisma.commission.updateMany({
      where: {
        id: { in: pendingCommissions.map(c => c.id) },
      },
      data: {
        payoutId: payout.id,
      },
    });

    // Process the actual payment
    try {
      const paymentResult = await this.processPayment(payout);
      
      if (paymentResult.success) {
        // Update payout as completed
        const completedPayout = await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.COMPLETED,
            processedAt: new Date(),
            transactionHash: paymentResult.transactionHash,
          },
        });

        // Mark commissions as paid
        await this.prisma.commission.updateMany({
          where: { payoutId: payout.id },
          data: {
            status: CommissionStatus.PAID,
            paidAt: new Date(),
          },
        });

        // Send notification to affiliate
        await this.notificationService.sendNotification(affiliate.userId, {
          type: 'PAYOUT_PROCESSED',
          title: 'Commission Payout Processed',
          message: `Your commission payout of $${totalAmount} has been processed successfully.`,
          data: {
            payoutId: payout.id,
            amount: totalAmount.toString(),
            transactionHash: paymentResult.transactionHash,
          },
        });

        return completedPayout;
      } else {
        // Mark payout as failed
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.FAILED,
            failedAt: new Date(),
            failureReason: paymentResult.error,
          },
        });

        throw new Error(paymentResult.error);
      }
    } catch (error) {
      // Mark payout as failed
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.FAILED,
          failedAt: new Date(),
          failureReason: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Get payment method for affiliate
   */
  private async getPaymentMethod(affiliateId: string): Promise<string> {
    // In a real implementation, this would come from affiliate preferences
    // For now, default to bank transfer
    return 'BANK_TRANSFER';
  }

  /**
   * Get payment address for affiliate
   */
  private async getPaymentAddress(affiliateId: string): Promise<string> {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: { user: true },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    // In a real implementation, this would come from affiliate's payment settings
    // For now, use their wallet address
    return affiliate.user.walletAddress;
  }

  /**
   * Process the actual payment
   */
  private async processPayment(payout: any): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      // In a real implementation, this would integrate with payment providers
      // like Stripe, PayPal, bank transfers, or cryptocurrency payments
      
      // For demo purposes, we'll simulate a successful payment
      const transactionHash = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        success: true,
        transactionHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get affiliates with pending commissions
   */
  private async getAffiliatesWithPendingCommissions(periodStart: Date, periodEnd: Date) {
    const affiliates = await this.prisma.commission.findMany({
      where: {
        status: CommissionStatus.APPROVED,
        payoutId: null,
        calculatedAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      distinct: ['affiliateId'],
      select: { affiliateId: true },
    });

    return await this.prisma.affiliate.findMany({
      where: {
        id: { in: affiliates.map(a => a.affiliateId) },
        status: 'APPROVED',
      },
    });
  }

  /**
   * Create failed payout record
   */
  private async createFailedPayout(affiliateId: string, payoutPeriod: { start: Date; end: Date }, error: string) {
    await this.prisma.payout.create({
      data: {
        affiliateId,
        totalAmount: new Decimal(0),
        currency: 'USD',
        status: PayoutStatus.FAILED,
        failedAt: new Date(),
        failureReason: error,
        periodStart: payoutPeriod.start,
        periodEnd: payoutPeriod.end,
      },
    });
  }

  /**
   * Get payout period
   */
  private getPayoutPeriod(periodStart?: Date, periodEnd?: Date) {
    const now = new Date();
    
    if (periodStart && periodEnd) {
      return { start: periodStart, end: periodEnd };
    }

    // Default to previous calendar month
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    return {
      start: lastMonth,
      end: endOfLastMonth,
    };
  }

  /**
   * Get payout history for an affiliate
   */
  async getPayoutHistory(affiliateId: string, filters: {
    status?: PayoutStatus;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, status, startDate, endDate } = filters;
    const skip = (page - 1) * limit;

    const where: any = { affiliateId };

    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        include: {
          commissions: {
            select: {
              id: true,
              amount: true,
              type: true,
              calculatedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      payouts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get pending commissions for an affiliate
   */
  async getPendingCommissions(affiliateId: string) {
    return await this.commissionService.getPendingCommissions(affiliateId);
  }

  /**
   * Request manual payout
   */
  async requestManualPayout(affiliateId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new NotFoundException('Affiliate not found');
    }

    if (affiliate.status !== 'APPROVED') {
      throw new BadRequestException('Affiliate is not approved');
    }

    // Get current period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Check if payout already exists for this period
    const existingPayout = await this.prisma.payout.findFirst({
      where: {
        affiliateId,
        periodStart,
        periodEnd,
      },
    });

    if (existingPayout) {
      throw new BadRequestException('Payout already exists for this period');
    }

    // Process the payout
    const payoutPeriod = { start: periodStart, end: periodEnd };
    return await this.processAffiliatePayout(affiliateId, payoutPeriod);
  }

  /**
   * Get payout statistics
   */
  async getPayoutStatistics(affiliateId?: string) {
    const whereClause = affiliateId ? { affiliateId } : {};

    const [totalPayouts, pendingPayouts, completedPayouts, failedPayouts] = await Promise.all([
      this.prisma.payout.aggregate({
        where: whereClause,
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.payout.count({
        where: { ...whereClause, status: PayoutStatus.PENDING },
      }),
      this.prisma.payout.count({
        where: { ...whereClause, status: PayoutStatus.COMPLETED },
      }),
      this.prisma.payout.count({
        where: { ...whereClause, status: PayoutStatus.FAILED },
      }),
    ]);

    return {
      totalAmount: totalPayouts._sum.totalAmount || new Decimal(0),
      totalCount: totalPayouts._count,
      pendingCount: pendingPayouts,
      completedCount: completedPayouts,
      failedCount: failedPayouts,
    };
  }

  /**
   * Retry failed payout
   */
  async retryFailedPayout(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { affiliate: true },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status !== PayoutStatus.FAILED) {
      throw new BadRequestException('Payout is not in failed status');
    }

    // Update status to processing
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.PROCESSING,
        failedAt: null,
        failureReason: null,
      },
    });

    // Retry the payment
    try {
      const paymentResult = await this.processPayment(payout);
      
      if (paymentResult.success) {
        await this.prisma.payout.update({
          where: { id: payoutId },
          data: {
            status: PayoutStatus.COMPLETED,
            processedAt: new Date(),
            transactionHash: paymentResult.transactionHash,
          },
        });

        // Mark commissions as paid
        await this.prisma.commission.updateMany({
          where: { payoutId },
          data: {
            status: CommissionStatus.PAID,
            paidAt: new Date(),
          },
        });

        // Send notification to affiliate
        await this.notificationService.sendNotification(payout.affiliate.userId, {
          type: 'PAYOUT_RETRY_SUCCESS',
          title: 'Payout Retry Successful',
          message: `Your payout retry of $${payout.totalAmount} was successful.`,
          data: {
            payoutId: payout.id,
            amount: payout.totalAmount.toString(),
            transactionHash: paymentResult.transactionHash,
          },
        });

        return await this.prisma.payout.findUnique({ where: { id: payoutId } });
      } else {
        await this.prisma.payout.update({
          where: { id: payoutId },
          data: {
            status: PayoutStatus.FAILED,
            failedAt: new Date(),
            failureReason: paymentResult.error,
          },
        });

        throw new Error(paymentResult.error);
      }
    } catch (error) {
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.FAILED,
          failedAt: new Date(),
          failureReason: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Cancel payout
   */
  async cancelPayout(payoutId: string, reason: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status === PayoutStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed payout');
    }

    // Update payout status
    const updatedPayout = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.CANCELLED,
        failureReason: reason,
      },
    });

    // Release commissions back to pending status
    await this.prisma.commission.updateMany({
      where: { payoutId },
      data: {
        payoutId: null,
        status: CommissionStatus.APPROVED,
      },
    });

    return updatedPayout;
  }
}
