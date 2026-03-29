import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Threat, ThreatType, ThreatSeverity, ThreatStatus } from '../entities/threat.entity';
import { Incident, IncidentType, IncidentSeverity, IncidentStatus, IncidentPriority } from '../entities/incident.entity';
import { Redis } from 'ioredis';

export interface ResponsePlaybook {
  id: string;
  name: string;
  description: string;
  threatTypes: ThreatType[];
  severity: ThreatSeverity[];
  conditions: ResponseCondition[];
  actions: ResponseAction[];
  escalationRules: EscalationRule[];
  enabled: boolean;
}

export interface ResponseCondition {
  field: keyof Threat;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'in';
  value: any;
}

export interface ResponseAction {
  id: string;
  name: string;
  type: 'block_ip' | 'freeze_account' | 'send_alert' | 'isolate_system' | 'collect_evidence' | 'notify_team';
  parameters: Record<string, any>;
  order: number;
  required: boolean;
  timeout: number; // seconds
}

export interface EscalationRule {
  condition: string;
  action: 'notify_manager' | 'escalate_to_ciso' | 'create_high_priority_ticket' | 'activate_incident_response';
  delay: number; // minutes
}

export interface IncidentResponse {
  incident: Incident;
  actions: ResponseAction[];
  executedActions: ExecutedAction[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
}

export interface ExecutedAction {
  action: ResponseAction;
  executedAt: Date;
  success: boolean;
  result: any;
  error?: string;
  duration: number;
}

@Injectable()
export class IncidentResponseService {
  private readonly logger = new Logger(IncidentResponseService.name);
  private redis: Redis;
  private responsePlaybooks: ResponsePlaybook[] = [];

