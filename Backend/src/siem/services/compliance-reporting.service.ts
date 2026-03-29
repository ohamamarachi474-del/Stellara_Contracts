import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { 
  ComplianceReport, 
  ComplianceFramework, 
  ReportType, 
  ReportStatus, 
  ReportFrequency 
} from '../entities/compliance-report.entity';
import { Incident, IncidentSeverity, IncidentStatus } from '../entities/incident.entity';
import { Threat, ThreatSeverity, ThreatStatus } from '../entities/threat.entity';
import { SiemLog, LogLevel, LogSource, LogCategory } from '../entities/siem-log.entity';

export interface ComplianceMetrics {
  totalEvents: number;
  threatsDetected: number;
  incidentsResolved: number;
  averageResponseTime: number;
  systemUptime: number;
  securityScore: number;
  compliancePercentage: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComplianceRequirement {
  controlId: string;
  requirement: string;
  framework: ComplianceFramework;
  category: string;
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable';
  evidence: string[];
  findings: string;
  recommendations: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  lastAssessed: Date;
}

export interface ComplianceAssessment {
  framework: ComplianceFramework;
  overallScore: number;
  requirements: ComplianceRequirement[];
  gaps: string[];
  recommendations: string[];
  assessedAt: Date;
  nextAssessmentDate: Date;
}

@Injectable()
export class ComplianceReportingService {
  private readonly logger = new Logger(ComplianceReportingService.name);

  constructor(
    @InjectRepository(ComplianceReport)
    private readonly complianceReportRepository: Repository<ComplianceReport>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(Threat)
    private readonly threatRepository: Repository<Threat>,
    @InjectRepository(SiemLog)
    private readonly logRepository: Repository<SiemLog>,
  ) {}

