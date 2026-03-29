import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum IncidentType {
  SECURITY_BREACH = 'security_breach',
  DATA_BREACH = 'data_breach',
  SYSTEM_COMPROMISE = 'system_compromise',
  NETWORK_INTRUSION = 'network_intrusion',
  MALWARE_OUTBREAK = 'malware_outbreak',
  DDOS_ATTACK = 'ddos_attack',
  INSIDER_THREAT = 'insider_threat',
  PHISHING_CAMPAIGN = 'phishing_campaign',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
}

export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  NEW = 'new',
  IN_PROGRESS = 'in_progress',
  INVESTIGATING = 'investigating',
  CONTAINING = 'containing',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ESCALATED = 'escalated',
}

export enum IncidentPriority {
  P1 = 'p1', // Critical - Immediate response required
  P2 = 'p2', // High - Response within 1 hour
  P3 = 'p3', // Medium - Response within 4 hours
  P4 = 'p4', // Low - Response within 24 hours
}

@Entity('incidents')
@Index(['createdAt', 'severity'])
@Index(['type', 'status'])
@Index(['priority', 'status'])
export class Incident {
  @ApiProperty({ description: 'Unique identifier for the incident' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Incident ticket number' })
  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  ticketNumber: string;

  @ApiProperty({ description: 'Type of incident', enum: IncidentType })
  @Column({ type: 'enum', enum: IncidentType })
  @Index()
  type: IncidentType;

  @ApiProperty({ description: 'Incident severity level', enum: IncidentSeverity })
  @Column({ type: 'enum', enum: IncidentSeverity })
  @Index()
  severity: IncidentSeverity;

  @ApiProperty({ description: 'Incident priority level', enum: IncidentPriority })
  @Column({ type: 'enum', enum: IncidentPriority })
  @Index()
  priority: IncidentPriority;

  @ApiProperty({ description: 'Current incident status', enum: IncidentStatus })
  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.NEW })
  @Index()
  status: IncidentStatus;

  @ApiProperty({ description: 'Incident title' })
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({ description: 'Detailed incident description' })
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ description: 'Incident detection timestamp' })
  @Column({ type: 'timestamp with time zone' })
  @Index()
  detectedAt: Date;

  @ApiProperty({ description: 'Incident start timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  startedAt?: Date;

  @ApiProperty({ description: 'Incident end timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  endedAt?: Date;

  @ApiProperty({ description: 'Associated threat IDs' })
  @Column({ type: 'uuid', array: true, default: [] })
  @Index()
  threatIds: string[];

  @ApiProperty({ description: 'Assigned incident commander' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  assignedTo?: string;

  @ApiProperty({ description: 'Incident response team members' })
  @Column({ type: 'uuid', array: true, default: [] })
  teamMembers: string[];

  @ApiProperty({ description: 'Affected systems and resources' })
  @Column({ type: 'jsonb', nullable: true })
  affectedSystems?: {
    systemId: string;
    systemName: string;
    impactLevel: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }[];

  @ApiProperty({ description: 'Business impact assessment' })
  @Column({ type: 'jsonb', nullable: true })
  businessImpact?: {
    financialImpact: number;
    operationalImpact: string;
    reputationalImpact: string;
    complianceImpact: string;
  };

  @ApiProperty({ description: 'Incident timeline and milestones' })
  @Column({ type: 'jsonb', nullable: true })
  timeline?: {
    timestamp: Date;
    event: string;
    description: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
  }[];

  @ApiProperty({ description: 'Response actions taken' })
  @Column({ type: 'jsonb', nullable: true })
  responseActions?: {
    action: string;
    description: string;
    executedBy: string;
    executedAt: Date;
    success: boolean;
    notes?: string;
  }[];

  @ApiProperty({ description: 'Containment strategies implemented' })
  @Column({ type: 'jsonb', nullable: true })
  containmentStrategies?: {
    strategy: string;
    description: string;
    implementedAt: Date;
    effectiveness: 'low' | 'medium' | 'high';
  }[];

  @ApiProperty({ description: 'Root cause analysis' })
  @Column({ type: 'jsonb', nullable: true })
  rootCauseAnalysis?: {
    primaryCause: string;
    contributingFactors: string[];
    evidence: string[];
    analysisMethod: string;
    completedAt: Date;
  };

  @ApiProperty({ description: 'Lessons learned' })
  @Column({ type: 'jsonb', nullable: true })
  lessonsLearned?: {
    lesson: string;
    category: string;
    recommendation: string;
    owner: string;
    dueDate: Date;
  }[];

  @ApiProperty({ description: 'External notifications sent' })
  @Column({ type: 'jsonb', nullable: true })
  externalNotifications?: {
    recipient: string;
    type: 'email' | 'sms' | 'slack' | 'pagerduty';
    sentAt: Date;
    status: 'sent' | 'delivered' | 'failed';
  }[];

  @ApiProperty({ description: 'Compliance and regulatory requirements' })
  @Column({ type: 'jsonb', nullable: true })
  complianceRequirements?: {
    framework: string;
    requirement: string;
    status: 'compliant' | 'non_compliant' | 'pending';
    evidence: string;
  }[];

  @ApiProperty({ description: 'Cost of incident' })
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  incidentCost?: number;

  @ApiProperty({ description: 'Incident tags' })
  @Column({ type: 'varchar', array: true, default: [] })
  @Index()
  tags: string[];

  @ApiProperty({ description: 'Incident notes and updates' })
  @Column({ type: 'jsonb', nullable: true })
  notes?: {
    id: string;
    author: string;
    content: string;
    timestamp: Date;
    isInternal: boolean;
  }[];

  @ApiProperty({ description: 'Related incidents' })
  @Column({ type: 'uuid', array: true, default: [] })
  @Index()
  relatedIncidentIds: string[];

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

  @ApiProperty({ description: 'Resolution summary' })
  @Column({ type: 'text', nullable: true })
  resolutionSummary?: string;
}
