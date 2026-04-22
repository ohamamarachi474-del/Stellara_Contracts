import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from './indexer.service';
import { PrismaService } from '../../prisma.service';
import { LedgerTrackerService } from './ledger-tracker.service';
import { EventHandlerService } from './event-handler.service';
import { mockSorobanEvent } from './indexer-test.fixtures';

// Mock SorobanRpc.Server
jest.mock('@stellar/stellar-sdk', () => {
  return {
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => {
        return {
          getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
          getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
          getEvents: jest.fn(),
        };
      }),
    },
  };
});

import { SorobanRpc } from '@stellar/stellar-sdk';

describe('IndexerService', () => {
  let service: IndexerService;
  let ledgerTracker: LedgerTrackerService;
  let eventHandler: EventHandlerService;
  let rpc: any;

  const mockPrismaService = {};
  
  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'INDEXER_POLL_INTERVAL_MS') return 5000;
      if (key === 'INDEXER_MAX_EVENTS_PER_FETCH') return 10;
      if (key === 'INDEXER_RETRY_ATTEMPTS') return 3;
      return defaultValue;
    }),
  };

  const mockLedgerTracker = {
    getLastCursor: jest.fn(),
    getStartLedger: jest.fn(),
    updateCursor: jest.fn(),
    logProgress: jest.fn(),
    logError: jest.fn(),
    isEventProcessed: jest.fn(),
    markEventProcessed: jest.fn(),
  };

  const mockEventHandler = {
    processEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LedgerTrackerService, useValue: mockLedgerTracker },
        { provide: EventHandlerService, useValue: mockEventHandler },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
    ledgerTracker = module.get<LedgerTrackerService>(LedgerTrackerService);
    eventHandler = module.get<EventHandlerService>(EventHandlerService);
    
    // Access the mocked RPC server instance
    rpc = (SorobanRpc.Server as jest.Mock).mock.results[0].value;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pollEvents', () => {
    it('should skip if already running', async () => {
      (service as any).isRunning = true;
      const logSpy = jest.spyOn((service as any).logger, 'debug');
      
      await service.pollEvents();
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping poll'));
      expect(ledgerTracker.getLastCursor).not.toHaveBeenCalled();
    });

    it('should return if no new ledgers', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 1000 });
      rpc.getLatestLedger.mockResolvedValue({ sequence: 1000 });

      await service.pollEvents();

      expect(rpc.getEvents).not.toHaveBeenCalled();
    });

    it('should fetch and process events', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 990 });
      rpc.getLatestLedger.mockResolvedValue({ sequence: 1000 });
      
      const events = [
        mockSorobanEvent({ id: '1', contractId: 'C1' }),
        mockSorobanEvent({ id: '2', contractId: 'C1' }),
      ];
      rpc.getEvents.mockResolvedValue({ events });
      
      mockLedgerTracker.isEventProcessed.mockResolvedValue(false);
      mockEventHandler.processEvent.mockResolvedValue(true);

      await service.pollEvents();

      expect(rpc.getEvents).toHaveBeenCalled();
      expect(mockEventHandler.processEvent).toHaveBeenCalledTimes(2);
      expect(ledgerTracker.updateCursor).toHaveBeenCalledWith(1000);
    });

    it('should handle RPC errors with retry logic', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 990 });
      rpc.getLatestLedger.mockResolvedValue({ sequence: 1000 });
      
      rpc.getEvents.mockRejectedValueOnce(new Error('RPC Timeout'));
      rpc.getEvents.mockResolvedValueOnce({ events: [] });

      // Reduce sleep time for faster tests
      (service as any).sleep = jest.fn().mockResolvedValue(undefined);

      await service.pollEvents();

      expect(rpc.getEvents).toHaveBeenCalledTimes(2);
      expect(ledgerTracker.updateCursor).toHaveBeenCalledWith(1000);
    });

    it('should log error if all retries fail', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 990 });
      rpc.getLatestLedger.mockResolvedValue({ sequence: 1000 });
      
      rpc.getEvents.mockRejectedValue(new Error('Persistent Error'));
      (service as any).sleep = jest.fn().mockResolvedValue(undefined);

      await service.pollEvents();

      expect(ledgerTracker.logError).toHaveBeenCalledWith(
        'Poll cycle failed',
        expect.objectContaining({ error: expect.stringContaining('Persistent Error') })
      );
    });
  });

  describe('transformRpcEvent', () => {
    it('should transform RPC event to internal SorobanEvent format', () => {
      const rpcEvent = {
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: '2023-01-01T00:00:00Z',
        contractId: { toString: () => 'CONTRACT_ID' },
        id: 'event_id',
        pagingToken: 'paging_token',
        topic: [{ toString: () => 'topic_1' }],
        value: { toString: () => 'value_xdr' },
        inSuccessfulContractCall: true,
        txHash: 'tx_hash',
      };

      const result = (service as any).transformRpcEvent(rpcEvent);

      expect(result).toEqual({
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: '2023-01-01T00:00:00Z',
        contractId: 'CONTRACT_ID',
        id: 'event_id',
        pagingToken: 'paging_token',
        topic: ['topic_1'],
        value: 'value_xdr',
        inSuccessfulContractCall: true,
        txHash: 'tx_hash',
      });
    });
  });
});
