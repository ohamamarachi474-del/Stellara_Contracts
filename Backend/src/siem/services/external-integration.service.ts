import { Injectable, Logger } from '@nestjs/common';
import { AxiosResponse } from 'axios';
import { Incident, IncidentSeverity } from '../entities/incident.entity';
import { Threat, ThreatSeverity } from '../entities/threat.entity';
import { ComplianceReport } from '../entities/compliance-report.entity';

export interface PagerDutyIncident {
  type: string;
  title: string;
  service: {
    id: string;
    type: string;
  };
  urgency: string;
  incident_key: string;
  body: {
    type: string;
    details: any;
  };
}

export interface SlackMessage {
  channel?: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
}

export interface SplunkEvent {
  time: number;
  host: string;
  source: string;
  sourcetype: string;
  index: string;
  event: any;
}

export interface ExternalIntegration {
  id: string;
  name: string;
  type: 'pagerduty' | 'slack' | 'splunk';
  enabled: boolean;
  config: Record<string, any>;
  lastSync?: Date;
  status: 'active' | 'inactive' | 'error';
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  response?: any;
}

@Injectable()
export class ExternalIntegrationService {
  private readonly logger = new Logger(ExternalIntegrationService.name);
  private integrations: Map<string, ExternalIntegration> = new Map();

  constructor() {
    this.initializeIntegrations();
  }

