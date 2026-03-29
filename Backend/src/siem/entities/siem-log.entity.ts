import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum LogSource {
  APPLICATION = 'application',
  DATABASE = 'database',
  INFRASTRUCTURE = 'infrastructure',
  BLOCKCHAIN = 'blockchain',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  SECURITY = 'security',
}

export enum LogCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  TRANSACTION = 'transaction',
  SYSTEM_EVENT = 'system_event',
  SECURITY_EVENT = 'security_event',
  ERROR_EVENT = 'error_event',
  PERFORMANCE_EVENT = 'performance_event',
}

@Entity('siem_logs')
@Index(['timestamp', 'level'])
@Index(['source', 'category'])
@Index(['userId', 'sessionId'])
@Index(['ipAddress', 'userAgent'])
export class SiemLog {
  @ApiProperty({ description: 'Unique identifier for the log entry' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Timestamp when the log was generated' })
  @Column({ type: 'timestamp with time zone' })
  @Index()
  timestamp: Date;

  @ApiProperty({ description: 'Log level', enum: LogLevel })
  @Column({ type: 'enum', enum: LogLevel })
  @Index()
  level: LogLevel;

  @ApiProperty({ description: 'Source system that generated the log', enum: LogSource })
  @Column({ type: 'enum', enum: LogSource })
  @Index()
  source: LogSource;

  @ApiProperty({ description: 'Category of the log event', enum: LogCategory })
  @Column({ type: 'enum', enum: LogCategory })
  @Index()
  category: LogCategory;

  @ApiProperty({ description: 'Main log message' })
  @Column({ type: 'text' })
  message: string;

  @ApiProperty({ description: 'Detailed log data in JSON format' })
  @Column({ type: 'jsonb' })
  details: Record<string, any>;

  @ApiProperty({ description: 'User ID associated with the log event' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId?: string;

  @ApiProperty({ description: 'Session ID for tracking user sessions' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  sessionId?: string;

  @ApiProperty({ description: 'IP address of the client' })
  @Column({ type: 'inet', nullable: true })
  @Index()
  ipAddress?: string;

  @ApiProperty({ description: 'User agent string' })
  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @ApiProperty({ description: 'Request ID for distributed tracing' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  requestId?: string;

  @ApiProperty({ description: 'Correlation ID for linking related events' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  correlationId?: string;

  @ApiProperty({ description: 'Geographic location based on IP' })
  @Column({ type: 'jsonb', nullable: true })
  geoLocation?: {
    country: string;
    region: string;
    city: string;
    latitude: number;
    longitude: number;
  };

  @ApiProperty({ description: 'Threat score calculated by ML models' })
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  @Index()
  threatScore?: number;

  @ApiProperty({ description: 'Whether this log triggered a security alert' })
  @Column({ type: 'boolean', default: false })
  @Index()
  triggeredAlert: boolean;

  @ApiProperty({ description: 'Associated threat ID if this log triggered an alert' })
  @Column({ type: 'uuid', nullable: true })
  @Index()
  threatId?: string;

  @ManyToOne(() => Threat, { nullable: true })
  @JoinColumn({ name: 'threatId' })
  threat?: Threat;

  @ApiProperty({ description: 'Processing status of the log' })
  @Column({ type: 'enum', enum: ['pending', 'processed', 'failed'], default: 'pending' })
  @Index()
  processingStatus: 'pending' | 'processed' | 'failed';

  @ApiProperty({ description: 'Processing error details' })
  @Column({ type: 'text', nullable: true })
  processingError?: string;

  @ApiProperty({ description: 'Retention period in days' })
  @Column({ type: 'integer', default: 365 })
  retentionDays: number;

  @ApiProperty({ description: 'Whether the log is archived' })
  @Column({ type: 'boolean', default: false })
  @Index()
  isArchived: boolean;

  @ApiProperty({ description: 'Archive timestamp' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  archivedAt?: Date;

  @ApiProperty({ description: 'Created timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
