import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Threat, ThreatType } from '../entities/threat.entity';
import { Incident, IncidentType } from '../entities/incident.entity';

export interface MitreTechnique {
  id: string;
  name: string;
  description: string;
  tactic: MitreTactic;
  subTechniques?: MitreTechnique[];
  dataSources: string[];
  detection: string;
  mitigation: string;
  references: string[];
}

export interface MitreTactic {
  id: string;
  name: string;
  description: string;
}

export interface ThreatMitreMapping {
  threatId: string;
  techniqueId: string;
  tacticId: string;
  confidence: number;
  evidence: string[];
  mappedAt: Date;
}

export interface MitreAnalytics {
  techniqueFrequency: Record<string, number>;
  tacticFrequency: Record<string, number>;
  coverageGaps: string[];
  detectionMaturity: Record<string, 'low' | 'medium' | 'high'>;
  trendingTechniques: Array<{
    techniqueId: string;
    frequency: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
}

@Injectable()
export class MitreAttackService {
  private readonly logger = new Logger(MitreAttackService.name);
  private mitreData: {
    tactics: Record<string, MitreTactic>;
    techniques: Record<string, MitreTechnique>;
  };

  constructor(
    @InjectRepository(Threat)
    private readonly threatRepository: Repository<Threat>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
  ) {
    this.initializeMitreData();
  }

  /**
   * Map threat to MITRE ATT&CK techniques
   */
  async mapThreatToMitre(threat: Threat): Promise<ThreatMitreMapping[]> {
    const mappings: ThreatMitreMapping[] = [];

    try {
      // Map based on threat type
      const techniqueMappings = this.getTechniqueMappingsForThreatType(threat.type);
      
      for (const techniqueId of techniqueMappings) {
        const technique = this.mitreData.techniques[techniqueId];
        if (technique) {
          const confidence = this.calculateMappingConfidence(threat, technique);
          
          if (confidence > 0.5) {
            mappings.push({
              threatId: threat.id,
              techniqueId: technique.id,
              tacticId: technique.tactic.id,
              confidence,
              evidence: this.extractMappingEvidence(threat, technique),
              mappedAt: new Date(),
            });
          }
        }
      }

      // Map based on threat description and patterns
      const descriptionMappings = this.mapFromDescription(threat.description);
      mappings.push(...descriptionMappings);

      // Map based on detection data
      if (threat.detectionData) {
        const detectionMappings = this.mapFromDetectionData(threat.detectionData);
        mappings.push(...detectionMappings);
      }

      // Remove duplicates and sort by confidence
      const uniqueMappings = this.deduplicateMappings(mappings);
      return uniqueMappings.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      this.logger.error(`Failed to map threat to MITRE: ${error.message}`, error);
      return [];
    }
  }

  /**
   * Get MITRE ATT&CK techniques for threat type
   */
  private getTechniqueMappingsForThreatType(threatType: ThreatType): string[] {
    const mappings: Record<ThreatType, string[]> = {
      [ThreatType.BRUTE_FORCE]: ['T1110', 'T1110.001', 'T1110.002', 'T1110.003'],
      [ThreatType.SQL_INJECTION]: ['T1190', 'T1055', 'T1055.001'],
      [ThreatType.XSS]: ['T1059', 'T1059.001', 'T1203'],
      [ThreatType.DDoS]: ['T1498', 'T1498.001', 'T1499'],
      [ThreatType.PHISHING]: ['T1566', 'T1566.001', 'T1566.002', 'T1566.003'],
      [ThreatType.MALWARE]: ['T1204', 'T1204.001', 'T1204.002', 'T1053'],
      [ThreatType.INSIDER_THREAT]: ['T1078', 'T1078.001', 'T1078.002', 'T1133'],
      [ThreatType.DATA_EXFILTRATION]: ['T1041', 'T1048', 'T1567', 'T1567.001', 'T1567.002'],
      [ThreatType.PRIVILEGE_ESCALATION]: ['T1068', 'T1068.001', 'T1068.002', 'T1548'],
      [ThreatType.UNAUTHORIZED_ACCESS]: ['T1078', 'T1098', 'T1098.001', 'T1098.002'],
      [ThreatType.ANOMALOUS_BEHAVIOR]: ['T1082', 'T1083', 'T1018', 'T1007'],
    };

    return mappings[threatType] || [];
  }

