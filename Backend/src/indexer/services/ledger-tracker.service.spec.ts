import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LedgerTrackerService } from './ledger-tracker.service';
import { PrismaService } from '../../prisma.service';
import { LedgerInfo } from '../types/ledger.types';

describe('LedgerTrackerService', () => {
  let service: LedgerTrackerService;
  let prisma: PrismaService;
  let configService: ConfigService;

  const mockPrismaService = {
    ledgerCursor: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    processedEvent: {
      count: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    indexerLog: {
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      if (key === 'INDEXER_REORG_DEPTH_THRESHOLD') return 5;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerTrackerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LedgerTrackerService>(LedgerTrackerService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLastCursor', () => {
    it('should return cursor if found', async () => {
      const mockCursor = {
        id: '1',
        network: 'testnet',
        lastLedgerSeq: 100,
        lastLedgerHash: 'hash',
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      (prisma.ledgerCursor.findUnique as jest.Mock).mockResolvedValue(mockCursor);

      const result = await service.getLastCursor();
      expect(result).toEqual({
        ...mockCursor,
        lastLedgerHash: 'hash',
      });
      expect(prisma.ledgerCursor.findUnique).toHaveBeenCalledWith({
        where: { network: 'testnet' },
      });
    });

    it('should return null if not found', async () => {
      (prisma.ledgerCursor.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.getLastCursor();
      expect(result).toBeNull();
    });
  });

  describe('detectReorg', () => {
    it('should return no reorg if no cursor exists', async () => {
      (prisma.ledgerCursor.findUnique as jest.Mock).mockResolvedValue(null);
      const ledgerInfo: LedgerInfo = {
        sequence: 100,
        hash: 'new-hash',
        prevHash: 'prev-hash',
        closedAt: new Date(),
        successfulTransactionCount: 1,
        failedTransactionCount: 0,
      };

      const result = await service.detectReorg(ledgerInfo);
      expect(result.hasReorg).toBe(false);
    });

    it('should detect reorg if hashes differ for same sequence', async () => {
      (prisma.ledgerCursor.findUnique as jest.Mock).mockResolvedValue({
        lastLedgerSeq: 100,
        lastLedgerHash: 'old-hash',
      });
      const ledgerInfo: LedgerInfo = {
        sequence: 100,
        hash: 'new-hash',
        prevHash: 'prev-hash',
        closedAt: new Date(),
        successfulTransactionCount: 1,
        failedTransactionCount: 0,
      };

      const result = await service.detectReorg(ledgerInfo);
      expect(result.hasReorg).toBe(true);
      expect(result.reorgDepth).toBe(1);
    });

    it('should detect reorg if current ledger is behind cursor', async () => {
      (prisma.ledgerCursor.findUnique as jest.Mock).mockResolvedValue({
        lastLedgerSeq: 110,
        lastLedgerHash: 'hash-110',
      });
      const ledgerInfo: LedgerInfo = {
        sequence: 105,
        hash: 'hash-105',
        prevHash: 'prev-hash',
        closedAt: new Date(),
        successfulTransactionCount: 1,
        failedTransactionCount: 0,
      };

      const result = await service.detectReorg(ledgerInfo);
      expect(result.hasReorg).toBe(true);
      expect(result.reorgDepth).toBe(5);
    });
  });

  describe('handleReorg', () => {
    it('should roll back events and update cursor', async () => {
      const reorgResult = {
        hasReorg: true,
        reorgDepth: 3,
        lastValidLedger: 100,
        newLatestLedger: 100,
      };

      const result = await service.handleReorg(reorgResult);
      
      // lastValidLedger (100) - (reorgDepth (3) + 2) = 95
      expect(result).toBe(95);
      expect(prisma.processedEvent.deleteMany).toHaveBeenCalled();
      expect(prisma.ledgerCursor.update).toHaveBeenCalledWith({
        where: { network: 'testnet' },
        data: {
          lastLedgerSeq: 95,
          lastLedgerHash: null,
        },
      });
    });
  });

  describe('isEventProcessed', () => {
    it('should return true if event exists in processed_events', async () => {
      (prisma.processedEvent.count as jest.Mock).mockResolvedValue(1);
      const result = await service.isEventProcessed('event-1');
      expect(result).toBe(true);
    });

    it('should return false if event does not exist', async () => {
      (prisma.processedEvent.count as jest.Mock).mockResolvedValue(0);
      const result = await service.isEventProcessed('event-2');
      expect(result).toBe(false);
    });
  });
});
