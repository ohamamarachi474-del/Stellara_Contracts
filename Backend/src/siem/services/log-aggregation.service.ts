import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, MoreThan, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SiemLog, LogLevel, LogSource, LogCategory } from '../entities/siem-log.entity';
import { Redis } from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: LogSource;
  category: LogCategory;
  message: string;
  details: Record<string, any>;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  geoLocation?: {
    country: string;
    region: string;
    city: string;
    latitude: number;
    longitude: number;
  };
}

export interface LogQuery {
  startDate?: Date;
  endDate?: Date;
  levels?: LogLevel[];
  sources?: LogSource[];
  categories?: LogCategory[];
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  message?: string;
  threatScoreMin?: number;
  threatScoreMax?: number;
  triggeredAlert?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'level' | 'threatScore';
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class LogAggregationService implements OnModuleInit {
  private readonly logger = new Logger(LogAggregationService.name);
  private redis: Redis;

  constructor(
    @InjectRepository(SiemLog)
    private readonly logRepository: Repository<SiemLog>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    });

    // Test Redis connection
    try {
      await this.redis.ping();
      this.logger.log('Redis connection established for log aggregation');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
    }
  }

  /**
   * Ingest a single log entry
   */
  async ingestLog(logEntry: LogEntry): Promise<SiemLog> {
    try {
      // Enrich log entry with additional metadata
      const enrichedLog = await this.enrichLogEntry(logEntry);

      // Create log entity
      const log = this.logRepository.create(enrichedLog);

      // Save to database
      const savedLog = await this.logRepository.save(log);

      // Cache in Redis for quick access
      await this.cacheLog(savedLog);

      // Emit event for real-time processing
      this.eventEmitter.emit('log.ingested', savedLog);

      // Check for immediate threat patterns
      await this.checkImmediateThreats(savedLog);

      this.logger.debug(`Log ingested: ${savedLog.id}`);
      return savedLog;
    } catch (error) {
      this.logger.error(`Failed to ingest log: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Batch ingest multiple log entries
   */
  async ingestLogsBatch(logEntries: LogEntry[]): Promise<SiemLog[]> {
    try {
      const enrichedLogs = await Promise.all(
        logEntries.map(entry => this.enrichLogEntry(entry))
      );

      const logs = enrichedLogs.map(log => this.logRepository.create(log));
      const savedLogs = await this.logRepository.save(logs);

      // Cache logs in Redis
      await Promise.all(
        savedLogs.map(log => this.cacheLog(log))
      );

      // Emit batch event
      this.eventEmitter.emit('log.batch_ingested', savedLogs);

      this.logger.debug(`Batch ingested ${savedLogs.length} logs`);
      return savedLogs;
    } catch (error) {
      this.logger.error(`Failed to batch ingest logs: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Query logs with filters
   */
  async queryLogs(query: LogQuery): Promise<{ logs: SiemLog[]; total: number }> {
    try {
      const queryBuilder = this.logRepository.createQueryBuilder('log');

      // Apply filters
      if (query.startDate && query.endDate) {
        queryBuilder.andWhere('log.timestamp BETWEEN :startDate AND :endDate', {
          startDate: query.startDate,
          endDate: query.endDate,
        });
      } else if (query.startDate) {
        queryBuilder.andWhere('log.timestamp >= :startDate', { startDate: query.startDate });
      } else if (query.endDate) {
        queryBuilder.andWhere('log.timestamp <= :endDate', { endDate: query.endDate });
      }

      if (query.levels && query.levels.length > 0) {
        queryBuilder.andWhere('log.level IN (:...levels)', { levels: query.levels });
      }

      if (query.sources && query.sources.length > 0) {
        queryBuilder.andWhere('log.source IN (:...sources)', { sources: query.sources });
      }

      if (query.categories && query.categories.length > 0) {
        queryBuilder.andWhere('log.category IN (:...categories)', { categories: query.categories });
      }

      if (query.userId) {
        queryBuilder.andWhere('log.userId = :userId', { userId: query.userId });
      }

      if (query.sessionId) {
        queryBuilder.andWhere('log.sessionId = :sessionId', { sessionId: query.sessionId });
      }

      if (query.ipAddress) {
        queryBuilder.andWhere('log.ipAddress = :ipAddress', { ipAddress: query.ipAddress });
      }

      if (query.message) {
        queryBuilder.andWhere('log.message ILIKE :message', { message: `%${query.message}%` });
      }

      if (query.threatScoreMin !== undefined) {
        queryBuilder.andWhere('log.threatScore >= :threatScoreMin', { threatScoreMin: query.threatScoreMin });
      }

      if (query.threatScoreMax !== undefined) {
        queryBuilder.andWhere('log.threatScore <= :threatScoreMax', { threatScoreMax: query.threatScoreMax });
      }

      if (query.triggeredAlert !== undefined) {
        queryBuilder.andWhere('log.triggeredAlert = :triggeredAlert', { triggeredAlert: query.triggeredAlert });
      }

      // Apply sorting
      const sortBy = query.sortBy || 'timestamp';
      const sortOrder = query.sortOrder || 'DESC';
      queryBuilder.orderBy(`log.${sortBy}`, sortOrder);

      // Get total count
      const total = await queryBuilder.getCount();

      // Apply pagination
      if (query.offset) {
        queryBuilder.skip(query.offset);
      }

      if (query.limit) {
        queryBuilder.take(query.limit);
      }

      const logs = await queryBuilder.getMany();

      return { logs, total };
    } catch (error) {
      this.logger.error(`Failed to query logs: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get log statistics
   */
  async getLogStatistics(timeRange: { start: Date; end: Date }): Promise<Record<string, any>> {
    try {
      const stats = await this.logRepository
        .createQueryBuilder('log')
        .select('log.level', 'level')
        .addSelect('log.source', 'source')
        .addSelect('log.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .addSelect('AVG(log.threatScore)', 'avgThreatScore')
        .addSelect('MAX(log.threatScore)', 'maxThreatScore')
        .where('log.timestamp BETWEEN :start AND :end', { start: timeRange.start, end: timeRange.end })
        .groupBy('log.level, log.source, log.category')
        .getRawMany();

      const totalLogs = await this.logRepository.count({
        where: {
          timestamp: Between(timeRange.start, timeRange.end),
        },
      });

      const alertCount = await this.logRepository.count({
        where: {
          timestamp: Between(timeRange.start, timeRange.end),
          triggeredAlert: true,
        },
      });

      return {
        totalLogs,
        alertCount,
        stats,
        timeRange,
      };
    } catch (error) {
      this.logger.error(`Failed to get log statistics: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Archive old logs
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async archiveOldLogs(): Promise<void> {
    try {
      const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '365', 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const oldLogs = await this.logRepository.find({
        where: {
          timestamp: LessThan(cutoffDate),
          isArchived: false,
        },
        take: 1000, // Process in batches
      });

      if (oldLogs.length === 0) {
        this.logger.log('No logs to archive');
        return;
      }

      // Mark logs as archived
      await this.logRepository.update(
        { id: In(oldLogs.map(log => log.id)) },
        { isArchived: true, archivedAt: new Date() }
      );

      this.logger.log(`Archived ${oldLogs.length} logs older than ${retentionDays} days`);
    } catch (error) {
      this.logger.error(`Failed to archive old logs: ${error.message}`, error);
    }
  }

  /**
   * Enrich log entry with additional metadata
   */
  private async enrichLogEntry(logEntry: LogEntry): Promise<Partial<SiemLog>> {
    const enriched = { ...logEntry };

    // Add geo-location if IP is provided
    if (logEntry.ipAddress && !logEntry.geoLocation) {
      enriched.geoLocation = await this.getGeoLocation(logEntry.ipAddress);
    }

    // Calculate initial threat score
    enriched.threatScore = await this.calculateInitialThreatScore(logEntry);

    return enriched;
  }

  /**
   * Cache log in Redis for quick access
   */
  private async cacheLog(log: SiemLog): Promise<void> {
    try {
      const key = `log:${log.id}`;
      const ttl = 3600; // 1 hour
      await this.redis.setex(key, ttl, JSON.stringify(log));
    } catch (error) {
      this.logger.warn(`Failed to cache log ${log.id}: ${error.message}`);
    }
  }

  /**
   * Get geo-location from IP address
   */
  private async getGeoLocation(ipAddress: string): Promise<any> {
    try {
      // Implement geo-location lookup using a service like MaxMind GeoIP2
      // For now, return null
      return null;
    } catch (error) {
      this.logger.warn(`Failed to get geo-location for IP ${ipAddress}: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate initial threat score based on log characteristics
   */
  private async calculateInitialThreatScore(logEntry: LogEntry): Promise<number> {
    let score = 0;

    // Base score by log level
    switch (logEntry.level) {
      case LogLevel.CRITICAL:
        score += 80;
        break;
      case LogLevel.ERROR:
        score += 60;
        break;
      case LogLevel.WARN:
        score += 40;
        break;
      case LogLevel.INFO:
        score += 20;
        break;
      case LogLevel.DEBUG:
        score += 10;
        break;
    }

    // Add score based on source
    if (logEntry.source === LogSource.SECURITY) {
      score += 20;
    } else if (logEntry.source === LogSource.AUTHENTICATION) {
      score += 15;
    }

    // Add score based on category
    if (logEntry.category === LogCategory.SECURITY_EVENT) {
      score += 25;
    } else if (logEntry.category === LogCategory.AUTHENTICATION) {
      score += 15;
    }

    // Check for suspicious patterns in message
    const suspiciousPatterns = [
      /failed.*login/i,
      /unauthorized/i,
      /access.*denied/i,
      /sql.*injection/i,
      /xss/i,
      /brute.*force/i,
      /ddos/i,
      /malware/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(logEntry.message)) {
        score += 30;
        break;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Check for immediate threat patterns
   */
  private async checkImmediateThreats(log: SiemLog): Promise<void> {
    // Emit event for threat detection service to process
    this.eventEmitter.emit('threat.check', log);
  }
}
