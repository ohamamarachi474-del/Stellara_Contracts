import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForensicCase, ForensicCaseType, ForensicCaseStatus, EvidenceType } from '../entities/forensic-case.entity';
import { Incident, IncidentStatus } from '../entities/incident.entity';
import { Threat } from '../entities/threat.entity';
import { SiemLog } from '../entities/siem-log.entity';
import { Redis } from 'ioredis';

export interface EvidenceCollection {
  id: string;
  type: EvidenceType;
  source: string;
  description: string;
  collectedAt: Date;
  collectedBy: string;
  hash: string;
  size: number;
  location: string;
  metadata: Record<string, any>;
}

export interface ForensicTimeline {
  events: Array<{
    timestamp: Date;
    event: string;
    source: string;
    evidence: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
  }>;
  gaps: Array<{
    start: Date;
    end: Date;
    description: string;
  }>;
}

export interface ForensicAnalysis {
  caseId: string;
  findings: Array<{
    category: string;
    description: string;
    evidence: string[];
    confidence: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    discoveredAt: Date;
    recommendations: string[];
  }>;
  indicators: Array<{
    type: 'ip' | 'domain' | 'hash' | 'url' | 'email';
    value: string;
    context: string;
    confidence: number;
  }>;
  attackChain: Array<{
    phase: string;
    technique: string;
    evidence: string[];
    timestamp?: Date;
  }>;
}

export interface ForensicReport {
  caseId: string;
  executiveSummary: string;
  detailedFindings: string;
  methodology: string;
  evidence: EvidenceCollection[];
  timeline: ForensicTimeline;
  analysis: ForensicAnalysis;
  recommendations: string[];
  conclusions: string;
  nextSteps: string[];
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  reportDate: Date;
}

@Injectable()
export class ForensicAnalysisService {
  private readonly logger = new Logger(ForensicAnalysisService.name);
  private redis: Redis;

