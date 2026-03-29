import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum ComplianceFramework {
  SOC2 = 'soc2',
  ISO27001 = 'iso27001',
  PCI_DSS = 'pci_dss',
  GDPR = 'gdpr',
  HIPAA = 'hipaa',
  NIST = 'nist',
  COBIT = 'cobit',
  CIS_CONTROLS = 'cis_controls',
}

export enum ReportType {
  AUDIT_REPORT = 'audit_report',
  COMPLIANCE_ASSESSMENT = 'compliance_assessment',
  SECURITY_ASSESSMENT = 'security_assessment',
  RISK_ASSESSMENT = 'risk_assessment',
  VULNERABILITY_ASSESSMENT = 'vulnerability_assessment',
  PENETRATION_TEST = 'penetration_test',
  INCIDENT_SUMMARY = 'incident_summary',
  THREAT_INTELLIGENCE = 'threat_intelligence',
}

export enum ReportStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum ReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually',
  ON_DEMAND = 'on_demand',
}

@Entity('compliance_reports')
@Index(['framework', 'reportType'])
@Index(['status', 'generatedAt'])
@Index(['frequency', 'nextScheduledAt'])
export class ComplianceReport {
  @ApiProperty({ description: 'Unique identifier for the compliance report' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Report title' })
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({ description: 'Compliance framework', enum: ComplianceFramework })
  @Column({ type: 'enum', enum: ComplianceFramework })
  @Index()
  framework: ComplianceFramework;

  @ApiProperty({ description: 'Report type', enum: ReportType })
  @Column({ type: 'enum', enum: ReportType })
  @Index()
  reportType: ReportType;

  @ApiProperty({ description: 'Report status', enum: ReportStatus })
  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.DRAFT })
  @Index()
  status: ReportStatus;

  @ApiProperty({ description: 'Report frequency', enum: ReportFrequency })
  @Column({ type: 'enum', enum: ReportFrequency })
  @Index()
  frequency: ReportFrequency;

  @ApiProperty({ description: 'Report period start date' })
  @Column({ type: 'timestamp with time zone' })
  @Index()
  periodStart: Date;

  @ApiProperty({ description: 'Report period end date' })
  @Column({ type: 'timestamp with time zone' })
  @Index()
  periodEnd: Date;

  @ApiProperty({ description: 'Report generation timestamp' })
  @Column({ type: 'timestamp with time zone' })
  @Index()
  generatedAt: Date;

  @ApiProperty({ description: 'Next scheduled generation timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  @Index()
  nextScheduledAt?: Date;

  @ApiProperty({ description: 'Report summary' })
  @Column({ type: 'text' })
  summary: string;

  @ApiProperty({ description: 'Executive summary' })
  @Column({ type: 'text', nullable: true })
  executiveSummary?: string;

  @ApiProperty({ description: 'Compliance score' })
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  @Index()
  complianceScore?: number;

  @ApiProperty({ description: 'Risk level' })
  @Column({ type: 'enum', enum: ['low', 'medium', 'high', 'critical'], nullable: true })
  @Index()
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({ description: 'Compliance requirements assessment' })
  @Column({ type: 'jsonb', nullable: true })
  requirements?: {
    controlId: string;
    requirement: string;
    status: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable';
    evidence: string[];
    findings: string;
    recommendations: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
  }[];

  @ApiProperty({ description: 'Security controls assessment' })
  @Column({ type: 'jsonb', nullable: true })
  securityControls?: {
    controlId: string;
    controlName: string;
    category: string;
    implementation: 'implemented' | 'partial' | 'not_implemented';
    effectiveness: 'high' | 'medium' | 'low';
    gaps: string[];
    recommendations: string[];
  }[];

  @ApiProperty({ description: 'Risk assessment findings' })
  @Column({ type: 'jsonb', nullable: true })
  riskAssessment?: {
    riskId: string;
    riskCategory: string;
    riskDescription: string;
    likelihood: 'low' | 'medium' | 'high' | 'very_high';
    impact: 'low' | 'medium' | 'high' | 'very_high';
    riskScore: number;
    mitigationStrategy: string;
    residualRisk: number;
  }[];

  @ApiProperty({ description: 'Incident summary for the period' })
  @Column({ type: 'jsonb', nullable: true })
  incidentSummary?: {
    totalIncidents: number;
    incidentsByType: Record<string, number>;
    incidentsBySeverity: Record<string, number>;
    averageResolutionTime: number;
    criticalIncidents: number;
    recurringIncidents: string[];
  };

  @ApiProperty({ description: 'Threat landscape analysis' })
  @Column({ type: 'jsonb', nullable: true })
  threatLandscape?: {
    topThreats: {
      threatType: string;
      occurrences: number;
      severity: string;
      trend: 'increasing' | 'decreasing' | 'stable';
    }[];
    emergingThreats: string[];
    blockedThreats: number;
    detectedThreats: number;
  };

  @ApiProperty({ description: 'Audit findings' })
  @Column({ type: 'jsonb', nullable: true })
  auditFindings?: {
    findingId: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
    dueDate: Date;
    assignedTo: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
  }[];

  @ApiProperty({ description: 'Recommendations and action items' })
  @Column({ type: 'jsonb', nullable: true })
  recommendations?: {
    id: string;
    category: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    recommendation: string;
    justification: string;
    estimatedEffort: string;
    assignedTo: string;
    dueDate: Date;
    status: 'pending' | 'in_progress' | 'completed';
  }[];

  @ApiProperty({ description: 'Report metrics and KPIs' })
  @Column({ type: 'jsonb', nullable: true })
  metrics?: {
    totalEventsProcessed: number;
    threatsDetected: number;
    incidentsResolved: number;
    averageResponseTime: number;
    systemUptime: number;
    securityScore: number;
    compliancePercentage: number;
  };

  @ApiProperty({ description: 'Report attachments and evidence' })
  @Column({ type: 'jsonb', nullable: true })
  attachments?: {
    id: string;
    fileName: string;
    fileType: string;
    description: string;
    uploadedAt: Date;
    uploadedBy: string;
    size: number;
    path: string;
  }[];

  @ApiProperty({ description: 'Report reviewers' })
  @Column({ type: 'uuid', array: true, default: [] })
  reviewers: string[];

  @ApiProperty({ description: 'Report approvers' })
  @Column({ type: 'uuid', array: true, default: [] })
  approvers: string[];

  @ApiProperty({ description: 'Report distribution list' })
  @Column({ type: 'jsonb', nullable: true })
  distribution?: {
    recipient: string;
    role: string;
    deliveryMethod: 'email' | 'portal' | 'api';
    deliveredAt?: Date;
  }[];

  @ApiProperty({ description: 'Report tags' })
  @Column({ type: 'varchar', array: true, default: [] })
  @Index()
  tags: string[];

  @ApiProperty({ description: 'Report version' })
  @Column({ type: 'varchar', length: 20, default: '1.0' })
  version: string;

  @ApiProperty({ description: 'Parent report ID for versioning' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  parentReportId?: string;

  @ApiProperty({ description: 'Created timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiProperty({ description: 'Published timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  publishedAt?: Date;

  @ApiProperty({ description: 'Published by user ID' })
  @Column({ type: 'uuid', nullable: true })
  publishedBy?: string;

  @ApiProperty({ description: 'Archived timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  archivedAt?: Date;
}
