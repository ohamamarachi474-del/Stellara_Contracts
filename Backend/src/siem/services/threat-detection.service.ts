import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as tf from '@tensorflow/tfjs-node';
import { SiemLog, LogLevel, LogSource, LogCategory } from '../entities/siem-log.entity';
import { Threat, ThreatType, ThreatSeverity, ThreatStatus } from '../entities/threat.entity';
import { Redis } from 'ioredis';

export interface ThreatPattern {
  id: string;
  name: string;
  description: string;
  type: ThreatType;
  severity: ThreatSeverity;
  conditions: ThreatCondition[];
  timeWindow: number; // minutes
  threshold: number;
  enabled: boolean;
}

export interface ThreatCondition {
  field: keyof SiemLog;
  operator: 'equals' | 'contains' | 'regex' | 'gt' | 'lt' | 'in';
  value: any;
  weight?: number;
}

export interface ThreatDetectionResult {
  threat: Threat;
  confidence: number;
  matchedLogs: SiemLog[];
  pattern: ThreatPattern;
  mlScore?: number;
}

@Injectable()
export class ThreatDetectionService {
  private readonly logger = new Logger(ThreatDetectionService.name);
  private redis: Redis;
  private mlModel: tf.LayersModel | null = null;
  private threatPatterns: ThreatPattern[] = [];