  /**
   * Generate SOC 2 compliance report
   */
  async generateSOC2Report(
    periodStart: Date,
    periodEnd: Date,
    reportType: ReportType = ReportType.COMPLIANCE_ASSESSMENT
  ): Promise<ComplianceReport> {
    try {
      this.logger.log(`Generating SOC 2 report for period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

      const report = this.complianceReportRepository.create({
        title: `SOC 2 Compliance Report - ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`,
        framework: ComplianceFramework.SOC2,
        reportType,
        status: ReportStatus.DRAFT,
        frequency: ReportFrequency.QUARTERLY,
        periodStart,
        periodEnd,
        generatedAt: new Date(),
        summary: 'SOC 2 Type II compliance assessment for security controls',
      });

      // Get compliance metrics
      const metrics = await this.calculateComplianceMetrics(periodStart, periodEnd);
      report.metrics = metrics;

      // Assess SOC 2 requirements
      const assessment = await this.assessSOC2Requirements(periodStart, periodEnd);
      report.requirements = assessment.requirements;

      // Calculate compliance score
      report.complianceScore = assessment.overallScore;

      // Determine risk level
      report.riskLevel = this.calculateRiskLevel(assessment.overallScore, metrics);

      // Generate incident summary
      report.incidentSummary = await this.generateIncidentSummary(periodStart, periodEnd);

      // Generate threat landscape analysis
      report.threatLandscape = await this.generateThreatLandscapeAnalysis(periodStart, periodEnd);

      // Generate security controls assessment
      report.securityControls = await this.assessSecurityControls(periodStart, periodEnd);

      // Generate findings and recommendations
      const { findings, recommendations } = await this.generateSOC2Findings(assessment, metrics);
      report.auditFindings = findings;
      report.recommendations = recommendations;

      // Save report
      const savedReport = await this.complianceReportRepository.save(report);

      this.logger.log(`SOC 2 report generated: ${savedReport.id}`);
      return savedReport;
    } catch (error) {
      this.logger.error(`Failed to generate SOC 2 report: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Generate ISO 27001 compliance report
   */
  async generateISO27001Report(
    periodStart: Date,
    periodEnd: Date,
    reportType: ReportType = ReportType.COMPLIANCE_ASSESSMENT
  ): Promise<ComplianceReport> {
    try {
      this.logger.log(`Generating ISO 27001 report for period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

      const report = this.complianceReportRepository.create({
        title: `ISO 27001 Compliance Report - ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`,
        framework: ComplianceFramework.ISO27001,
        reportType,
        status: ReportStatus.DRAFT,
        frequency: ReportFrequency.ANNUALLY,
        periodStart,
        periodEnd,
        generatedAt: new Date(),
        summary: 'ISO 27001 Information Security Management System compliance assessment',
      });

      // Get compliance metrics
      const metrics = await this.calculateComplianceMetrics(periodStart, periodEnd);
      report.metrics = metrics;

      // Assess ISO 27001 requirements
      const assessment = await this.assessISO27001Requirements(periodStart, periodEnd);
      report.requirements = assessment.requirements;

      // Calculate compliance score
      report.complianceScore = assessment.overallScore;

      // Determine risk level
      report.riskLevel = this.calculateRiskLevel(assessment.overallScore, metrics);

      // Generate risk assessment
      report.riskAssessment = await this.generateRiskAssessment(periodStart, periodEnd);

      // Generate audit findings
      report.auditFindings = await this.generateAuditFindings(assessment);

      // Save report
      const savedReport = await this.complianceReportRepository.save(report);

      this.logger.log(`ISO 27001 report generated: ${savedReport.id}`);
      return savedReport;
    } catch (error) {
      this.logger.error(`Failed to generate ISO 27001 report: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Assess SOC 2 requirements
   */
  private async assessSOC2Requirements(
    periodStart: Date,
    periodEnd: Date
  ): Promise<ComplianceAssessment> {
    const requirements: ComplianceRequirement[] = [];

    // SOC 2 Trust Services Criteria
    const soc2Requirements = [
      {
        controlId: 'CC1.1',
        requirement: 'Control Environment',
        category: 'Security',
        description: 'Management establishes structures, reporting lines, and authorities to communicate information technology control objectives and directions.',
      },
      {
        controlId: 'CC2.1',
        requirement: 'Communication and Direction',
        category: 'Security',
        description: 'Management communicates and directs the achievement of information technology control objectives through policies, standards, procedures, and other documentation.',
      },
      {
        controlId: 'CC3.1',
        requirement: 'Risk Assessment Process',
        category: 'Security',
        description: 'Management identifies risks that could affect the achievement of its information technology control objectives.',
      },
      {
        controlId: 'CC4.1',
        requirement: 'Monitoring',
        category: 'Security',
        description: 'The entity monitors the information technology system to achieve the communicated information technology control objectives.',
      },
      {
        controlId: 'CC6.1',
        requirement: 'Logical and Physical Access Controls',
        category: 'Security',
        description: 'The entity implements logical access security software, infrastructure, and architectures to protect information assets.',
      },
      {
        controlId: 'CC6.2',
        requirement: 'Logical and Physical Access Controls',
        category: 'Security',
        description: 'The entity restricts access to information assets and facilities to authorized users.',
      },
      {
        controlId: 'CC6.3',
        requirement: 'Logical and Physical Access Controls',
        category: 'Security',
        description: 'The entity provides for the identification, authentication, and authorization of users.',
      },
      {
        controlId: 'CC6.7',
        requirement: 'Logical and Physical Access Controls',
        category: 'Security',
        description: 'The entity restricts access to system components and data.',
      },
      {
        controlId: 'CC7.1',
        requirement: 'System Operations',
        category: 'Availability',
        description: 'The entity uses detection and monitoring procedures to identify, analyze, and remediate disruptions.',
      },
      {
        controlId: 'CC8.1',
        requirement: 'Change Management',
        category: 'Security',
        description: 'The entity authorizes, designs, develops, tests, approves, and implements changes to system components.',
      },
    ];

    for (const req of soc2Requirements) {
      const assessment = await this.assessRequirement(req.controlId, periodStart, periodEnd);
      requirements.push({
        controlId: req.controlId,
        requirement: req.requirement,
        framework: ComplianceFramework.SOC2,
        category: req.category,
        ...assessment,
      });
    }

    const overallScore = this.calculateOverallScore(requirements);
    const gaps = requirements.filter(r => r.status === 'non_compliant').map(r => r.controlId);
    const recommendations = this.generateRecommendations(requirements);

    return {
      framework: ComplianceFramework.SOC2,
      overallScore,
      requirements,
      gaps,
      recommendations,
      assessedAt: new Date(),
      nextAssessmentDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };
  }

  /**
   * Assess ISO 27001 requirements
   */
  private async assessISO27001Requirements(
    periodStart: Date,
    periodEnd: Date
  ): Promise<ComplianceAssessment> {
    const requirements: ComplianceRequirement[] = [];

    // ISO 27001:2022 Annex A controls
    const isoRequirements = [
      {
        controlId: 'A.5.1',
        requirement: 'Policies for Information Security',
        category: 'Organizational',
        description: 'Information security policies shall be defined, approved by management, and communicated to employees.',
      },
      {
        controlId: 'A.6.1',
        requirement: 'Internal Organization',
        category: 'Organizational',
        description: 'Internal organization shall be established to implement information security.',
      },
      {
        controlId: 'A.7.1',
        requirement: 'Human Resource Security',
        category: 'Human Resources',
        description: 'Human resource security controls shall be implemented before, during, and after employment.',
      },
      {
        controlId: 'A.8.1',
        requirement: 'Asset Management',
        category: 'Asset Management',
        description: 'Assets shall be identified and an appropriate protection level shall be assigned.',
      },
      {
        controlId: 'A.9.1',
        requirement: 'Access Control',
        category: 'Access Control',
        description: 'Access to information and other associated assets shall be limited to authorized users.',
      },
      {
        controlId: 'A.10.1',
        requirement: 'Cryptography',
        category: 'Cryptography',
        description: 'Cryptographic controls shall be used to protect confidentiality and integrity of information.',
      },
      {
        controlId: 'A.11.1',
        requirement: 'Physical and Environmental Security',
        category: 'Physical Security',
        description: 'Physical and environmental security controls shall be implemented.',
      },
      {
        controlId: 'A.12.1',
        requirement: 'Operations Security',
        category: 'Operations',
        description: 'Procedures and responsibilities shall be established for secure operations.',
      },
      {
        controlId: 'A.13.1',
        requirement: 'Communications Security',
        category: 'Network Security',
        description: 'Network security controls shall be implemented to protect information in networks.',
      },
      {
        controlId: 'A.14.1',
        requirement: 'System Acquisition, Development and Maintenance',
        category: 'Development',
        description: 'Security shall be integrated into the system development lifecycle.',
      },
      {
        controlId: 'A.15.1',
        requirement: 'Supplier Relationships',
        category: 'Supplier Management',
        description: 'Security requirements shall be established and managed with suppliers.',
      },
      {
        controlId: 'A.16.1',
        requirement: 'Information Security Incident Management',
        category: 'Incident Management',
        description: 'Information security incidents shall be managed effectively.',
      },
    ];

    for (const req of isoRequirements) {
      const assessment = await this.assessRequirement(req.controlId, periodStart, periodEnd);
      requirements.push({
        controlId: req.controlId,
        requirement: req.requirement,
        framework: ComplianceFramework.ISO27001,
        category: req.category,
        ...assessment,
      });
    }

    const overallScore = this.calculateOverallScore(requirements);
    const gaps = requirements.filter(r => r.status === 'non_compliant').map(r => r.controlId);
    const recommendations = this.generateRecommendations(requirements);

    return {
      framework: ComplianceFramework.ISO27001,
      overallScore,
      requirements,
      gaps,
      recommendations,
      assessedAt: new Date(),
      nextAssessmentDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };
  }

  /**
   * Assess individual requirement
   */
  private async assessRequirement(
    controlId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Omit<ComplianceRequirement, 'controlId' | 'requirement' | 'framework' | 'category'>> {
    // This would implement specific assessment logic for each control
    // For now, return a placeholder assessment
    const evidence = await this.collectEvidenceForRequirement(controlId, periodStart, periodEnd);
    const status = this.evaluateComplianceStatus(controlId, evidence);
    const findings = this.generateFindings(controlId, status, evidence);
    const recommendations = this.generateRequirementRecommendations(controlId, status);

    return {
      status,
      evidence,
      findings,
      recommendations,
      priority: this.determinePriority(controlId, status),
      lastAssessed: new Date(),
    };
  }

  /**
   * Calculate compliance metrics
   */
  private async calculateComplianceMetrics(
    periodStart: Date,
    periodEnd: Date
  ): Promise<ComplianceMetrics> {
    try {
      // Get total events processed
      const totalEvents = await this.logRepository.count({
        where: {
          timestamp: Between(periodStart, periodEnd),
        },
      });

      // Get threats detected
      const threatsDetected = await this.threatRepository.count({
        where: {
          timestamp: Between(periodStart, periodEnd),
          status: ThreatStatus.DETECTED,
        },
      });

      // Get incidents resolved
      const incidentsResolved = await this.incidentRepository.count({
        where: {
          detectedAt: Between(periodStart, periodEnd),
          status: IncidentStatus.RESOLVED,
        },
      });

      // Calculate average response time
      const incidents = await this.incidentRepository.find({
        where: {
          detectedAt: Between(periodStart, periodEnd),
          status: IncidentStatus.RESOLVED,
        },
      });

      const averageResponseTime = incidents.length > 0
        ? incidents.reduce((sum, inc) => {
            const responseTime = inc.endedAt && inc.startedAt 
              ? inc.endedAt.getTime() - inc.startedAt.getTime()
              : 0;
            return sum + responseTime;
          }, 0) / incidents.length / (1000 * 60) // Convert to minutes
        : 0;

      // System uptime (placeholder - would integrate with monitoring system)
      const systemUptime = 99.9;

      // Security score based on threat detection and incident response
      const securityScore = this.calculateSecurityScore(threatsDetected, incidentsResolved, totalEvents);

      // Compliance percentage (placeholder - would be calculated from actual requirements)
      const compliancePercentage = 85.5;

      // Risk level
      const riskLevel = this.calculateRiskLevelFromMetrics({
        totalEvents,
        threatsDetected,
        incidentsResolved,
        averageResponseTime,
        systemUptime,
        securityScore,
        compliancePercentage,
      } as ComplianceMetrics);

      return {
        totalEvents,
        threatsDetected,
        incidentsResolved,
        averageResponseTime,
        systemUptime,
        securityScore,
        compliancePercentage,
        riskLevel,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate compliance metrics: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Generate incident summary
   */
  private async generateIncidentSummary(
    periodStart: Date,
    periodEnd: Date
  ): Promise<any> {
    const incidents = await this.incidentRepository.find({
      where: {
        detectedAt: Between(periodStart, periodEnd),
      },
    });

    const incidentsByType = incidents.reduce((acc, inc) => {
      acc[inc.type] = (acc[inc.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const incidentsBySeverity = incidents.reduce((acc, inc) => {
      acc[inc.severity] = (acc[inc.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const resolvedIncidents = incidents.filter(inc => inc.status === IncidentStatus.RESOLVED);
    const averageResolutionTime = resolvedIncidents.length > 0
      ? resolvedIncidents.reduce((sum, inc) => {
          const resolutionTime = inc.endedAt && inc.startedAt
            ? inc.endedAt.getTime() - inc.startedAt.getTime()
            : 0;
          return sum + resolutionTime;
        }, 0) / resolvedIncidents.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    const criticalIncidents = incidents.filter(inc => inc.severity === IncidentSeverity.CRITICAL);

    return {
      totalIncidents: incidents.length,
      incidentsByType,
      incidentsBySeverity,
      averageResolutionTime,
      criticalIncidents: criticalIncidents.length,
      recurringIncidents: [], // Would implement logic to detect recurring incidents
    };
  }

  /**
   * Generate threat landscape analysis
   */
  private async generateThreatLandscapeAnalysis(
    periodStart: Date,
    periodEnd: Date
  ): Promise<any> {
    const threats = await this.threatRepository.find({
      where: {
        timestamp: Between(periodStart, periodEnd),
      },
    });

    const topThreats = Object.values(
      threats.reduce((acc, threat) => {
        const key = threat.type;
        if (!acc[key]) {
          acc[key] = {
            threatType: key,
            occurrences: 0,
            severity: threat.severity,
            trend: 'stable' as const,
          };
        }
        acc[key].occurrences++;
        return acc;
      }, {} as Record<string, any>)
    ).sort((a, b) => b.occurrences - a.occurrences).slice(0, 10);

    return {
      topThreats,
      emergingThreats: [], // Would implement logic to identify emerging threats
      blockedThreats: threats.filter(t => t.status === ThreatStatus.RESOLVED).length,
      detectedThreats: threats.length,
    };
  }

  /**
   * Assess security controls
   */
  private async assessSecurityControls(
    periodStart: Date,
    periodEnd: Date
  ): Promise<any> {
    // This would assess the effectiveness of various security controls
    return [
      {
        controlId: 'SC-1',
        controlName: 'Access Control',
        category: 'Technical',
        implementation: 'implemented',
        effectiveness: 'high',
        gaps: [],
        recommendations: [],
      },
      {
        controlId: 'SC-2',
        controlName: 'Encryption',
        category: 'Technical',
        implementation: 'implemented',
        effectiveness: 'medium',
        gaps: ['Key rotation process needs improvement'],
        recommendations: ['Implement automated key rotation'],
      },
      {
        controlId: 'SC-3',
        controlName: 'Monitoring',
        category: 'Operational',
        implementation: 'implemented',
        effectiveness: 'high',
        gaps: [],
        recommendations: [],
      },
    ];
  }

  /**
   * Generate SOC 2 findings and recommendations
   */
  private async generateSOC2Findings(
    assessment: ComplianceAssessment,
    metrics: ComplianceMetrics
  ): Promise<{ findings: any[]; recommendations: any[] }> {
    const findings = assessment.requirements
      .filter(req => req.status === 'non_compliant' || req.status === 'partial')
      .map(req => ({
        findingId: `SOC2-${req.controlId}`,
        category: req.category,
        severity: req.priority,
        description: `Non-compliance identified for ${req.controlId}: ${req.requirement}`,
        recommendation: req.recommendations[0] || 'Review and implement controls',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        assignedTo: 'Security Team',
        status: 'open',
      }));

    const recommendations = [
      {
        id: 'SOC2-REC-1',
        category: 'Security',
        priority: 'high',
        recommendation: 'Implement multi-factor authentication for all privileged accounts',
        justification: 'SOC 2 CC6.3 requires strong authentication mechanisms',
        estimatedEffort: 'Medium',
        assignedTo: 'Identity Management Team',
        dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        id: 'SOC2-REC-2',
        category: 'Monitoring',
        priority: 'medium',
        recommendation: 'Enhance logging and monitoring capabilities',
        justification: 'SOC 2 CC4.1 requires comprehensive monitoring',
        estimatedEffort: 'Low',
        assignedTo: 'Security Operations Team',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
    ];

    return { findings, recommendations };
  }

  /**
   * Generate risk assessment
   */
  private async generateRiskAssessment(
    periodStart: Date,
    periodEnd: Date
  ): Promise<any> {
    return [
      {
        riskId: 'RISK-001',
        riskCategory: 'Security',
        riskDescription: 'Insufficient access controls',
        likelihood: 'medium',
        impact: 'high',
        riskScore: 75,
        mitigationStrategy: 'Implement role-based access control',
        residualRisk: 25,
      },
      {
        riskId: 'RISK-002',
        riskCategory: 'Operational',
        riskDescription: 'Lack of automated monitoring',
        likelihood: 'low',
        impact: 'medium',
        riskScore: 45,
        mitigationStrategy: 'Deploy SIEM with automated alerts',
        residualRisk: 15,
      },
    ];
  }

  /**
   * Generate audit findings
   */
  private async generateAuditFindings(assessment: ComplianceAssessment): Promise<any[]> {
    return assessment.requirements
      .filter(req => req.status === 'non_compliant')
      .map(req => ({
        findingId: `AUDIT-${req.controlId}`,
        category: req.category,
        severity: req.priority,
        description: req.findings,
        recommendation: req.recommendations.join(', '),
        dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        assignedTo: 'Compliance Team',
        status: 'open',
      }));
  }

  // Helper methods
  private calculateOverallScore(requirements: ComplianceRequirement[]): number {
    if (requirements.length === 0) return 0;
    
    const scoreMapping = {
      'compliant': 100,
      'partial': 50,
      'non_compliant': 0,
      'not_applicable': 100,
    };

    const totalScore = requirements.reduce((sum, req) => sum + scoreMapping[req.status], 0);
    return totalScore / requirements.length;
  }

  private calculateRiskLevel(score: number, metrics: ComplianceMetrics): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 90 && metrics.riskLevel === 'low') return 'low';
    if (score >= 75 && metrics.riskLevel !== 'critical') return 'medium';
    if (score >= 60) return 'high';
    return 'critical';
  }

  private calculateRiskLevelFromMetrics(metrics: ComplianceMetrics): 'low' | 'medium' | 'high' | 'critical' {
    if (metrics.securityScore >= 90 && metrics.compliancePercentage >= 90) return 'low';
    if (metrics.securityScore >= 75 && metrics.compliancePercentage >= 75) return 'medium';
    if (metrics.securityScore >= 60 && metrics.compliancePercentage >= 60) return 'high';
    return 'critical';
  }

  private calculateSecurityScore(threatsDetected: number, incidentsResolved: number, totalEvents: number): number {
    const detectionRate = totalEvents > 0 ? (threatsDetected / totalEvents) * 100 : 0;
    const resolutionRate = threatsDetected > 0 ? (incidentsResolved / threatsDetected) * 100 : 0;
    return Math.min((detectionRate + resolutionRate) / 2, 100);
  }

  private generateRecommendations(requirements: ComplianceRequirement[]): string[] {
    return requirements
      .filter(req => req.status === 'non_compliant' || req.status === 'partial')
      .flatMap(req => req.recommendations)
      .slice(0, 10); // Limit to top 10 recommendations
  }

  private determinePriority(controlId: string, status: string): 'low' | 'medium' | 'high' | 'critical' {
    if (status === 'non_compliant') {
      const criticalControls = ['CC6.1', 'CC6.2', 'CC6.3', 'A.9.1', 'A.12.1'];
      return criticalControls.includes(controlId) ? 'critical' : 'high';
    }
    if (status === 'partial') return 'medium';
    return 'low';
  }

  private async collectEvidenceForRequirement(
    controlId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<string[]> {
    // This would collect specific evidence for each control
    return [
      `System logs for ${controlId}`,
      `Configuration snapshots`,
      `Access control reviews`,
      `Security monitoring reports`,
    ];
  }

  private evaluateComplianceStatus(controlId: string, evidence: string[]): 'compliant' | 'non_compliant' | 'partial' | 'not_applicable' {
    // This would implement specific evaluation logic for each control
    // For now, return a placeholder
    return Math.random() > 0.3 ? 'compliant' : 'partial';
  }

  private generateFindings(controlId: string, status: string, evidence: string[]): string {
    if (status === 'compliant') return 'Control is operating effectively';
    if (status === 'partial') return 'Control has minor gaps that need attention';
    return 'Control has significant gaps requiring immediate remediation';
  }

  private generateRequirementRecommendations(controlId: string, status: string): string[] {
    if (status === 'compliant') return ['Continue monitoring control effectiveness'];
    if (status === 'partial') return ['Address identified gaps', 'Enhance monitoring'];
    return ['Immediate remediation required', 'Implement compensating controls'];
  }

  /**
   * Schedule quarterly compliance reports
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduleComplianceReports(): Promise<void> {
    const today = new Date();
    const quarter = Math.floor(today.getMonth() / 3);
    
    // Check if it's the last day of the quarter
    const lastDayOfQuarter = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
    
    if (today.getDate() === lastDayOfQuarter.getDate()) {
      const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
      const quarterEnd = lastDayOfQuarter;
      
      try {
        await this.generateSOC2Report(quarterStart, quarterEnd);
        this.logger.log(`Quarterly SOC 2 report scheduled and generated for Q${quarter + 1}`);
      } catch (error) {
        this.logger.error(`Failed to generate quarterly SOC 2 report: ${error.message}`);
      }
    }
  }

  /**
   * Get compliance reports by framework
   */
  async getReportsByFramework(
    framework: ComplianceFramework,
    limit: number = 10
  ): Promise<ComplianceReport[]> {
    return this.complianceReportRepository.find({
      where: { framework },
      order: { generatedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get latest compliance report
   */
  async getLatestReport(framework?: ComplianceFramework): Promise<ComplianceReport | null> {
    const where = framework ? { framework } : {};
    return this.complianceReportRepository.findOne({
      where,
      order: { generatedAt: 'DESC' },
    });
  }
}
