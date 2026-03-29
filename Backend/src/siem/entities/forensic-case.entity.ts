import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum ForensicCaseType {
  SECURITY_BREACH = 'security_breach',
  DATA_BREACH = 'data_breach',
  MALWARE_ANALYSIS = 'malware_analysis',
  NETWORK_INTRUSION = 'network_intrusion',
  INSIDER_THREAT = 'insider_threat',
  FRAUD_INVESTIGATION = 'fraud_investigation',
  COMPLIANCE_AUDIT = 'compliance_audit',
  INCIDENT_RESPONSE = 'incident_response',
}

export enum ForensicCaseStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  ANALYSIS = 'analysis',
  COLLECTION = 'collection',
  PRESERVATION = 'preservation',
  REPORTING = 'reporting',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum EvidenceType {
  LOG_FILE = 'log_file',
  SYSTEM_IMAGE = 'system_image',
  MEMORY_DUMP = 'memory_dump',
  NETWORK_CAPTURE = 'network_capture',
  FILE_SYSTEM = 'file_system',
  REGISTRY = 'registry',
  DATABASE = 'database',
  APPLICATION_DATA = 'application_data',
  USER_DATA = 'user_data',
}

@Entity('forensic_cases')
@Index(['createdAt', 'status'])
@Index(['type', 'priority'])
@Index(['assignedTo', 'status'])
export class ForensicCase {
  @ApiProperty({ description: 'Unique identifier for the forensic case' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Case number' })
  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  caseNumber: string;

  @ApiProperty({ description: 'Case title' })
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({ description: 'Case type', enum: ForensicCaseType })
  @Column({ type: 'enum', enum: ForensicCaseType })
  @Index()
  type: ForensicCaseType;

  @ApiProperty({ description: 'Case status', enum: ForensicCaseStatus })
  @Column({ type: 'enum', enum: ForensicCaseStatus, default: ForensicCaseStatus.OPEN })
  @Index()
  status: ForensicCaseStatus;

  @ApiProperty({ description: 'Case priority' })
  @Column({ type: 'enum', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' })
  @Index()
  priority: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({ description: 'Detailed case description' })
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ description: 'Associated incident ID' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  incidentId?: string;

  @ManyToOne(() => Incident, { nullable: true })
  @JoinColumn({ name: 'incidentId' })
  incident?: Incident;

  @ApiProperty({ description: 'Lead forensic investigator' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  assignedTo?: string;

  @ApiProperty({ description: 'Case team members' })
  @Column({ type: 'uuid', array: true, default: [] })
  teamMembers: string[];

  @ApiProperty({ description: 'Case start timestamp' })
  @Column({ type: 'timestamp with time zone' })
  @Index()
  startedAt: Date;

  @ApiProperty({ description: 'Case end timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  endedAt?: Date;

  @ApiProperty({ description: 'Evidence collection details' })
  @Column({ type: 'jsonb', nullable: true })
  evidenceCollection?: {
    id: string;
    type: EvidenceType;
    description: string;
    source: string;
    collectedBy: string;
    collectedAt: Date;
    hash: string;
    size: number;
    location: string;
    custodyChain: {
      transferredFrom: string;
      transferredTo: string;
      transferredAt: Date;
      purpose: string;
    }[];
  }[];

  @ApiProperty({ description: 'Timeline of events' })
  @Column({ type: 'jsonb', nullable: true })
  timeline?: {
    timestamp: Date;
    event: string;
    source: string;
    evidence: string[];
    significance: 'low' | 'medium' | 'high' | 'critical';
  }[];

  @ApiProperty({ description: 'Analysis findings' })
  @Column({ type: 'jsonb', nullable: true })
  findings?: {
    category: string;
    description: string;
    evidence: string[];
    confidence: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    discoveredAt: Date;
  }[];

  @ApiProperty({ description: 'Tools and techniques used' })
  @Column({ type: 'jsonb', nullable: true })
  toolsUsed?: {
    toolName: string;
    version: string;
    purpose: string;
    usedBy: string;
    usedAt: Date;
    results: string;
  }[];

  @ApiProperty({ description: 'Chain of custody documentation' })
  @Column({ type: 'jsonb', nullable: true })
  chainOfCustody?: {
    evidenceId: string;
    transferDate: Date;
    transferredFrom: string;
    transferredTo: string;
    purpose: string;
    condition: string;
    signature: string;
  }[];

  @ApiProperty({ description: 'Legal considerations' })
  @Column({ type: 'jsonb', nullable: true })
  legalConsiderations?: {
    jurisdiction: string;
    legalBasis: string;
    courtOrder?: string;
    warrant?: string;
    consent: boolean;
    restrictions: string[];
  }[];

  @ApiProperty({ description: 'Preservation actions taken' })
  @Column({ type: 'jsonb', nullable: true })
  preservationActions?: {
    action: string;
    description: string;
    executedBy: string;
    executedAt: Date;
    success: boolean;
    notes?: string;
  }[];

  @ApiProperty({ description: 'Analysis methods' })
  @Column({ type: 'jsonb', nullable: true })
  analysisMethods?: {
    method: string;
    description: string;
    parameters: Record<string, any>;
    results: Record<string, any>;
    analyst: string;
    performedAt: Date;
  }[];

  @ApiProperty({ description: 'Case notes and observations' })
  @Column({ type: 'jsonb', nullable: true })
  notes?: {
    id: string;
    author: string;
    content: string;
    timestamp: Date;
    category: 'observation' | 'analysis' | 'conclusion' | 'question';
    isPrivate: boolean;
  }[];

  @ApiProperty({ description: 'Report and conclusions' })
  @Column({ type: 'jsonb', nullable: true })
  report?: {
    executiveSummary: string;
    detailedFindings: string;
    recommendations: string[];
    conclusions: string;
    nextSteps: string[];
    preparedBy: string;
    reviewedBy: string;
    approvedBy: string;
    reportDate: Date;
  };

  @ApiProperty({ description: 'Case tags' })
  @Column({ type: 'varchar', array: true, default: [] })
  @Index()
  tags: string[];

  @ApiProperty({ description: 'Related cases' })
  @Column({ type: 'uuid', array: true, default: [] })
  @Index()
  relatedCaseIds: string[];

  @ApiProperty({ description: 'Created timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiProperty({ description: 'Closed timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt?: Date;

  @ApiProperty({ description: 'Closed by user ID' })
  @Column({ type: 'uuid', nullable: true })
  closedBy?: string;

  @ApiProperty({ description: 'Archived timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  archivedAt?: Date;
}