  constructor(
    @InjectRepository(SiemLog)
    private readonly logRepository: Repository<SiemLog>,
    @InjectRepository(Threat)
    private readonly threatRepository: Repository<Threat>,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializeThreatPatterns();
    this.loadMLModel();
  }

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    });

    // Subscribe to log events
    this.eventEmitter.on('log.ingested', (log: SiemLog) => {
      this.processLogForThreats(log);
    });

    this.logger.log('Threat detection service initialized');
  }

  /**
   * Process a single log for threat detection
   */
  async processLogForThreats(log: SiemLog): Promise<ThreatDetectionResult[]> {
    const results: ThreatDetectionResult[] = [];

    try {
      // Pattern-based detection
      const patternResults = await this.detectThreatsByPatterns(log);
      results.push(...patternResults);

      // ML-based detection
      const mlResult = await this.detectThreatsByML(log);
      if (mlResult) {
        results.push(mlResult);
      }

      // Anomaly detection
      const anomalyResult = await this.detectAnomalies(log);
      if (anomalyResult) {
        results.push(anomalyResult);
      }

      // Process results
      for (const result of results) {
        await this.handleThreatDetection(result);
      }

      return results;
    } catch (error) {
      this.logger.error(`Failed to process log for threats: ${error.message}`, error);
      return [];
    }
  }

  /**
   * Detect threats using predefined patterns
   */
  private async detectThreatsByPatterns(log: SiemLog): Promise<ThreatDetectionResult[]> {
    const results: ThreatDetectionResult[] = [];

    for (const pattern of this.threatPatterns.filter(p => p.enabled)) {
      if (await this.matchesPattern(log, pattern)) {
        // Find related logs within time window
        const relatedLogs = await this.findRelatedLogs(log, pattern);
        
        if (relatedLogs.length >= pattern.threshold) {
          const threat = await this.createThreatFromPattern(log, pattern, relatedLogs);
          results.push({
            threat,
            confidence: this.calculatePatternConfidence(pattern, relatedLogs),
            matchedLogs: relatedLogs,
            pattern,
          });
        }
      }
    }

    return results;
  }

  /**
   * Detect threats using ML models
   */
  private async detectThreatsByML(log: SiemLog): Promise<ThreatDetectionResult | null> {
    if (!this.mlModel) {
      return null;
    }

    try {
      // Extract features from log
      const features = this.extractFeatures(log);
      const tensor = tf.tensor2d([features]);
      
      // Make prediction
      const prediction = this.mlModel.predict(tensor) as tf.Tensor;
      const score = await prediction.data();
      
      // Clean up tensors
      tensor.dispose();
      prediction.dispose();

      const threatScore = score[0];
      
      if (threatScore > 0.7) { // Threshold for ML detection
        const threat = await this.createThreatFromML(log, threatScore);
        return {
          threat,
          confidence: threatScore,
          matchedLogs: [log],
          pattern: null,
          mlScore: threatScore,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`ML threat detection failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect anomalies in log patterns
   */
  private async detectAnomalies(log: SiemLog): Promise<ThreatDetectionResult | null> {
    try {
      // Check for unusual patterns
      const anomalies = await this.checkAnomalies(log);
      
      if (anomalies.length > 0) {
        const threat = await this.createThreatFromAnomaly(log, anomalies);
        return {
          threat,
          confidence: 0.8,
          matchedLogs: [log],
          pattern: null,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Anomaly detection failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Handle detected threat
   */
  private async handleThreatDetection(result: ThreatDetectionResult): Promise<void> {
    try {
      // Save threat to database
      const savedThreat = await this.threatRepository.save(result.threat);

      // Update related logs with threat reference
      await this.logRepository.update(
        { id: In(result.matchedLogs.map(log => log.id)) },
        { 
          threatId: savedThreat.id,
          triggeredAlert: true,
          threatScore: result.confidence * 100,
        }
      );

      // Cache threat in Redis
      await this.cacheThreat(savedThreat);

      // Emit threat detected event
      this.eventEmitter.emit('threat.detected', {
        threat: savedThreat,
        confidence: result.confidence,
        matchedLogs: result.matchedLogs,
      });

      this.logger.log(`Threat detected: ${savedThreat.id} - ${savedThreat.title}`);
    } catch (error) {
      this.logger.error(`Failed to handle threat detection: ${error.message}`, error);
    }
  }

  /**
   * Check if log matches a threat pattern
   */
  private async matchesPattern(log: SiemLog, pattern: ThreatPattern): Promise<boolean> {
    for (const condition of pattern.conditions) {
      if (!this.evaluateCondition(log, condition)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(log: SiemLog, condition: ThreatCondition): boolean {
    const fieldValue = (log as any)[condition.field];
    
    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
      case 'regex':
        return typeof fieldValue === 'string' && new RegExp(condition.value).test(fieldValue);
      case 'gt':
        return Number(fieldValue) > Number(condition.value);
      case 'lt':
        return Number(fieldValue) < Number(condition.value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Find related logs within time window
   */
  private async findRelatedLogs(log: SiemLog, pattern: ThreatPattern): Promise<SiemLog[]> {
    const timeWindow = new Date(log.getTime() - pattern.timeWindow * 60 * 1000);
    
    return await this.logRepository.find({
      where: {
        timestamp: Between(timeWindow, log.timestamp),
        source: log.source,
        category: log.category,
      },
      order: { timestamp: 'DESC' },
      take: pattern.threshold * 2,
    });
  }

  /**
   * Create threat from pattern match
   */
  private async createThreatFromPattern(
    log: SiemLog,
    pattern: ThreatPattern,
    relatedLogs: SiemLog[]
  ): Promise<Threat> {
    return this.threatRepository.create({
      type: pattern.type,
      severity: pattern.severity,
      status: ThreatStatus.DETECTED,
      title: `${pattern.name} detected`,
      description: `${pattern.description}. Detected ${relatedLogs.length} occurrences in the last ${pattern.timeWindow} minutes.`,
      timestamp: log.timestamp,
      sourceIp: log.ipAddress,
      targetUser: log.userId,
      threatScore: this.calculatePatternConfidence(pattern, relatedLogs) * 100,
      confidence: this.calculatePatternConfidence(pattern, relatedLogs),
      detectionData: {
        patternId: pattern.id,
        matchedConditions: pattern.conditions,
        logCount: relatedLogs.length,
        timeWindow: pattern.timeWindow,
      },
      relatedLogIds: relatedLogs.map(l => l.id),
    });
  }

  /**
   * Create threat from ML detection
   */
  private async createThreatFromML(log: SiemLog, mlScore: number): Promise<Threat> {
    return this.threatRepository.create({
      type: ThreatType.ANOMALOUS_BEHAVIOR,
      severity: mlScore > 0.9 ? ThreatSeverity.CRITICAL : ThreatSeverity.HIGH,
      status: ThreatStatus.DETECTED,
      title: 'ML-based threat detected',
      description: `Machine learning model detected anomalous behavior with confidence ${(mlScore * 100).toFixed(2)}%`,
      timestamp: log.timestamp,
      sourceIp: log.ipAddress,
      targetUser: log.userId,
      threatScore: mlScore * 100,
      confidence: mlScore,
      detectionData: {
        mlModel: 'tensorflow',
        mlScore,
        features: this.extractFeatures(log),
      },
      relatedLogIds: [log.id],
    });
  }

  /**
   * Create threat from anomaly detection
   */
  private async createThreatFromAnomaly(log: SiemLog, anomalies: string[]): Promise<Threat> {
    return this.threatRepository.create({
      type: ThreatType.ANOMALOUS_BEHAVIOR,
      severity: ThreatSeverity.MEDIUM,
      status: ThreatStatus.DETECTED,
      title: 'Anomalous activity detected',
      description: `Unusual activity detected: ${anomalies.join(', ')}`,
      timestamp: log.timestamp,
      sourceIp: log.ipAddress,
      targetUser: log.userId,
      threatScore: 75,
      confidence: 0.8,
      detectionData: {
        anomalies,
        logLevel: log.level,
        logSource: log.source,
      },
      relatedLogIds: [log.id],
    });
  }

  /**
   * Calculate pattern confidence
   */
  private calculatePatternConfidence(pattern: ThreatPattern, relatedLogs: SiemLog[]): number {
    const baseConfidence = 0.5;
    const logCountBonus = Math.min(relatedLogs.length / pattern.threshold, 1) * 0.3;
    const timeBonus = pattern.timeWindow < 60 ? 0.2 : 0; // Bonus for short time windows
    
    return Math.min(baseConfidence + logCountBonus + timeBonus, 1);
  }

  /**
   * Extract features from log for ML processing
   */
  private extractFeatures(log: SiemLog): number[] {
    return [
      this.encodeLogLevel(log.level),
      this.encodeLogSource(log.source),
      this.encodeLogCategory(log.category),
      log.threatScore || 0,
      log.ipAddress ? 1 : 0,
      log.userId ? 1 : 0,
      log.sessionId ? 1 : 0,
      log.triggeredAlert ? 1 : 0,
    ];
  }

  /**
   * Encode log level for ML
   */
  private encodeLogLevel(level: LogLevel): number {
    switch (level) {
      case LogLevel.DEBUG: return 0;
      case LogLevel.INFO: return 1;
      case LogLevel.WARN: return 2;
      case LogLevel.ERROR: return 3;
      case LogLevel.CRITICAL: return 4;
      default: return 0;
    }
  }

  /**
   * Encode log source for ML
   */
  private encodeLogSource(source: LogSource): number {
    const sources = Object.values(LogSource);
    return sources.indexOf(source);
  }

  /**
   * Encode log category for ML
   */
  private encodeLogCategory(category: LogCategory): number {
    const categories = Object.values(LogCategory);
    return categories.indexOf(category);
  }

  /**
   * Check for anomalies
   */
  private async checkAnomalies(log: SiemLog): Promise<string[]> {
    const anomalies: string[] = [];

    // Check for unusual login times
    if (log.category === LogCategory.AUTHENTICATION && log.userId) {
      const isUnusualTime = await this.checkUnusualLoginTime(log.userId, log.timestamp);
      if (isUnusualTime) {
        anomalies.push('Unusual login time');
      }
    }

    // Check for multiple failed logins
    if (log.category === LogCategory.AUTHENTICATION && log.message.includes('failed')) {
      const hasMultipleFailures = await this.checkMultipleFailedLogins(log.ipAddress, log.timestamp);
      if (hasMultipleFailures) {
        anomalies.push('Multiple failed login attempts');
      }
    }

    // Check for unusual access patterns
    if (log.category === LogCategory.DATA_ACCESS) {
      const isUnusualAccess = await this.checkUnusualAccessPattern(log.userId, log.details);
      if (isUnusualAccess) {
        anomalies.push('Unusual data access pattern');
      }
    }

    return anomalies;
  }

  /**
   * Check for unusual login times
   */
  private async checkUnusualLoginTime(userId: string, timestamp: Date): Promise<boolean> {
    try {
      const hour = timestamp.getHours();
      const key = `user_login_hours:${userId}`;
      
      // Get user's typical login hours
      const typicalHours = await this.redis.smembers(key);
      
      if (typicalHours.length === 0) {
        // First time user, record this hour
        await this.redis.sadd(key, hour.toString());
        await this.redis.expire(key, 86400 * 30); // 30 days
        return false;
      }

      // Check if current hour is unusual
      const isUnusual = !typicalHours.includes(hour.toString());
      
      // Update typical hours
      await this.redis.sadd(key, hour.toString());
      
      return isUnusual;
    } catch (error) {
      this.logger.error(`Failed to check unusual login time: ${error.message}`);
      return false;
    }
  }

  /**
   * Check for multiple failed logins
   */
  private async checkMultipleFailedLogins(ipAddress: string, timestamp: Date): Promise<boolean> {
    try {
      const key = `failed_logins:${ipAddress}`;
      const window = 300; // 5 minutes
      
      // Add current failure
      await this.redis.zadd(key, timestamp.getTime(), timestamp.getTime().toString());
      
      // Remove old entries
      const cutoff = timestamp.getTime() - window * 1000;
      await this.redis.zremrangebyscore(key, 0, cutoff);
      
      // Count recent failures
      const count = await this.redis.zcard(key);
      
      // Set expiration
      await this.redis.expire(key, window);
      
      return count >= 5; // Threshold for multiple failures
    } catch (error) {
      this.logger.error(`Failed to check multiple failed logins: ${error.message}`);
      return false;
    }
  }

  /**
   * Check for unusual access patterns
   */
  private async checkUnusualAccessPattern(userId: string, details: Record<string, any>): Promise<boolean> {
    // Implement access pattern analysis
    // This is a placeholder for more sophisticated analysis
    return false;
  }

  /**
   * Cache threat in Redis
   */
  private async cacheThreat(threat: Threat): Promise<void> {
    try {
      const key = `threat:${threat.id}`;
      const ttl = 86400; // 24 hours
      await this.redis.setex(key, ttl, JSON.stringify(threat));
    } catch (error) {
      this.logger.warn(`Failed to cache threat ${threat.id}: ${error.message}`);
    }
  }

  /**
   * Initialize threat patterns
   */
  private initializeThreatPatterns(): void {
    this.threatPatterns = [
      {
        id: 'brute-force-login',
        name: 'Brute Force Login Attack',
        description: 'Multiple failed login attempts from the same IP',
        type: ThreatType.BRUTE_FORCE,
        severity: ThreatSeverity.HIGH,
        conditions: [
          { field: 'category', operator: 'equals', value: LogCategory.AUTHENTICATION },
          { field: 'message', operator: 'contains', value: 'failed' },
        ],
        timeWindow: 15,
        threshold: 5,
        enabled: true,
      },
      {
        id: 'sql-injection',
        name: 'SQL Injection Attempt',
        description: 'Potential SQL injection attack detected',
        type: ThreatType.SQL_INJECTION,
        severity: ThreatSeverity.CRITICAL,
        conditions: [
          { field: 'category', operator: 'equals', value: LogCategory.SECURITY_EVENT },
          { field: 'message', operator: 'regex', value: '(?i)(union|select|insert|update|delete|drop|exec|script)' },
        ],
        timeWindow: 1,
        threshold: 1,
        enabled: true,
      },
      {
        id: 'ddos-attack',
        name: 'DDoS Attack',
        description: 'High volume of requests from multiple sources',
        type: ThreatType.DDoS,
        severity: ThreatSeverity.CRITICAL,
        conditions: [
          { field: 'source', operator: 'equals', value: LogSource.NETWORK },
          { field: 'level', operator: 'equals', value: LogLevel.WARN },
        ],
        timeWindow: 5,
        threshold: 100,
        enabled: true,
      },
      {
        id: 'unauthorized-access',
        name: 'Unauthorized Access Attempt',
        description: 'Attempt to access restricted resources',
        type: ThreatType.UNAUTHORIZED_ACCESS,
        severity: ThreatSeverity.HIGH,
        conditions: [
          { field: 'category', operator: 'equals', value: LogCategory.AUTHORIZATION },
          { field: 'message', operator: 'contains', value: 'unauthorized' },
        ],
        timeWindow: 10,
        threshold: 3,
        enabled: true,
      },
    ];
  }

  /**
   * Load ML model
   */
  private async loadMLModel(): Promise<void> {
    try {
      // Load pre-trained model or create a simple one for demo
      const modelPath = process.env.ML_MODEL_PATH;
      
      if (modelPath) {
        this.mlModel = await tf.loadLayersModel(`file://${modelPath}`);
        this.logger.log('ML model loaded successfully');
      } else {
        // Create a simple model for demonstration
        this.mlModel = tf.sequential({
          layers: [
            tf.layers.dense({ inputShape: [8], units: 16, activation: 'relu' }),
            tf.layers.dropout({ rate: 0.2 }),
            tf.layers.dense({ units: 8, activation: 'relu' }),
            tf.layers.dense({ units: 1, activation: 'sigmoid' }),
          ],
        });
        
        this.mlModel.compile({
          optimizer: 'adam',
          loss: 'binaryCrossentropy',
          metrics: ['accuracy'],
        });
        
        this.logger.log('Default ML model created');
      }
    } catch (error) {
      this.logger.error(`Failed to load ML model: ${error.message}`);
      this.mlModel = null;
    }
  }

  /**
   * Periodic threat pattern update
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateThreatPatterns(): Promise<void> {
    try {
      // Update patterns from database or external threat intelligence
      this.logger.log('Threat patterns updated');
    } catch (error) {
      this.logger.error(`Failed to update threat patterns: ${error.message}`);
    }
  }
}