  /**
   * Map threat description to MITRE techniques
   */
  private mapFromDescription(description: string): ThreatMitreMapping[] {
    const mappings: ThreatMitreMapping[] = [];
    const keywords = this.extractKeywords(description);

    for (const [techniqueId, technique] of Object.entries(this.mitreData.techniques)) {
      const matchScore = this.calculateKeywordMatch(keywords, technique);
      
      if (matchScore > 0.3) {
        mappings.push({
          threatId: '', // Will be set by caller
          techniqueId,
          tacticId: technique.tactic.id,
          confidence: matchScore,
          evidence: [`Description match: ${technique.name}`],
          mappedAt: new Date(),
        });
      }
    }

    return mappings;
  }

  /**
   * Map from detection data to MITRE techniques
   */
  private mapFromDetectionData(detectionData: Record<string, any>): ThreatMitreMapping[] {
    const mappings: ThreatMitreMapping[] = [];

    // Map based on specific detection patterns
    if (detectionData.patternId) {
      const patternMappings = this.getPatternMitreMappings(detectionData.patternId);
      for (const techniqueId of patternMappings) {
        const technique = this.mitreData.techniques[techniqueId];
        if (technique) {
          mappings.push({
            threatId: '', // Will be set by caller
            techniqueId,
            tacticId: technique.tactic.id,
            confidence: 0.8,
            evidence: [`Pattern match: ${detectionData.patternId}`],
            mappedAt: new Date(),
          });
        }
      }
    }

    return mappings;
  }

  /**
   * Calculate mapping confidence
   */
  private calculateMappingConfidence(threat: Threat, technique: MitreTechnique): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on threat type match
    const typeMappings = this.getTechniqueMappingsForThreatType(threat.type);
    if (typeMappings.includes(technique.id)) {
      confidence += 0.3;
    }

    // Boost confidence based on description match
    const descriptionKeywords = this.extractKeywords(threat.description);
    const techniqueKeywords = this.extractKeywords(technique.description + ' ' + technique.name);
    const keywordMatch = this.calculateKeywordMatch(descriptionKeywords, technique);
    confidence += keywordMatch * 0.2;

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract mapping evidence
   */
  private extractMappingEvidence(threat: Threat, technique: MitreTechnique): string[] {
    const evidence: string[] = [];

    // Evidence from threat type
    const typeMappings = this.getTechniqueMappingsForThreatType(threat.type);
    if (typeMappings.includes(technique.id)) {
      evidence.push(`Threat type mapping: ${threat.type} -> ${technique.name}`);
    }

    // Evidence from description
    const descriptionKeywords = this.extractKeywords(threat.description);
    const techniqueKeywords = this.extractKeywords(technique.description + ' ' + technique.name);
    const matchedKeywords = descriptionKeywords.filter(k => techniqueKeywords.includes(k));
    if (matchedKeywords.length > 0) {
      evidence.push(`Description keywords: ${matchedKeywords.join(', ')}`);
    }

    // Evidence from detection data
    if (threat.detectionData) {
      evidence.push(`Detection data: ${JSON.stringify(threat.detectionData)}`);
    }

    return evidence;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - in production, use NLP techniques
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    return [...new Set(words)];
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'among', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
      'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
      'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can',
      'will', 'just', 'should', 'now', 'detected', 'security', 'threat', 'attack',
    ];
    return stopWords.includes(word);
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordMatch(keywords: string[], technique: MitreTechnique): number {
    const techniqueKeywords = this.extractKeywords(technique.description + ' ' + technique.name);
    const matches = keywords.filter(k => techniqueKeywords.includes(k));
    
    if (keywords.length === 0) return 0;
    return matches.length / keywords.length;
  }