  /**
   * Send incident to PagerDuty
   */
  async sendToPagerDuty(incident: Incident, threat?: Threat): Promise<NotificationResult> {
    try {
      const integration = this.getIntegration('pagerduty');
      if (!integration || !integration.enabled) {
        return { success: false, error: 'PagerDuty integration not configured' };
      }

      const pagerDutyIncident = this.buildPagerDutyIncident(incident, threat);
      const response = await this.callPagerDutyAPI(integration.config, pagerDutyIncident);

      this.logger.log(`PagerDuty incident created: ${response.data?.incident_key}`);
      return {
        success: true,
        messageId: response.data?.incident_key,
        response: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to send to PagerDuty: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send alert to Slack
   */
  async sendToSlack(
    incident: Incident, 
    threat?: Threat, 
    customMessage?: string
  ): Promise<NotificationResult> {
    try {
      const integration = this.getIntegration('slack');
      if (!integration || !integration.enabled) {
        return { success: false, error: 'Slack integration not configured' };
      }

      const slackMessage = this.buildSlackMessage(incident, threat, customMessage);
      const response = await this.callSlackAPI(integration.config, slackMessage);

      this.logger.log(`Slack message sent: ${response.data?.ts}`);
      return {
        success: true,
        messageId: response.data?.ts,
        response: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to send to Slack: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send data to Splunk
   */
  async sendToSplunk(
    eventType: 'incident' | 'threat' | 'log' | 'compliance',
    data: any
  ): Promise<NotificationResult> {
    try {
      const integration = this.getIntegration('splunk');
      if (!integration || !integration.enabled) {
        return { success: false, error: 'Splunk integration not configured' };
      }

      const splunkEvent = this.buildSplunkEvent(eventType, data);
      const response = await this.callSplunkAPI(integration.config, splunkEvent);

      this.logger.log(`Splunk event sent: ${response.data?.text}`);
      return {
        success: true,
        response: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to send to Splunk: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send compliance report to external systems
   */
  async sendComplianceReport(report: ComplianceReport): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    try {
      // Send to Slack
      const slackResult = await this.sendComplianceReportToSlack(report);
      results.push(slackResult);

      // Send to Splunk
      const splunkResult = await this.sendToSplunk('compliance', report);
      results.push(splunkResult);

      // Send to PagerDuty if critical findings
      if (report.riskLevel === 'critical') {
        const pagerDutyResult = await this.sendComplianceReportToPagerDuty(report);
        results.push(pagerDutyResult);
      }

      return results;
    } catch (error) {
      this.logger.error(`Failed to send compliance report: ${error.message}`, error);
      return results;
    }
  }

  /**
   * Build PagerDuty incident
   */
  private buildPagerDutyIncident(incident: Incident, threat?: Threat): PagerDutyIncident {
    const urgency = this.mapSeverityToPagerDutyUrgency(incident.severity);
    const details = {
      incidentId: incident.id,
      ticketNumber: incident.ticketNumber,
      type: incident.type,
      severity: incident.severity,
      priority: incident.priority,
      description: incident.description,
      detectedAt: incident.detectedAt,
      assignedTo: incident.assignedTo,
      threat: threat ? {
        id: threat.id,
        type: threat.type,
        severity: threat.severity,
        threatScore: threat.threatScore,
        sourceIp: threat.sourceIp,
      } : null,
      affectedSystems: incident.affectedSystems,
      businessImpact: incident.businessImpact,
    };

    return {
      type: 'incident',
      title: `[${incident.severity.toUpperCase()}] ${incident.title}`,
      service: {
        id: process.env.PAGERDUTY_SERVICE_ID || 'default',
        type: 'service_reference',
      },
      urgency,
      incident_key: incident.id,
      body: {
        type: 'incident_body',
        details,
      },
    };
  }

  /**
   * Build Slack message
   */
  private buildSlackMessage(
    incident: Incident, 
    threat?: Threat, 
    customMessage?: string
  ): SlackMessage {
    const color = this.mapSeverityToSlackColor(incident.severity);
    const emoji = this.mapSeverityToEmoji(incident.severity);

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Security Incident Alert`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Ticket Number:*\n${incident.ticketNumber}`,
          },
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${incident.severity.toUpperCase()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Priority:*\n${incident.priority.toUpperCase()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${incident.status.replace('_', ' ').toUpperCase()}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Description:*\n${incident.description}`,
        },
      },
    ];

    // Add threat information if available
    if (threat) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Threat Type:*\n${threat.type.replace('_', ' ').toUpperCase()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Threat Score:*\n${threat.threatScore}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Source IP:*\n${threat.sourceIp || 'Unknown'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Target User:*\n${threat.targetUser || 'Unknown'}`,
          },
        ],
      });
    }

    // Add custom message if provided
    if (customMessage) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Note:*\n${customMessage}`,
        },
      });
    }

    // Add action buttons
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Details',
          },
          url: `${process.env.WEBAPP_URL}/incidents/${incident.id}`,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Assign to Me',
          },
          url: `${process.env.WEBAPP_URL}/incidents/${incident.id}/assign`,
        },
      ],
    });

    return {
      channel: process.env.SLACK_CHANNEL || '#security-alerts',
      blocks,
    };
  }

  /**
   * Build Splunk event
   */
  private buildSplunkEvent(eventType: string, data: any): SplunkEvent {
    const timestamp = Math.floor(Date.now() / 1000);
    
    let eventData: any = {
      eventType,
      timestamp: new Date().toISOString(),
      source: 'stellara-siem',
    };

    switch (eventType) {
      case 'incident':
        eventData = {
          ...eventData,
          incidentId: data.id,
          ticketNumber: data.ticketNumber,
          type: data.type,
          severity: data.severity,
          priority: data.priority,
          status: data.status,
          description: data.description,
          detectedAt: data.detectedAt,
          threatIds: data.threatIds,
          assignedTo: data.assignedTo,
          affectedSystems: data.affectedSystems,
          businessImpact: data.businessImpact,
        };
        break;
      
      case 'threat':
        eventData = {
          ...eventData,
          threatId: data.id,
          type: data.type,
          severity: data.severity,
          status: data.status,
          title: data.title,
          description: data.description,
          threatScore: data.threatScore,
          confidence: data.confidence,
          sourceIp: data.sourceIp,
          targetUser: data.targetUser,
          targetResource: data.targetResource,
          detectionData: data.detectionData,
          relatedLogIds: data.relatedLogIds,
        };
        break;
      
      case 'compliance':
        eventData = {
          ...eventData,
          reportId: data.id,
          title: data.title,
          framework: data.framework,
          reportType: data.reportType,
          status: data.status,
          complianceScore: data.complianceScore,
          riskLevel: data.riskLevel,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          generatedAt: data.generatedAt,
        };
        break;
      
      default:
        eventData = { ...eventData, ...data };
    }

    return {
      time: timestamp,
      host: process.env.HOSTNAME || 'stellara-backend',
      source: 'siem',
      sourcetype: 'json',
      index: process.env.SPLUNK_INDEX || 'security',
      event: eventData,
    };
  }

  /**
   * Call PagerDuty API
   */
  private async callPagerDutyAPI(
    config: any, 
    incident: PagerDutyIncident
  ): Promise<AxiosResponse> {
    const axios = require('axios');
    
    const response = await axios.post(
      `${config.apiUrl}/incidents`,
      incident,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token token=${config.apiToken}`,
          'Accept': 'application/vnd.pagerduty+json;version=2',
        },
      }
    );

    return response;
  }

  /**
   * Call Slack API
   */
  private async callSlackAPI(config: any, message: SlackMessage): Promise<AxiosResponse> {
    const axios = require('axios');
    
    const response = await axios.post(
      config.webhookUrl,
      message,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response;
  }

  /**
   * Call Splunk API
   */
  private async callSplunkAPI(config: any, event: SplunkEvent): Promise<AxiosResponse> {
    const axios = require('axios');
    
    const response = await axios.post(
      `${config.apiUrl}/services/collector/event`,
      event,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Splunk ${config.token}`,
        },
      }
    );

    return response;
  }

  /**
   * Send compliance report to Slack
   */
  private async sendComplianceReportToSlack(report: ComplianceReport): Promise<NotificationResult> {
    try {
      const integration = this.getIntegration('slack');
      if (!integration || !integration.enabled) {
        return { success: false, error: 'Slack integration not configured' };
      }

      const color = this.mapRiskLevelToSlackColor(report.riskLevel);
      const message = {
        channel: process.env.SLACK_COMPLIANCE_CHANNEL || '#compliance',
        attachments: [
          {
            color,
            title: `Compliance Report: ${report.title}`,
            fields: [
              {
                title: 'Framework',
                value: report.framework.toUpperCase(),
                short: true,
              },
              {
                title: 'Risk Level',
                value: report.riskLevel?.toUpperCase() || 'UNKNOWN',
                short: true,
              },
              {
                title: 'Compliance Score',
                value: `${report.complianceScore || 0}%`,
                short: true,
              },
              {
                title: 'Period',
                value: `${report.periodStart.toISOString().split('T')[0]} - ${report.periodEnd.toISOString().split('T')[0]}`,
                short: true,
              },
            ],
            text: report.summary,
            footer: 'Stellara SIEM',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      const response = await this.callSlackAPI(integration.config, message);
      return {
        success: true,
        messageId: response.data?.ts,
        response: response.data,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send compliance report to PagerDuty
   */
  private async sendComplianceReportToPagerDuty(report: ComplianceReport): Promise<NotificationResult> {
    try {
      const integration = this.getIntegration('pagerduty');
      if (!integration || !integration.enabled) {
        return { success: false, error: 'PagerDuty integration not configured' };
      }

      const incident: PagerDutyIncident = {
        type: 'incident',
        title: `CRITICAL Compliance Issue: ${report.title}`,
        service: {
          id: process.env.PAGERDUTY_COMPLIANCE_SERVICE_ID || 'compliance',
          type: 'service_reference',
        },
        urgency: 'high',
        incident_key: `compliance-${report.id}`,
        body: {
          type: 'incident_body',
          details: {
            reportId: report.id,
            framework: report.framework,
            riskLevel: report.riskLevel,
            complianceScore: report.complianceScore,
            summary: report.summary,
            generatedAt: report.generatedAt,
          },
        },
      };

      const response = await this.callPagerDutyAPI(integration.config, incident);
      return {
        success: true,
        messageId: response.data?.incident_key,
        response: response.data,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get integration by type
   */
  private getIntegration(type: string): ExternalIntegration | undefined {
    return this.integrations.get(type);
  }

  /**
   * Map severity to PagerDuty urgency
   */
  private mapSeverityToPagerDutyUrgency(severity: IncidentSeverity): string {
    const mapping = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'critical': 'high',
    };
    return mapping[severity] || 'medium';
  }

  /**
   * Map severity to Slack color
   */
  private mapSeverityToSlackColor(severity: IncidentSeverity): string {
    const mapping = {
      'low': '#36a64f', // green
      'medium': '#ff9500', // orange
      'high': '#ff6b6b', // red
      'critical': '#ff0000', // bright red
    };
    return mapping[severity] || '#808080'; // gray
  }

  /**
   * Map risk level to Slack color
   */
  private mapRiskLevelToSlackColor(riskLevel?: string): string {
    const mapping = {
      'low': '#36a64f', // green
      'medium': '#ff9500', // orange
      'high': '#ff6b6b', // red
      'critical': '#ff0000', // bright red
    };
    return mapping[riskLevel || 'unknown'] || '#808080'; // gray
  }

  /**
   * Map severity to emoji
   */
  private mapSeverityToEmoji(severity: IncidentSeverity): string {
    const mapping = {
      'low': '🟢',
      'medium': '🟡',
      'high': '🟠',
      'critical': '🔴',
    };
    return mapping[severity] || '⚪';
  }

  /**
   * Initialize integrations from environment variables
   */
  private initializeIntegrations(): void {
    // PagerDuty integration
    if (process.env.PAGERDUTY_ENABLED === 'true') {
      this.integrations.set('pagerduty', {
        id: 'pagerduty-1',
        name: 'PagerDuty',
        type: 'pagerduty',
        enabled: true,
        config: {
          apiUrl: process.env.PAGERDUTY_API_URL || 'https://api.pagerduty.com',
          apiToken: process.env.PAGERDUTY_API_TOKEN,
          serviceId: process.env.PAGERDUTY_SERVICE_ID,
        },
        status: 'active',
      });
    }

    // Slack integration
    if (process.env.SLACK_ENABLED === 'true') {
      this.integrations.set('slack', {
        id: 'slack-1',
        name: 'Slack',
        type: 'slack',
        enabled: true,
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL,
          botToken: process.env.SLACK_BOT_TOKEN,
        },
        status: 'active',
      });
    }

    // Splunk integration
    if (process.env.SPLUNK_ENABLED === 'true') {
      this.integrations.set('splunk', {
        id: 'splunk-1',
        name: 'Splunk',
        type: 'splunk',
        enabled: true,
        config: {
          apiUrl: process.env.SPLUNK_API_URL,
          token: process.env.SPLUNK_TOKEN,
          index: process.env.SPLUNK_INDEX,
        },
        status: 'active',
      });
    }

    this.logger.log(`Initialized ${this.integrations.size} external integrations`);
  }

  /**
   * Test all integrations
   */
  async testIntegrations(): Promise<Record<string, NotificationResult>> {
    const results: Record<string, NotificationResult> = {};

    for (const [type, integration] of this.integrations) {
      try {
        switch (type) {
          case 'pagerduty':
            results[type] = await this.testPagerDutyIntegration(integration);
            break;
          case 'slack':
            results[type] = await this.testSlackIntegration(integration);
            break;
          case 'splunk':
            results[type] = await this.testSplunkIntegration(integration);
            break;
          default:
            results[type] = { success: false, error: 'Unknown integration type' };
        }
      } catch (error) {
        results[type] = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Test PagerDuty integration
   */
  private async testPagerDutyIntegration(integration: ExternalIntegration): Promise<NotificationResult> {
    try {
      const testIncident: PagerDutyIncident = {
        type: 'incident',
        title: 'Test Incident from Stellara SIEM',
        service: {
          id: integration.config.serviceId,
          type: 'service_reference',
        },
        urgency: 'low',
        incident_key: `test-${Date.now()}`,
        body: {
          type: 'incident_body',
          details: { test: true, timestamp: new Date().toISOString() },
        },
      };

      const response = await this.callPagerDutyAPI(integration.config, testIncident);
      return { success: true, response: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Slack integration
   */
  private async testSlackIntegration(integration: ExternalIntegration): Promise<NotificationResult> {
    try {
      const testMessage: SlackMessage = {
        channel: integration.config.channel,
        text: '🧪 Test message from Stellara SIEM - Integration test successful!',
      };

      const response = await this.callSlackAPI(integration.config, testMessage);
      return { success: true, response: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Splunk integration
   */
  private async testSplunkIntegration(integration: ExternalIntegration): Promise<NotificationResult> {
    try {
      const testEvent: SplunkEvent = {
        time: Math.floor(Date.now() / 1000),
        host: 'stellara-test',
        source: 'siem-test',
        sourcetype: 'json',
        index: integration.config.index,
        event: {
          test: true,
          message: 'Integration test from Stellara SIEM',
          timestamp: new Date().toISOString(),
        },
      };

      const response = await this.callSplunkAPI(integration.config, testEvent);
      return { success: true, response: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get integration status
   */
  getIntegrationStatus(): Record<string, ExternalIntegration> {
    const status: Record<string, ExternalIntegration> = {};
    
    for (const [type, integration] of this.integrations) {
      status[type] = {
        ...integration,
        lastSync: integration.lastSync || new Date(),
      };
    }

    return status;
  }

  /**
   * Enable/disable integration
   */
  async toggleIntegration(type: string, enabled: boolean): Promise<boolean> {
    const integration = this.integrations.get(type);
    if (!integration) {
      return false;
    }

    integration.enabled = enabled;
    integration.status = enabled ? 'active' : 'inactive';
    
    return true;
  }
}