  constructor(
    @InjectRepository(ForensicCase)
    private readonly forensicCaseRepository: Repository<ForensicCase>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(Threat)
    private readonly threatRepository: Repository<Threat>,
    @InjectRepository(SiemLog)
    private readonly logRepository: Repository<SiemLog>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    });

    // Subscribe to incident events
    this.eventEmitter.on('incident.created', (incident: Incident) => {
      this.handleIncidentCreated(incident);
    });

    this.logger.log('Forensic analysis service initialized');
  }

  /**
   * Handle incident creation and initiate forensic case if needed
   */
  async handleIncidentCreated(incident: Incident): Promise<void> {
    try {
      // Determine if forensic investigation is needed
      if (this.requiresForensicInvestigation(incident)) {
        await this.createForensicCase(incident);
      }
    } catch (error) {
      this.logger.error(`Failed to handle incident creation: ${error.message}`, error);
    }
  }

  /**
   * Create forensic case from incident
   */
  async createForensicCase(incident: Incident): Promise<ForensicCase> {
    try {
      const caseNumber = await this.generateCaseNumber();
      
      const forensicCase = this.forensicCaseRepository.create({
        caseNumber,
        title: `Forensic Investigation: ${incident.title}`,
        type: this.mapIncidentTypeToForensicType(incident.type),
        status: ForensicCaseStatus.OPEN,
        priority: this.mapIncidentSeverityToPriority(incident.severity),
        description: `Forensic investigation for incident ${incident.ticketNumber}: ${incident.description}`,
        incidentId: incident.id,
        startedAt: new Date(),
        evidenceCollection: [],
        timeline: [],
        toolsUsed: [],
      });

      const savedCase = await this.forensicCaseRepository.save(forensicCase);

      // Link incident to forensic case
      incident.relatedIncidentIds = [...(incident.relatedIncidentIds || []), savedCase.id];
      await this.incidentRepository.save(incident);

      // Start evidence collection
      await this.initiateEvidenceCollection(savedCase, incident);

      this.logger.log(`Forensic case ${savedCase.caseNumber} created for incident ${incident.ticketNumber}`);
      return savedCase;
    } catch (error) {
      this.logger.error(`Failed to create forensic case: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Initiate evidence collection for forensic case
   */
  async initiateEvidenceCollection(forensicCase: ForensicCase, incident: Incident): Promise<void> {
    try {
      // Update case status
      forensicCase.status = ForensicCaseStatus.COLLECTION;
      await this.forensicCaseRepository.save(forensicCase);

      // Collect various types of evidence
      const evidencePromises = [
        this.collectLogEvidence(forensicCase, incident),
        this.collectSystemEvidence(forensicCase, incident),
        this.collectNetworkEvidence(forensicCase, incident),
        this.collectMemoryEvidence(forensicCase, incident),
        this.collectApplicationEvidence(forensicCase, incident),
      ];

      const evidenceResults = await Promise.allSettled(evidencePromises);
      
      // Process results
      const collectedEvidence = evidenceResults
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => (result as PromiseFulfilledResult<EvidenceCollection[]>).value);

      // Update case with collected evidence
      forensicCase.evidenceCollection = collectedEvidence;
      forensicCase.status = ForensicCaseStatus.ANALYSIS;
      await this.forensicCaseRepository.save(forensicCase);

      // Start timeline reconstruction
      await this.reconstructTimeline(forensicCase);

      this.logger.log(`Evidence collection completed for case ${forensicCase.caseNumber}`);
    } catch (error) {
      this.logger.error(`Failed to initiate evidence collection: ${error.message}`, error);
      forensicCase.status = ForensicCaseStatus.OPEN;
      await this.forensicCaseRepository.save(forensicCase);
    }
  }

  /**
   * Collect log evidence
   */
  async collectLogEvidence(forensicCase: ForensicCase, incident: Incident): Promise<EvidenceCollection[]> {
    const evidence: EvidenceCollection[] = [];

    try {
      // Get incident time range
      const timeRange = {
        start: new Date(incident.detectedAt.getTime() - 24 * 60 * 60 * 1000), // 24 hours before
        end: new Date(incident.detectedAt.getTime() + 24 * 60 * 60 * 1000), // 24 hours after
      };

      // Collect related logs
      const logs = await this.logRepository.find({
        where: {
          timestamp: Between(timeRange.start, timeRange.end),
          $or: [
            { threatId: { $in: incident.threatIds } },
            { userId: incident.threats?.[0]?.targetUser },
            { ipAddress: incident.threats?.[0]?.sourceIp },
          ],
        },
        order: { timestamp: 'ASC' },
      });

      if (logs.length > 0) {
        const logData = {
          logs: logs.map(log => ({
            id: log.id,
            timestamp: log.timestamp,
            level: log.level,
            source: log.source,
            category: log.category,
            message: log.message,
            details: log.details,
            userId: log.userId,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
          })),
          count: logs.length,
          timeRange,
        };

        const logEvidence: EvidenceCollection = {
          id: this.generateEvidenceId(),
          type: EvidenceType.LOG_FILE,
          source: 'SIEM System',
          description: `System logs related to incident ${incident.ticketNumber}`,
          collectedAt: new Date(),
          collectedBy: 'system',
          hash: await this.calculateHash(JSON.stringify(logData)),
          size: JSON.stringify(logData).length,
          location: `forensic/evidence/${forensicCase.id}/logs.json`,
          metadata: {
            logCount: logs.length,
            timeRange,
            sources: [...new Set(logs.map(log => log.source))],
            categories: [...new Set(logs.map(log => log.category))],
          },
        };

        evidence.push(logEvidence);

        // Store evidence data
        await this.storeEvidenceData(logEvidence.location, logData);
      }
    } catch (error) {
      this.logger.error(`Failed to collect log evidence: ${error.message}`);
    }

    return evidence;
  }

  /**
   * Collect system evidence
   */
  async collectSystemEvidence(forensicCase: ForensicCase, incident: Incident): Promise<EvidenceCollection[]> {
    const evidence: EvidenceCollection[] = [];

    try {
      // Collect system information
      const systemInfo = await this.collectSystemInformation();
      
      if (systemInfo) {
        const systemEvidence: EvidenceCollection = {
          id: this.generateEvidenceId(),
          type: EvidenceType.SYSTEM_IMAGE,
          source: 'System',
          description: `System state snapshot for incident ${incident.ticketNumber}`,
          collectedAt: new Date(),
          collectedBy: 'system',
          hash: await this.calculateHash(JSON.stringify(systemInfo)),
          size: JSON.stringify(systemInfo).length,
          location: `forensic/evidence/${forensicCase.id}/system.json`,
          metadata: {
            hostname: systemInfo.hostname,
            os: systemInfo.os,
            timestamp: systemInfo.timestamp,
          },
        };

        evidence.push(systemEvidence);
        await this.storeEvidenceData(systemEvidence.location, systemInfo);
      }
    } catch (error) {
      this.logger.error(`Failed to collect system evidence: ${error.message}`);
    }

    return evidence;
  }

  /**
   * Collect network evidence
   */
  async collectNetworkEvidence(forensicCase: ForensicCase, incident: Incident): Promise<EvidenceCollection[]> {
    const evidence: EvidenceCollection[] = [];

    try {
      // Collect network traffic data
      const networkData = await this.collectNetworkData(incident);
      
      if (networkData && networkData.connections.length > 0) {
        const networkEvidence: EvidenceCollection = {
          id: this.generateEvidenceId(),
          type: EvidenceType.NETWORK_CAPTURE,
          source: 'Network',
          description: `Network traffic related to incident ${incident.ticketNumber}`,
          collectedAt: new Date(),
          collectedBy: 'system',
          hash: await this.calculateHash(JSON.stringify(networkData)),
          size: JSON.stringify(networkData).length,
          location: `forensic/evidence/${forensicCase.id}/network.json`,
          metadata: {
            connectionCount: networkData.connections.length,
            timeRange: networkData.timeRange,
            protocols: [...new Set(networkData.connections.map(c => c.protocol))],
          },
        };

        evidence.push(networkEvidence);
        await this.storeEvidenceData(networkEvidence.location, networkData);
      }
    } catch (error) {
      this.logger.error(`Failed to collect network evidence: ${error.message}`);
    }

    return evidence;
  }

  /**
   * Collect memory evidence
   */
  async collectMemoryEvidence(forensicCase: ForensicCase, incident: Incident): Promise<EvidenceCollection[]> {
    const evidence: EvidenceCollection[] = [];

    try {
      // Collect memory dump information
      const memoryData = await this.collectMemoryData();
      
      if (memoryData) {
        const memoryEvidence: EvidenceCollection = {
          id: this.generateEvidenceId(),
          type: EvidenceType.MEMORY_DUMP,
          source: 'Memory',
          description: `Memory analysis for incident ${incident.ticketNumber}`,
          collectedAt: new Date(),
          collectedBy: 'system',
          hash: await this.calculateHash(JSON.stringify(memoryData)),
          size: JSON.stringify(memoryData).length,
          location: `forensic/evidence/${forensicCase.id}/memory.json`,
          metadata: {
            processCount: memoryData.processes?.length || 0,
            timestamp: memoryData.timestamp,
          },
        };

        evidence.push(memoryEvidence);
        await this.storeEvidenceData(memoryEvidence.location, memoryData);
      }
    } catch (error) {
      this.logger.error(`Failed to collect memory evidence: ${error.message}`);
    }

    return evidence;
  }

  /**
   * Collect application evidence
   */
  async collectApplicationEvidence(forensicCase: ForensicCase, incident: Incident): Promise<EvidenceCollection[]> {
    const evidence: EvidenceCollection[] = [];

    try {
      // Collect application-specific data
      const appData = await this.collectApplicationData(incident);
      
      if (appData) {
        const appEvidence: EvidenceCollection = {
          id: this.generateEvidenceId(),
          type: EvidenceType.APPLICATION_DATA,
          source: 'Application',
          description: `Application data for incident ${incident.ticketNumber}`,
          collectedAt: new Date(),
          collectedBy: 'system',
          hash: await this.calculateHash(JSON.stringify(appData)),
          size: JSON.stringify(appData).length,
          location: `forensic/evidence/${forensicCase.id}/application.json`,
          metadata: {
            application: appData.application,
            version: appData.version,
            timestamp: appData.timestamp,
          },
        };

        evidence.push(appEvidence);
        await this.storeEvidenceData(appEvidence.location, appData);
      }
    } catch (error) {
      this.logger.error(`Failed to collect application evidence: ${error.message}`);
    }

    return evidence;
  }

  /**
   * Reconstruct timeline from evidence
   */
  async reconstructTimeline(forensicCase: ForensicCase): Promise<ForensicTimeline> {
    try {
      const timeline: ForensicTimeline = {
        events: [],
        gaps: [],
      };

      // Get all evidence
      const evidence = forensicCase.evidenceCollection || [];

      // Process each evidence type
      for (const ev of evidence) {
        const evidenceData = await this.loadEvidenceData(ev.location);
        
        if (ev.type === EvidenceType.LOG_FILE && evidenceData.logs) {
          for (const log of evidenceData.logs) {
            timeline.events.push({
              timestamp: log.timestamp,
              event: log.message,
              source: `${log.source}:${log.category}`,
              evidence: [ev.id],
              severity: this.mapLogLevelToSeverity(log.level),
              category: log.category,
            });
          }
        }
      }

      // Sort events by timestamp
      timeline.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Identify gaps in timeline
      timeline.gaps = this.identifyTimelineGaps(timeline.events);

      // Update case with timeline
      forensicCase.timeline = timeline.events;
      await this.forensicCaseRepository.save(forensicCase);

      this.logger.log(`Timeline reconstructed for case ${forensicCase.caseNumber} with ${timeline.events.length} events`);
      return timeline;
    } catch (error) {
      this.logger.error(`Failed to reconstruct timeline: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Perform forensic analysis
   */
  async performForensicAnalysis(forensicCase: ForensicCase): Promise<ForensicAnalysis> {
    try {
      // Update case status
      forensicCase.status = ForensicCaseStatus.ANALYSIS;
      await this.forensicCaseRepository.save(forensicCase);

      const analysis: ForensicAnalysis = {
        caseId: forensicCase.id,
        findings: [],
        indicators: [],
        attackChain: [],
      };

      // Analyze evidence for findings
      for (const evidence of forensicCase.evidenceCollection || []) {
        const evidenceAnalysis = await this.analyzeEvidence(evidence);
        analysis.findings.push(...evidenceAnalysis.findings);
        analysis.indicators.push(...evidenceAnalysis.indicators);
      }

      // Reconstruct attack chain
      analysis.attackChain = await this.reconstructAttackChain(forensicCase);

      // Update case with analysis
      forensicCase.findings = analysis.findings;
      await this.forensicCaseRepository.save(forensicCase);

      this.logger.log(`Forensic analysis completed for case ${forensicCase.caseNumber}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Failed to perform forensic analysis: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Generate forensic report
   */
  async generateForensicReport(forensicCase: ForensicCase): Promise<ForensicReport> {
    try {
      // Perform analysis if not already done
      const analysis = forensicCase.findings?.length > 0 
        ? { findings: forensicCase.findings, indicators: [], attackChain: [] }
        : await this.performForensicAnalysis(forensicCase);

      const report: ForensicReport = {
        caseId: forensicCase.id,
        executiveSummary: this.generateExecutiveSummary(forensicCase, analysis),
        detailedFindings: this.generateDetailedFindings(analysis),
        methodology: this.generateMethodology(),
        evidence: forensicCase.evidenceCollection || [],
        timeline: {
          events: forensicCase.timeline || [],
          gaps: [],
        },
        analysis,
        recommendations: this.generateRecommendations(analysis),
        conclusions: this.generateConclusions(forensicCase, analysis),
        nextSteps: this.generateNextSteps(forensicCase, analysis),
        preparedBy: 'Forensic Analyst',
        reviewedBy: 'Security Manager',
        approvedBy: 'CISO',
        reportDate: new Date(),
      };

      // Update case with report
      forensicCase.report = report;
      forensicCase.status = ForensicCaseStatus.REPORTING;
      await this.forensicCaseRepository.save(forensicCase);

      this.logger.log(`Forensic report generated for case ${forensicCase.caseNumber}`);
      return report;
    } catch (error) {
      this.logger.error(`Failed to generate forensic report: ${error.message}`, error);
      throw error;
    }
  }

  // Helper methods
  private async generateCaseNumber(): Promise<string> {
    const prefix = 'FC';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
  }

  private generateEvidenceId(): string {
    return `evd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private requiresForensicInvestigation(incident: Incident): boolean {
    // Determine if incident requires forensic investigation
    const highSeverityIncidents = [
      IncidentType.SECURITY_BREACH,
      IncidentType.DATA_BREACH,
      IncidentType.MALWARE_OUTBREAK,
      IncidentType.INSIDER_THREAT,
    ];

    return highSeverityIncidents.includes(incident.type) || 
           incident.severity === 'critical';
  }

  private mapIncidentTypeToForensicType(incidentType: IncidentType): ForensicCaseType {
    const mapping = {
      [IncidentType.SECURITY_BREACH]: ForensicCaseType.SECURITY_BREACH,
      [IncidentType.DATA_BREACH]: ForensicCaseType.DATA_BREACH,
      [IncidentType.MALWARE_OUTBREAK]: ForensicCaseType.MALWARE_ANALYSIS,
      [IncidentType.NETWORK_INTRUSION]: ForensicCaseType.NETWORK_INTRUSION,
      [IncidentType.INSIDER_THREAT]: ForensicCaseType.INSIDER_THREAT,
      [IncidentType.PHISHING_CAMPAIGN]: ForensicCaseType.FRAUD_INVESTIGATION,
      [IncidentType.UNAUTHORIZED_ACCESS]: ForensicCaseType.SECURITY_BREACH,
      [IncidentType.PRIVILEGE_ESCALATION]: ForensicCaseType.SECURITY_BREACH,
      [IncidentType.DDOS_ATTACK]: ForensicCaseType.NETWORK_INTRUSION,
    };
    return mapping[incidentType] || ForensicCaseType.SECURITY_BREACH;
  }

  private mapIncidentSeverityToPriority(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    const mapping = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'critical': 'critical',
    };
    return mapping[severity] || 'medium';
  }

  private mapLogLevelToSeverity(level: string): 'low' | 'medium' | 'high' | 'critical' {
    const mapping = {
      'debug': 'low',
      'info': 'low',
      'warn': 'medium',
      'error': 'high',
      'critical': 'critical',
    };
    return mapping[level] || 'low';
  }

  private async calculateHash(data: string): Promise<string> {
    // Implement hash calculation (e.g., SHA-256)
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async storeEvidenceData(location: string, data: any): Promise<void> {
    // Store evidence data in secure storage
    await this.redis.setex(location, 86400 * 30, JSON.stringify(data)); // 30 days
  }

  private async loadEvidenceData(location: string): Promise<any> {
    const data = await this.redis.get(location);
    return data ? JSON.parse(data) : null;
  }

  private identifyTimelineGaps(events: any[]): Array<{ start: Date; end: Date; description: string }> {
    const gaps: Array<{ start: Date; end: Date; description: string }> = [];
    
    if (events.length < 2) return gaps;

    for (let i = 1; i < events.length; i++) {
      const timeDiff = events[i].timestamp.getTime() - events[i-1].timestamp.getTime();
      const gapThreshold = 60 * 60 * 1000; // 1 hour
      
      if (timeDiff > gapThreshold) {
        gaps.push({
          start: events[i-1].timestamp,
          end: events[i].timestamp,
          description: `Gap of ${Math.round(timeDiff / (60 * 60 * 1000))} hours in event timeline`,
        });
      }
    }

    return gaps;
  }

  private async analyzeEvidence(evidence: EvidenceCollection): Promise<{ findings: any[]; indicators: any[] }> {
    const findings: any[] = [];
    const indicators: any[] = [];

    // Implement evidence analysis logic
    // This would include pattern matching, anomaly detection, etc.

    return { findings, indicators };
  }

  private async reconstructAttackChain(forensicCase: ForensicCase): Promise<any[]> {
    // Implement attack chain reconstruction
    return [];
  }

  private generateExecutiveSummary(forensicCase: ForensicCase, analysis: ForensicAnalysis): string {
    return `Forensic investigation case ${forensicCase.caseNumber} identified ${analysis.findings.length} key findings and ${analysis.indicators.length} indicators of compromise.`;
  }

  private generateDetailedFindings(analysis: ForensicAnalysis): string {
    return `Analysis revealed ${analysis.findings.length} significant findings with varying severity levels.`;
  }

  private generateMethodology(): string {
    return 'Standard forensic methodology was followed including evidence collection, preservation, analysis, and reporting.';
  }

  private generateRecommendations(analysis: ForensicAnalysis): string[] {
    return [
      'Implement enhanced monitoring for identified indicators',
      'Review and update security controls',
      'Conduct security awareness training',
      'Implement network segmentation',
    ];
  }

  private generateConclusions(forensicCase: ForensicCase, analysis: ForensicAnalysis): string {
    return `The forensic investigation concluded that the incident was successfully contained and evidence has been preserved for potential legal proceedings.`;
  }

  private generateNextSteps(forensicCase: ForensicCase, analysis: ForensicAnalysis): string[] {
    return [
      'Monitor for related activity',
      'Implement security improvements',
      'Schedule follow-up investigation',
      'Update incident response procedures',
    ];
  }

  // Placeholder implementations for evidence collection
  private async collectSystemInformation(): Promise<any> {
    return {
      hostname: 'server-01',
      os: 'Ubuntu 20.04',
      timestamp: new Date(),
    };
  }

  private async collectNetworkData(incident: Incident): Promise<any> {
    return {
      connections: [],
      timeRange: { start: incident.detectedAt, end: incident.detectedAt },
    };
  }

  private async collectMemoryData(): Promise<any> {
    return {
      processes: [],
      timestamp: new Date(),
    };
  }

  private async collectApplicationData(incident: Incident): Promise<any> {
    return {
      application: 'Stellara Backend',
      version: '1.0.0',
      timestamp: new Date(),
    };
  }
}
