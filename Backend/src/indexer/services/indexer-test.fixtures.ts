import { ContractEventType, SorobanEvent, ParsedContractEvent } from '../types/event-types';

export const mockSorobanEvent = (overrides: Partial<SorobanEvent> = {}): SorobanEvent => ({
  type: 'contract',
  ledger: 1000,
  ledgerClosedAt: new Date().toISOString(),
  contractId: 'C1234567890ABCDEF',
  id: 'event-1',
  pagingToken: 'token-1',
  topic: [ContractEventType.PROJECT_CREATED],
  value: 'mock-xdr-value',
  inSuccessfulContractCall: true,
  txHash: 'hash-1',
  ...overrides,
});

export const mockParsedContractEvent = (overrides: Partial<ParsedContractEvent> = {}): ParsedContractEvent => ({
  eventId: 'event-1',
  ledgerSeq: 1000,
  ledgerClosedAt: new Date(),
  contractId: 'C1234567890ABCDEF',
  eventType: ContractEventType.PROJECT_CREATED,
  transactionHash: 'hash-1',
  data: {
    projectId: 1,
    creator: 'GABC...',
    fundingGoal: '1000',
    deadline: Math.floor(Date.now() / 1000) + 86400,
    token: 'XLM',
  },
  inSuccessfulContractCall: true,
  ...overrides,
});

export const mockProjectCreatedEvent = {
  projectId: 1,
  creator: 'GABC...',
  fundingGoal: '1000000000',
  deadline: 1700000000,
  token: 'CASSET',
};

export const mockContributionMadeEvent = {
  projectId: 1,
  contributor: 'GCONTRIBUTOR...',
  amount: '500',
  totalRaised: '1500',
};

export const mockMilestoneApprovedEvent = {
  projectId: 1,
  milestoneId: 0,
  approvalCount: 3,
};
