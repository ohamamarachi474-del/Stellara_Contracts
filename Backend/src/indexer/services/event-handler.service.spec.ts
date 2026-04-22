import { Test, TestingModule } from '@nestjs/testing';
import { EventHandlerService } from './event-handler.service';
import { PrismaService } from '../../prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { ReputationService } from '../../reputation/reputation.service';
import { mockParsedContractEvent } from './indexer-test.fixtures';
import { ContractEventType } from '../types/event-types';

describe('EventHandlerService', () => {
  let service: EventHandlerService;
  let prisma: PrismaService;
  let notificationService: NotificationService;
  let reputationService: ReputationService;

  const mockPrismaService = {
    project: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      upsert: jest.fn(),
    },
    contribution: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    milestone: {
      updateMany: jest.fn(),
    },
  };

  const mockNotificationService = {
    notify: jest.fn(),
  };

  const mockReputationService = {
    updateTrustScore: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventHandlerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ReputationService, useValue: mockReputationService },
      ],
    }).compile();

    service = module.get<EventHandlerService>(EventHandlerService);
    prisma = module.get<PrismaService>(PrismaService);
    notificationService = module.get<NotificationService>(NotificationService);
    reputationService = module.get<ReputationService>(ReputationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processEvent', () => {
    it('should route PROJECT_CREATED to correct handler', async () => {
      const event = mockParsedContractEvent({
        eventType: ContractEventType.PROJECT_CREATED,
        data: {
          projectId: 1,
          creator: 'GABC...',
          fundingGoal: '1000',
          deadline: 1700000000,
          token: 'XLM',
        },
      });

      (prisma.user.upsert as jest.Mock).mockResolvedValue({ id: 'user-1' });

      const result = await service.processEvent(event);
      
      expect(result).toBe(true);
      expect(prisma.project.upsert).toHaveBeenCalled();
    });

    it('should route CONTRIBUTION_MADE to correct handler', async () => {
      const event = mockParsedContractEvent({
        eventType: ContractEventType.CONTRIBUTION_MADE,
        data: {
          projectId: 1,
          contributor: 'GCONTRIB...',
          amount: '100',
          totalRaised: '1100',
        },
      });

      (prisma.user.upsert as jest.Mock).mockResolvedValue({ id: 'user-2' });
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'proj-1', title: 'Test Project' });

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.contribution.upsert).toHaveBeenCalled();
      expect(notificationService.notify).toHaveBeenCalled();
    });

    it('should return false if no handler exists for event type', async () => {
      const event = mockParsedContractEvent({
        eventType: ContractEventType.REPO_DELETED as any, // Unsupported type
      });

      const result = await service.processEvent(event);
      expect(result).toBe(false);
    });

    it('should return false if validation fails', async () => {
      const event = mockParsedContractEvent({
        eventType: ContractEventType.PROJECT_CREATED,
        data: {
          projectId: undefined, // Missing required field for validation
        },
      });

      const result = await service.processEvent(event);
      expect(result).toBe(false);
      expect(prisma.project.upsert).not.toHaveBeenCalled();
    });
  });

  describe('Specific Handlers', () => {
    it('MilestoneApprovedHandler should update milestones and notify contributors', async () => {
      const event = mockParsedContractEvent({
        eventType: ContractEventType.MILESTONE_APPROVED,
        data: {
          projectId: 1,
          milestoneId: 2,
        },
      });

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ 
        id: 'proj-1', 
        creatorId: 'creator-1',
        title: 'Project Title' 
      });
      (prisma.contribution.findMany as jest.Mock).mockResolvedValue([
        { investorId: 'investor-1' },
        { investorId: 'investor-2' }
      ]);

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.milestone.updateMany).toHaveBeenCalled();
      expect(notificationService.notify).toHaveBeenCalledTimes(2);
      expect(reputationService.updateTrustScore).toHaveBeenCalledWith('creator-1');
    });
  });
});