  constructor(
    @InjectRepository(Threat)
    private readonly threatRepository: Repository<Threat>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializePlaybooks();
  }

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    });

    // Subscribe to threat events
    this.eventEmitter.on('threat.detected', (data: any) => {
      this.handleThreatDetected(data.threat, data.confidence, data.matchedLogs);
    });

    this.logger.log('Incident response service initialized');
  }

  /**
   * Handle detected threat and initiate incident response
   */
  async handleThreatDetected(threat: Threat, confidence: number, matchedLogs: any[]): Promise<void> {
    try {
      // Find applicable playbook
      const playbook = this.findApplicablePlaybook(threat);
      
      if (!playbook) {
        this.logger.warn(`No playbook found for threat type: ${threat.type}`);
        return;
      }

      // Create incident
      const incident = await this.createIncident(threat, playbook);
      
      // Execute response actions
      await this.executeResponsePlaybook(incident, playbook, threat);
      
      this.logger.log(`Incident ${incident.id} created and response initiated`);
    } catch (error) {
      this.logger.error(`Failed to handle threat detection: ${error.message}`, error);
    }
  }

  /**
   * Create incident from threat
   */
  private async createIncident(threat: Threat, playbook: ResponsePlaybook): Promise<Incident> {
    const ticketNumber = await this.generateTicketNumber();
    
    const incident = this.incidentRepository.create({
      ticketNumber,
      type: this.mapThreatTypeToIncidentType(threat.type),
      severity: this.mapThreatSeverityToIncidentSeverity(threat.severity),
      priority: this.calculatePriority(threat),
      status: IncidentStatus.NEW,
      title: `${playbook.name} - ${threat.title}`,
      description: threat.description,
      detectedAt: new Date(),
      startedAt: new Date(),
      threatIds: [threat.id],
      affectedSystems: this.identifyAffectedSystems(threat),
      businessImpact: this.assessBusinessImpact(threat),
    });

    return await this.incidentRepository.save(incident);
  }

  /**
   * Execute response playbook
   */
  private async executeResponsePlaybook(
    incident: Incident,
    playbook: ResponsePlaybook,
    threat: Threat
  ): Promise<IncidentResponse> {
    const response: IncidentResponse = {
      incident,
      actions: playbook.actions,
      executedActions: [],
      status: 'in_progress',
      startTime: new Date(),
    };

    try {
      // Update incident status
      incident.status = IncidentStatus.IN_PROGRESS;
      await this.incidentRepository.save(incident);

      // Execute actions in order
      for (const action of playbook.actions.sort((a, b) => a.order - b.order)) {
        const executedAction = await this.executeAction(action, threat, incident);
        response.executedActions.push(executedAction);

        // Check if action failed and is required
        if (!executedAction.success && action.required) {
          response.status = 'failed';
          break;
        }
      }

      // Update incident with response actions
      incident.responseActions = response.executedActions.map(ea => ({
        action: ea.action.name,
        description: ea.action.name,
        executedBy: 'system',
        executedAt: ea.executedAt,
        success: ea.success,
        notes: ea.error || `Action completed successfully`,
      }));

      if (response.status === 'in_progress') {
        response.status = 'completed';
        incident.status = IncidentStatus.RESOLVED;
      }

      response.endTime = new Date();
      incident.endedAt = response.endTime;

      await this.incidentRepository.save(incident);

      // Set up escalation if needed
      await this.setupEscalation(incident, playbook, threat);

      this.logger.log(`Response playbook executed for incident ${incident.id}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to execute response playbook: ${error.message}`, error);
      response.status = 'failed';
      response.endTime = new Date();
      return response;
    }
  }

  /**
   * Execute individual response action
   */
  private async executeAction(
    action: ResponseAction,
    threat: Threat,
    incident: Incident
  ): Promise<ExecutedAction> {
    const startTime = Date.now();
    const executedAction: ExecutedAction = {
      action,
      executedAt: new Date(),
      success: false,
      result: null,
      duration: 0,
    };

    try {
      this.logger.log(`Executing action: ${action.name}`);

      switch (action.type) {
        case 'block_ip':
          executedAction.result = await this.blockIP(threat.sourceIp, action.parameters);
          break;
        case 'freeze_account':
          executedAction.result = await this.freezeAccount(threat.targetUser, action.parameters);
          break;
        case 'send_alert':
          executedAction.result = await this.sendAlert(incident, threat, action.parameters);
          break;
        case 'isolate_system':
          executedAction.result = await this.isolateSystem(threat.targetResource, action.parameters);
          break;
        case 'collect_evidence':
          executedAction.result = await this.collectEvidence(threat, action.parameters);
          break;
        case 'notify_team':
          executedAction.result = await this.notifyTeam(incident, threat, action.parameters);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      executedAction.success = true;
      this.logger.log(`Action ${action.name} completed successfully`);
    } catch (error) {
      executedAction.success = false;
      executedAction.error = error.message;
      this.logger.error(`Action ${action.name} failed: ${error.message}`);
    } finally {
      executedAction.duration = Date.now() - startTime;
    }

    return executedAction;
  }

  /**
   * Block IP address
   */
  private async blockIP(ipAddress: string, parameters: Record<string, any>): Promise<any> {
    if (!ipAddress) {
      throw new Error('No IP address to block');
    }

    const duration = parameters.duration || 3600; // 1 hour default
    const reason = parameters.reason || 'Security threat detected';

    // Add to firewall blocklist
    await this.addToFirewallBlocklist(ipAddress, duration, reason);

    // Cache in Redis for quick lookup
    const key = `blocked_ip:${ipAddress}`;
    await this.redis.setex(key, duration, JSON.stringify({
      blockedAt: new Date(),
      reason,
      duration,
    }));

    // Log the action
    this.logger.log(`IP ${ipAddress} blocked for ${duration} seconds: ${reason}`);

    return {
      ipAddress,
      blockedAt: new Date(),
      duration,
      reason,
    };
  }

  /**
   * Freeze user account
   */
  private async freezeAccount(userId: string, parameters: Record<string, any>): Promise<any> {
    if (!userId) {
      throw new Error('No user ID to freeze');
    }

    const reason = parameters.reason || 'Security threat detected';
    const duration = parameters.duration || 86400; // 24 hours default

    // Update user status in database
    // This would integrate with your user management system
    await this.updateUserStatus(userId, 'frozen', reason, duration);

    // Cache in Redis
    const key = `frozen_user:${userId}`;
    await this.redis.setex(key, duration, JSON.stringify({
      frozenAt: new Date(),
      reason,
      duration,
    }));

    this.logger.log(`User ${userId} frozen: ${reason}`);

    return {
      userId,
      frozenAt: new Date(),
      reason,
      duration,
    };
  }

  /**
   * Send security alert
   */
  private async sendAlert(
    incident: Incident,
    threat: Threat,
    parameters: Record<string, any>
  ): Promise<any> {
    const channels = parameters.channels || ['email', 'slack'];
    const recipients = parameters.recipients || this.getDefaultAlertRecipients(threat.severity);

    const alertData = {
      incidentId: incident.id,
      threatId: threat.id,
      severity: threat.severity,
      title: `Security Alert: ${threat.title}`,
      message: threat.description,
      timestamp: new Date(),
      urgency: this.mapSeverityToUrgency(threat.severity),
    };

    const results = [];

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'email':
            await this.sendEmailAlert(recipients, alertData);
            break;
          case 'slack':
            await this.sendSlackAlert(alertData);
            break;
          case 'pagerduty':
            await this.sendPagerDutyAlert(alertData);
            break;
          case 'sms':
            await this.sendSMSAlert(recipients, alertData);
            break;
        }
        results.push({ channel, success: true });
      } catch (error) {
        results.push({ channel, success: false, error: error.message });
      }
    }

    return { channels: results, alertData };
  }

  /**
   * Isolate compromised system
   */
  private async isolateSystem(systemId: string, parameters: Record<string, any>): Promise<any> {
    if (!systemId) {
      throw new Error('No system ID to isolate');
    }

    const isolationType = parameters.type || 'network';
    const reason = parameters.reason || 'Potential security compromise';

    // Implement system isolation logic
    // This would integrate with your infrastructure management system
    await this.executeSystemIsolation(systemId, isolationType, reason);

    this.logger.log(`System ${systemId} isolated (${isolationType}): ${reason}`);

    return {
      systemId,
      isolatedAt: new Date(),
      isolationType,
      reason,
    };
  }

  /**
   * Collect forensic evidence
   */
  private async collectEvidence(threat: Threat, parameters: Record<string, any>): Promise<any> {
    const evidenceTypes = parameters.types || ['logs', 'memory', 'network'];
    const collectedEvidence = [];

    for (const type of evidenceTypes) {
      try {
        const evidence = await this.collectEvidenceByType(threat, type);
        collectedEvidence.push(evidence);
      } catch (error) {
        this.logger.error(`Failed to collect ${type} evidence: ${error.message}`);
      }
    }

    return {
      threatId: threat.id,
      collectedAt: new Date(),
      evidenceTypes,
      collectedEvidence,
    };
  }

  /**
   * Notify incident response team
   */
  private async notifyTeam(
    incident: Incident,
    threat: Threat,
    parameters: Record<string, any>
  ): Promise<any> {
    const teamMembers = parameters.teamMembers || this.getDefaultTeamMembers(threat.severity);
    const message = parameters.message || this.generateTeamNotification(incident, threat);

    const notifications = [];

    for (const member of teamMembers) {
      try {
        await this.sendTeamNotification(member, {
          incidentId: incident.id,
          threatId: threat.id,
          severity: threat.severity,
          message,
          timestamp: new Date(),
        });
        notifications.push({ member, success: true });
      } catch (error) {
        notifications.push({ member, success: false, error: error.message });
      }
    }

    return { notifications, message };
  }

  /**
   * Set up escalation rules
   */
  private async setupEscalation(
    incident: Incident,
    playbook: ResponsePlaybook,
    threat: Threat
  ): Promise<void> {
    for (const rule of playbook.escalationRules) {
      setTimeout(async () => {
        try {
          const shouldEscalate = await this.evaluateEscalationCondition(rule.condition, incident, threat);
          
          if (shouldEscalate) {
            await this.executeEscalation(rule.action, incident, threat);
          }
        } catch (error) {
          this.logger.error(`Escalation failed: ${error.message}`);
        }
      }, rule.delay * 60 * 1000); // Convert minutes to milliseconds
    }
  }

  /**
   * Find applicable playbook for threat
   */
  private findApplicablePlaybook(threat: Threat): ResponsePlaybook | null {
    return this.responsePlaybooks.find(playbook => 
      playbook.enabled &&
      playbook.threatTypes.includes(threat.type) &&
      playbook.severity.includes(threat.severity)
    ) || null;
  }

  /**
   * Initialize response playbooks
   */
  private initializePlaybooks(): void {
    this.responsePlaybooks = [
      {
        id: 'brute-force-response',
        name: 'Brute Force Attack Response',
        description: 'Automated response to brute force login attacks',
        threatTypes: [ThreatType.BRUTE_FORCE],
        severity: [ThreatSeverity.HIGH, ThreatSeverity.CRITICAL],
        conditions: [],
        actions: [
          {
            id: 'block-source-ip',
            name: 'Block Source IP',
            type: 'block_ip',
            parameters: { duration: 3600, reason: 'Brute force attack detected' },
            order: 1,
            required: true,
            timeout: 30,
          },
          {
            id: 'send-security-alert',
            name: 'Send Security Alert',
            type: 'send_alert',
            parameters: { 
              channels: ['email', 'slack'],
              urgency: 'high'
            },
            order: 2,
            required: true,
            timeout: 60,
          },
          {
            id: 'notify-incident-response',
            name: 'Notify Incident Response Team',
            type: 'notify_team',
            parameters: { 
              teamMembers: ['security-team@company.com'],
              message: 'Brute force attack detected and IP blocked'
            },
            order: 3,
            required: false,
            timeout: 30,
          },
        ],
        escalationRules: [
          {
            condition: 'incident.status == "in_progress" AND duration > 30',
            action: 'escalate_to_ciso',
            delay: 30,
          },
        ],
        enabled: true,
      },
      {
        id: 'sql-injection-response',
        name: 'SQL Injection Attack Response',
        description: 'Automated response to SQL injection attempts',
        threatTypes: [ThreatType.SQL_INJECTION],
        severity: [ThreatSeverity.CRITICAL],
        conditions: [],
        actions: [
          {
            id: 'block-attacker-ip',
            name: 'Block Attacker IP',
            type: 'block_ip',
            parameters: { duration: 86400, reason: 'SQL injection attempt' },
            order: 1,
            required: true,
            timeout: 30,
          },
          {
            id: 'isolate-web-server',
            name: 'Isolate Web Server',
            type: 'isolate_system',
            parameters: { type: 'network', reason: 'SQL injection attack' },
            order: 2,
            required: true,
            timeout: 60,
          },
          {
            id: 'collect-forensic-evidence',
            name: 'Collect Forensic Evidence',
            type: 'collect_evidence',
            parameters: { types: ['logs', 'memory', 'network'] },
            order: 3,
            required: true,
            timeout: 300,
          },
          {
            id: 'send-critical-alert',
            name: 'Send Critical Alert',
            type: 'send_alert',
            parameters: { 
              channels: ['email', 'slack', 'pagerduty'],
              urgency: 'critical'
            },
            order: 4,
            required: true,
            timeout: 30,
          },
          {
            id: 'notify-ciso',
            name: 'Notify CISO',
            type: 'notify_team',
            parameters: { 
              teamMembers: ['ciso@company.com'],
              message: 'CRITICAL: SQL injection attack detected and systems isolated'
            },
            order: 5,
            required: true,
            timeout: 30,
          },
        ],
        escalationRules: [
          {
            condition: 'incident.severity == "critical" AND duration > 15',
            action: 'activate_incident_response',
            delay: 15,
          },
        ],
        enabled: true,
      },
      {
        id: 'ddos-response',
        name: 'DDoS Attack Response',
        description: 'Automated response to DDoS attacks',
        threatTypes: [ThreatType.DDoS],
        severity: [ThreatSeverity.HIGH, ThreatSeverity.CRITICAL],
        conditions: [],
        actions: [
          {
            id: 'activate-ddos-mitigation',
            name: 'Activate DDoS Mitigation',
            type: 'isolate_system',
            parameters: { type: 'ddos-protection', reason: 'DDoS attack detected' },
            order: 1,
            required: true,
            timeout: 60,
          },
          {
            id: 'send-ddos-alert',
            name: 'Send DDoS Alert',
            type: 'send_alert',
            parameters: { 
              channels: ['email', 'slack', 'pagerduty'],
              urgency: 'critical'
            },
            order: 2,
            required: true,
            timeout: 30,
          },
          {
            id: 'notify-network-team',
            name: 'Notify Network Team',
            type: 'notify_team',
            parameters: { 
              teamMembers: ['network-team@company.com'],
              message: 'DDoS attack detected - mitigation activated'
            },
            order: 3,
            required: true,
            timeout: 30,
          },
        ],
        escalationRules: [
          {
            condition: 'incident.duration > 60',
            action: 'escalate_to_ciso',
            delay: 60,
          },
        ],
        enabled: true,
      },
    ];
  }

  // Helper methods (implementations would depend on your specific infrastructure)
  private async generateTicketNumber(): Promise<string> {
    const prefix = 'INC';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
  }

  private mapThreatTypeToIncidentType(threatType: ThreatType): IncidentType {
    const mapping = {
      [ThreatType.BRUTE_FORCE]: IncidentType.UNAUTHORIZED_ACCESS,
      [ThreatType.SQL_INJECTION]: IncidentType.SECURITY_BREACH,
      [ThreatType.DDoS]: IncidentType.NETWORK_INTRUSION,
      [ThreatType.MALWARE]: IncidentType.MALWARE_OUTBREAK,
      [ThreatType.INSIDER_THREAT]: IncidentType.INSIDER_THREAT,
      [ThreatType.PHISHING]: IncidentType.PHISHING_CAMPAIGN,
      [ThreatType.UNAUTHORIZED_ACCESS]: IncidentType.UNAUTHORIZED_ACCESS,
      [ThreatType.DATA_EXFILTRATION]: IncidentType.DATA_BREACH,
      [ThreatType.PRIVILEGE_ESCALATION]: IncidentType.SYSTEM_COMPROMISE,
      [ThreatType.ANOMALOUS_BEHAVIOR]: IncidentType.SECURITY_BREACH,
    };
    return mapping[threatType] || IncidentType.SECURITY_BREACH;
  }

  private mapThreatSeverityToIncidentSeverity(threatSeverity: ThreatSeverity): IncidentSeverity {
    const mapping = {
      [ThreatSeverity.LOW]: IncidentSeverity.LOW,
      [ThreatSeverity.MEDIUM]: IncidentSeverity.MEDIUM,
      [ThreatSeverity.HIGH]: IncidentSeverity.HIGH,
      [ThreatSeverity.CRITICAL]: IncidentSeverity.CRITICAL,
    };
    return mapping[threatSeverity] || IncidentSeverity.MEDIUM;
  }

  private calculatePriority(threat: Threat): IncidentPriority {
    if (threat.severity === ThreatSeverity.CRITICAL) return IncidentPriority.P1;
    if (threat.severity === ThreatSeverity.HIGH) return IncidentPriority.P2;
    if (threat.severity === ThreatSeverity.MEDIUM) return IncidentPriority.P3;
    return IncidentPriority.P4;
  }

  private identifyAffectedSystems(threat: Threat): any[] {
    // Implement logic to identify affected systems based on threat details
    return [];
  }

  private assessBusinessImpact(threat: Threat): any {
    // Implement business impact assessment
    return {
      financialImpact: 0,
      operationalImpact: 'medium',
      reputationalImpact: 'low',
      complianceImpact: 'medium',
    };
  }

  private mapSeverityToUrgency(severity: ThreatSeverity): string {
    const mapping = {
      [ThreatSeverity.LOW]: 'low',
      [ThreatSeverity.MEDIUM]: 'medium',
      [ThreatSeverity.HIGH]: 'high',
      [ThreatSeverity.CRITICAL]: 'critical',
    };
    return mapping[severity] || 'medium';
  }

  private getDefaultAlertRecipients(severity: ThreatSeverity): string[] {
    const recipients = {
      [ThreatSeverity.LOW]: ['security-team@company.com'],
      [ThreatSeverity.MEDIUM]: ['security-team@company.com', 'security-manager@company.com'],
      [ThreatSeverity.HIGH]: ['security-team@company.com', 'security-manager@company.com', 'ciso@company.com'],
      [ThreatSeverity.CRITICAL]: ['security-team@company.com', 'security-manager@company.com', 'ciso@company.com', 'executive-team@company.com'],
    };
    return recipients[severity] || recipients[ThreatSeverity.MEDIUM];
  }

  private getDefaultTeamMembers(severity: ThreatSeverity): string[] {
    return this.getDefaultAlertRecipients(severity);
  }

  private generateTeamNotification(incident: Incident, threat: Threat): string {
    return `Incident ${incident.ticketNumber}: ${threat.title} - Severity: ${threat.severity}`;
  }

  // Placeholder implementations for infrastructure integrations
  private async addToFirewallBlocklist(ip: string, duration: number, reason: string): Promise<void> {
    // Implement firewall integration
  }

  private async updateUserStatus(userId: string, status: string, reason: string, duration: number): Promise<void> {
    // Implement user management integration
  }

  private async sendEmailAlert(recipients: string[], data: any): Promise<void> {
    // Implement email integration
  }

  private async sendSlackAlert(data: any): Promise<void> {
    // Implement Slack integration
  }

  private async sendPagerDutyAlert(data: any): Promise<void> {
    // Implement PagerDuty integration
  }

  private async sendSMSAlert(recipients: string[], data: any): Promise<void> {
    // Implement SMS integration
  }

  private async executeSystemIsolation(systemId: string, type: string, reason: string): Promise<void> {
    // Implement system isolation
  }

  private async collectEvidenceByType(threat: Threat, type: string): Promise<any> {
    // Implement evidence collection
    return { type, collected: true };
  }

  private async sendTeamNotification(member: string, data: any): Promise<void> {
    // Implement team notification
  }

  private async evaluateEscalationCondition(condition: string, incident: Incident, threat: Threat): Promise<boolean> {
    // Implement condition evaluation
    return false;
  }

  private async executeEscalation(action: string, incident: Incident, threat: Threat): Promise<void> {
    // Implement escalation execution
  }
}