  /**
   * Remove duplicate mappings
   */
  private deduplicateMappings(mappings: ThreatMitreMapping[]): ThreatMitreMapping[] {
    const seen = new Set<string>();
    return mappings.filter(mapping => {
      const key = `${mapping.techniqueId}-${mapping.tacticId}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get MITRE pattern mappings
   */
  private getPatternMitreMappings(patternId: string): string[] {
    const patternMappings: Record<string, string[]> = {
      'brute-force-login': ['T1110', 'T1110.001'],
      'sql-injection': ['T1190', 'T1055'],
      'ddos-attack': ['T1498', 'T1498.001'],
      'unauthorized-access': ['T1078', 'T1098'],
      'phishing-campaign': ['T1566', 'T1566.001'],
    };

    return patternMappings[patternId] || [];
  }

  /**
   * Get MITRE ATT&CK analytics
   */
  async getMitreAnalytics(timeRange: { start: Date; end: Date }): Promise<MitreAnalytics> {
    try {
      // Get threats in time range
      const threats = await this.threatRepository.find({
        where: {
          timestamp: { $gte: timeRange.start, $lte: timeRange.end },
        },
      });

      const techniqueFrequency: Record<string, number> = {};
      const tacticFrequency: Record<string, number> = {};

      // Analyze threats
      for (const threat of threats) {
        const mappings = await this.mapThreatToMitre(threat);
        
        for (const mapping of mappings) {
          techniqueFrequency[mapping.techniqueId] = (techniqueFrequency[mapping.techniqueId] || 0) + 1;
          tacticFrequency[mapping.tacticId] = (tacticFrequency[mapping.tacticId] || 0) + 1;
        }
      }

      // Identify coverage gaps
      const coverageGaps = this.identifyCoverageGaps(techniqueFrequency);

      // Assess detection maturity
      const detectionMaturity = this.assessDetectionMaturity(techniqueFrequency);

      // Calculate trending techniques
      const trendingTechniques = await this.calculateTrendingTechniques(timeRange);

      return {
        techniqueFrequency,
        tacticFrequency,
        coverageGaps,
        detectionMaturity,
        trendingTechniques,
      };
    } catch (error) {
      this.logger.error(`Failed to get MITRE analytics: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Identify coverage gaps
   */
  private identifyCoverageGaps(techniqueFrequency: Record<string, number>): string[] {
    const gaps: string[] = [];
    
    // Identify techniques that are common in the wild but not detected
    const commonTechniques = ['T1059', 'T1083', 'T1018', 'T1055', 'T1068'];
    
    for (const techniqueId of commonTechniques) {
      if (!techniqueFrequency[techniqueId] || techniqueFrequency[techniqueId] < 5) {
        gaps.push(techniqueId);
      }
    }

    return gaps;
  }

  /**
   * Assess detection maturity
   */
  private assessDetectionMaturity(techniqueFrequency: Record<string, number>): Record<string, 'low' | 'medium' | 'high'> {
    const maturity: Record<string, 'low' | 'medium' | 'high'> = {};
    
    for (const [techniqueId, frequency] of Object.entries(techniqueFrequency)) {
      if (frequency >= 20) {
        maturity[techniqueId] = 'high';
      } else if (frequency >= 5) {
        maturity[techniqueId] = 'medium';
      } else {
        maturity[techniqueId] = 'low';
      }
    }

    return maturity;
  }

  /**
   * Calculate trending techniques
   */
  private async calculateTrendingTechniques(timeRange: { start: Date; end: Date }): Promise<Array<{
    techniqueId: string;
    frequency: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>> {
    // Compare current period with previous period
    const previousPeriodStart = new Date(timeRange.start.getTime() - (timeRange.end.getTime() - timeRange.start.getTime()));
    const previousPeriodEnd = timeRange.start;

    const currentThreats = await this.threatRepository.find({
      where: {
        timestamp: { $gte: timeRange.start, $lte: timeRange.end },
      },
    });

    const previousThreats = await this.threatRepository.find({
      where: {
        timestamp: { $gte: previousPeriodStart, $lte: previousPeriodEnd },
      },
    });

    const currentFrequency: Record<string, number> = {};
    const previousFrequency: Record<string, number> = {};

    // Calculate frequencies
    for (const threat of currentThreats) {
      const mappings = await this.mapThreatToMitre(threat);
      for (const mapping of mappings) {
        currentFrequency[mapping.techniqueId] = (currentFrequency[mapping.techniqueId] || 0) + 1;
      }
    }

    for (const threat of previousThreats) {
      const mappings = await this.mapThreatToMitre(threat);
      for (const mapping of mappings) {
        previousFrequency[mapping.techniqueId] = (previousFrequency[mapping.techniqueId] || 0) + 1;
      }
    }

    // Calculate trends
    const trending: Array<{
      techniqueId: string;
      frequency: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    }> = [];

    const allTechniques = new Set([...Object.keys(currentFrequency), ...Object.keys(previousFrequency)]);

    for (const techniqueId of allTechniques) {
      const current = currentFrequency[techniqueId] || 0;
      const previous = previousFrequency[techniqueId] || 0;
      
      let trend: 'increasing' | 'decreasing' | 'stable';
      if (current > previous * 1.2) {
        trend = 'increasing';
      } else if (current < previous * 0.8) {
        trend = 'decreasing';
      } else {
        trend = 'stable';
      }

      trending.push({
        techniqueId,
        frequency: current,
        trend,
      });
    }

    return trending.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
  }

  /**
   * Get MITRE ATT&CK technique by ID
   */
  getTechnique(techniqueId: string): MitreTechnique | null {
    return this.mitreData.techniques[techniqueId] || null;
  }

  /**
   * Get MITRE ATT&CK tactic by ID
   */
  getTactic(tacticId: string): MitreTactic | null {
    return this.mitreData.tactics[tacticId] || null;
  }

  /**
   * Get all MITRE ATT&CK tactics
   */
  getAllTactics(): MitreTactic[] {
    return Object.values(this.mitreData.tactics);
  }

  /**
   * Get all MITRE ATT&CK techniques
   */
  getAllTechniques(): MitreTechnique[] {
    return Object.values(this.mitreData.techniques);
  }

  /**
   * Get techniques by tactic
   */
  getTechniquesByTactic(tacticId: string): MitreTechnique[] {
    return Object.values(this.mitreData.techniques).filter(
      technique => technique.tactic.id === tacticId
    );
  }

  /**
   * Initialize MITRE ATT&CK data
   */
  private initializeMitreData(): void {
    this.mitreData = {
      tactics: {
        'TA0001': {
          id: 'TA0001',
          name: 'Initial Access',
          description: 'The adversary is trying to get into your network.',
        },
        'TA0002': {
          id: 'TA0002',
          name: 'Execution',
          description: 'The adversary is trying to run malicious code.',
        },
        'TA0003': {
          id: 'TA0003',
          name: 'Persistence',
          description: 'The adversary is trying to maintain their foothold.',
        },
        'TA0004': {
          id: 'TA0004',
          name: 'Privilege Escalation',
          description: 'The adversary is trying to gain higher-level permissions.',
        },
        'TA0005': {
          id: 'TA0005',
          name: 'Defense Evasion',
          description: 'The adversary is trying to avoid being detected.',
        },
        'TA0006': {
          id: 'TA0006',
          name: 'Credential Access',
          description: 'The adversary is trying to steal account names and passwords.',
        },
        'TA0007': {
          id: 'TA0007',
          name: 'Discovery',
          description: 'The adversary is trying to figure out your environment.',
        },
        'TA0008': {
          id: 'TA0008',
          name: 'Lateral Movement',
          description: 'The adversary is trying to move through your environment.',
        },
        'TA0009': {
          id: 'TA0009',
          name: 'Collection',
          description: 'The adversary is trying to gather data of interest to their goal.',
        },
        'TA0010': {
          id: 'TA0010',
          name: 'Exfiltration',
          description: 'The adversary is trying to steal data.',
        },
        'TA0011': {
          id: 'TA0011',
          name: 'Impact',
          description: 'The adversary is trying to manipulate, interrupt, or destroy your systems and data.',
        },
      },
      techniques: {
        'T1110': {
          id: 'T1110',
          name: 'Brute Force',
          description: 'Adversaries may use brute force techniques to gain access to accounts.',
          tactic: this.mitreData.tactics['TA0001'],
          dataSources: ['Authentication logs', 'Network traffic'],
          detection: 'Monitor for multiple failed login attempts',
          mitigation: 'Implement account lockout policies',
          references: ['https://attack.mitre.org/techniques/T1110/'],
        },
        'T1190': {
          id: 'T1190',
          name: 'Exploit Public-Facing Application',
          description: 'Adversaries may attempt to take advantage of a weakness in an Internet-facing computer.',
          tactic: this.mitreData.tactics['TA0001'],
          dataSources: ['Web application logs', 'Network traffic'],
          detection: 'Monitor for unusual web application requests',
          mitigation: 'Keep applications updated and patched',
          references: ['https://attack.mitre.org/techniques/T1190/'],
        },
        'T1055': {
          id: 'T1055',
          name: 'Process Injection',
          description: 'Adversaries may inject code into processes in order to evade process-based defenses.',
          tactic: this.mitreData.tactics['TA0002'],
          dataSources: ['Process monitoring', 'API calls'],
          detection: 'Monitor for unusual process behavior',
          mitigation: 'Use process monitoring tools',
          references: ['https://attack.mitre.org/techniques/T1055/'],
        },
        'T1498': {
          id: 'T1498',
          name: 'Network Denial of Service',
          description: 'Adversaries may perform network denial of service attacks to disrupt systems.',
          tactic: this.mitreData.tactics['TA0011'],
          dataSources: ['Network traffic', 'System logs'],
          detection: 'Monitor for unusual network traffic patterns',
          mitigation: 'Implement DDoS protection',
          references: ['https://attack.mitre.org/techniques/T1498/'],
        },
        'T1566': {
          id: 'T1566',
          name: 'Phishing',
          description: 'Adversaries may send phishing emails to gain access to victim systems.',
          tactic: this.mitreData.tactics['TA0001'],
          dataSources: ['Email logs', 'Network traffic'],
          detection: 'Monitor for suspicious emails',
          mitigation: 'Implement email filtering and user training',
          references: ['https://attack.mitre.org/techniques/T1566/'],
        },
        'T1041': {
          id: 'T1041',
          name: 'Exfiltration Over C2 Channel',
          description: 'Adversaries may steal data by exfiltrating it over an existing command and control channel.',
          tactic: this.mitreData.tactics['TA0010'],
          dataSources: ['Network traffic', 'Process monitoring'],
          detection: 'Monitor for unusual data transfers',
          mitigation: 'Implement data loss prevention',
          references: ['https://attack.mitre.org/techniques/T1041/'],
        },
        'T1068': {
          id: 'T1068',
          name: 'Exploitation for Privilege Escalation',
          description: 'Adversaries may exploit software vulnerabilities to gain higher privileges.',
          tactic: this.mitreData.tactics['TA0004'],
          dataSources: ['Process monitoring', 'System logs'],
          detection: 'Monitor for privilege escalation attempts',
          mitigation: 'Keep systems updated and patched',
          references: ['https://attack.mitre.org/techniques/T1068/'],
        },
        'T1078': {
          id: 'T1078',
          name: 'Valid Accounts',
          description: 'Adversaries may obtain and abuse credentials of existing accounts.',
          tactic: this.mitreData.tactics['TA0001'],
          dataSources: ['Authentication logs', 'Account management'],
          detection: 'Monitor for unusual account usage',
          mitigation: 'Implement strong authentication policies',
          references: ['https://attack.mitre.org/techniques/T1078/'],
        },
        'T1082': {
          id: 'T1082',
          name: 'System Information Discovery',
          description: 'Adversaries may attempt to get detailed information about the operating system and hardware.',
          tactic: this.mitreData.tactics['TA0007'],
          dataSources: ['Process monitoring', 'API calls'],
          detection: 'Monitor for system information gathering',
          mitigation: 'Restrict system information access',
          references: ['https://attack.mitre.org/techniques/T1082/'],
        },
        'T1018': {
          id: 'T1018',
          name: 'Remote System Discovery',
          description: 'Adversaries may attempt to get a listing of other systems by IP address, hostname, or other identifying characteristics.',
          tactic: this.mitreData.tactics['TA0007'],
          dataSources: ['Network traffic', 'Process monitoring'],
          detection: 'Monitor for network discovery activities',
          mitigation: 'Implement network segmentation',
          references: ['https://attack.mitre.org/techniques/T1018/'],
        },
      },
    };
  }
}
