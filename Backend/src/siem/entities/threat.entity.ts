import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum ThreatType {
  BRUTE_FORCE = 'brute_force',
  SQL_INJECTION = 'sql_injection',
  XSS = 'xss',
  DDoS = 'ddos',
  PHISHING = 'phishing',
  MALWARE = 'malware',
  INSIDER_THREAT = 'insider_threat',
  DATA_EXFILTRATION = 'data_exfiltration',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  ANOMALOUS_BEHAVIOR = 'anomalous_behavior',
}

export enum ThreatSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ThreatStatus {
  DETECTED = 'detected',
  INVESTIGATING = 'investigating',
  CONFIRMED = 'confirmed',
  FALSE_POSITIVE = 'false_positive',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
}

@Entity('threats')
@Index(['timestamp', 'severity'])
@Index(['type', 'status'])
@Index(['sourceIp', 'targetUser'])
export class Threat {
  @ApiProperty({ description: 'Unique identifier for the threat' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Timestamp when the threat was detected' })
  @Column({ type: 'timestamp with time zone' })
  @Index()
  timestamp: Date;

  @ApiProperty({ description: 'Type of threat', enum: ThreatType })
  @Column({ type: 'enum', enum: ThreatType })
  @Index()
  type: ThreatType;

  @ApiProperty({ description: 'Threat severity level', enum: ThreatSeverity })
  @Column({ type: 'enum', enum: ThreatSeverity })
  @Index()
  severity: ThreatSeverity;

  @ApiProperty({ description: 'Current threat status', enum: ThreatStatus })
  @Column({ type: 'enum', enum: ThreatStatus, default: ThreatStatus.DETECTED })
  @Index()
  status: ThreatStatus;

  @ApiProperty({ description: 'Threat title or summary' })
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({ description: 'Detailed threat description' })
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ description: 'MITRE ATT&CK technique ID' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  @Index()
  mitreTechniqueId?: string;

  @ApiProperty({ description: 'MITRE ATT&CK tactic ID' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  @Index()
  mitreTacticId?: string;

  @ApiProperty({ description: 'Source IP address of the threat actor' })
  @Column({ type: 'inet', nullable: true })
  @Index()
  sourceIp?: string;

  @ApiProperty({ description: 'Target user ID if applicable' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  targetUser?: string;

  @ApiProperty({ description: 'Target system or resource' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  targetResource?: string;

  @ApiProperty({ description: 'Threat score calculated by ML models' })
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  @Index()
  threatScore: number;

  @ApiProperty({ description: 'Confidence level of the threat detection' })
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  confidence: number;

  @ApiProperty({ description: 'Raw detection data in JSON format' })
  @Column({ type: 'jsonb' })
  detectionData: Record<string, any>;

  @ApiProperty({ description: 'ML model predictions and features' })
  @Column({ type: 'jsonb', nullable: true })
  mlAnalysis?: Record<string, any>;

  @ApiProperty({ description: 'Associated log IDs that triggered this threat' })
  @Column({ type: 'uuid', array: true, default: [] })
  @Index()
  relatedLogIds: string[];

  @ApiProperty({ description: 'Associated incident ID if created' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  incidentId?: string;

  @ManyToOne(() => Incident, { nullable: true })
  @JoinColumn({ name: 'incidentId' })
  incident?: Incident;

  @ApiProperty({ description: 'Assigned security analyst' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  assignedTo?: string;

  @ApiProperty({ description: 'Investigation notes' })
  @Column({ type: 'text', nullable: true })
  investigationNotes?: string;

  @ApiProperty({ description: 'Automated response actions taken' })
  @Column({ type: 'jsonb', nullable: true })
  responseActions?: {
    type: string;
    description: string;
    timestamp: Date;
    success: boolean;
  }[];

  @ApiProperty({ description: 'Whether the threat is false positive' })
  @Column({ type: 'boolean', default: false })
  @Index()
  isFalsePositive: boolean;

  @ApiProperty({ description: 'False positive reason' })
  @Column({ type: 'text', nullable: true })
  falsePositiveReason?: string;

  @ApiProperty({ description: 'External threat intelligence references' })
  @Column({ type: 'jsonb', nullable: true })
  threatIntelligence?: {
    source: string;
    reference: string;
    confidence: number;
    timestamp: Date;
  }[];

  @ApiProperty({ description: 'Geographic location of source IP' })
  @Column({ type: 'jsonb', nullable: true })
  geoLocation?: {
    country: string;
    region: string;
    city: string;
    latitude: number;
    longitude: number;
    isp: string;
  };

  @ApiProperty({ description: 'Related threats for pattern analysis' })
  @Column({ type: 'uuid', array: true, default: [] })
  @Index()
  relatedThreatIds: string[];

  @ApiProperty({ description: 'Created timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiProperty({ description: 'Resolved timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt?: Date;

  @ApiProperty({ description: 'Resolved by user ID' })
  @Column({ type: 'uuid', nullable: true })
  resolvedBy?: string;
}
