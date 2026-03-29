import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Query, 
  UseGuards,
  HttpCode,
  HttpStatus,
  ValidationPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IncidentResponseService } from '../services/incident-response.service';
import { ExternalIntegrationService, NotificationResult } from '../services/external-integration.service';

@ApiTags('Incident Response')
@Controller('siem/incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncidentController {
  constructor(
    private readonly incidentResponseService: IncidentResponseService,
    private readonly externalIntegrationService: ExternalIntegrationService,
  ) {}

  @Get()
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get all incidents' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by incident status' })
  @ApiQuery({ name: 'severity', required: false, description: 'Filter by incident severity' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of incidents to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of incidents to skip' })
  async getIncidents(@Query() query: any) {
    // This would fetch incidents from database with filters
    return {
      incidents: [
        {
          id: 'inc-123',
          ticketNumber: 'INC-2024-001',
          type: 'security_breach',
          severity: 'high',
          priority: 'p2',
          status: 'in_progress',
          title: 'SQL Injection Attack Detected',
          description: 'SQL injection attempt blocked on web application',
          detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          assignedTo: 'analyst-1',
          threatIds: ['threat-456'],
          affectedSystems: ['web-server-01', 'database-01'],
        },
        {
          id: 'inc-124',
          ticketNumber: 'INC-2024-002',
          type: 'unauthorized_access',
          severity: 'medium',
          priority: 'p3',
          status: 'resolved',
          title: 'Unauthorized Access Attempt',
          description: 'Failed attempt to access admin panel',
          detectedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
          assignedTo: 'analyst-2',
          threatIds: ['threat-457'],
          affectedSystems: ['admin-panel'],
        },
      ],
      total: 2,
      filters: query,
    };
  }

  @Get(':incidentId')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get incident by ID' })
  @ApiParam({ name: 'incidentId', description: 'Incident ID' })
  async getIncident(@Param('incidentId') incidentId: string) {
    // This would fetch specific incident from database
    return {
      id: incidentId,
      ticketNumber: 'INC-2024-001',
      type: 'security_breach',
      severity: 'high',
      priority: 'p2',
      status: 'in_progress',
      title: 'SQL Injection Attack Detected',
      description: 'SQL injection attempt blocked on web application',
      detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      assignedTo: 'analyst-1',
      teamMembers: ['analyst-1', 'analyst-2'],
      threatIds: ['threat-456'],
      affectedSystems: [
        {
          systemId: 'web-server-01',
          systemName: 'Web Server 01',
          impactLevel: 'high',
          description: 'Primary web application server',
        },
      ],
      businessImpact: {
        financialImpact: 0,
        operationalImpact: 'medium',
        reputationalImpact: 'low',
        complianceImpact: 'medium',
      },
      responseActions: [
        {
          action: 'block_ip',
          description: 'Block attacker IP address',
          executedBy: 'system',
          executedAt: new Date(Date.now() - 1.9 * 60 * 60 * 1000),
          success: true,
        },
        {
          action: 'isolate_system',
          description: 'Isolate affected web server',
          executedBy: 'system',
          executedAt: new Date(Date.now() - 1.8 * 60 * 60 * 1000),
          success: true,
        },
      ],
      timeline: [
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          event: 'Threat detected by SIEM',
          source: 'Threat Detection Service',
          evidence: ['log-123', 'log-124'],
          significance: 'high',
        },
        {
          timestamp: new Date(Date.now() - 1.9 * 60 * 60 * 1000),
          event: 'Incident created',
          source: 'Incident Response Service',
          evidence: ['incident-123'],
          significance: 'high',
        },
      ],
      notes: [
        {
          id: 'note-1',
          author: 'analyst-1',
          content: 'Initial investigation shows SQL injection attempt was blocked',
          timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
          category: 'observation',
          isInternal: true,
        },
      ],
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 30 * 60 * 1000),
    };
  }

  @Post(':incidentId/assign')
  @HttpCode(HttpStatus.OK)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Assign incident to analyst' })
  @ApiParam({ name: 'incidentId', description: 'Incident ID' })
  async assignIncident(
    @Param('incidentId') incidentId: string,
    @Body() body: { assignedTo: string; note?: string }
  ) {
    // This would update the incident assignment in database
    return {
      incidentId,
      assignedTo: body.assignedTo,
      assignedAt: new Date(),
      assignedBy: 'current-user', // Would get from auth context
      note: body.note,
    };
  }

  @Post(':incidentId/status')
  @HttpCode(HttpStatus.OK)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Update incident status' })
  @ApiParam({ name: 'incidentId', description: 'Incident ID' })
  async updateIncidentStatus(
    @Param('incidentId') incidentId: string,
    @Body() body: { status: string; note?: string }
  ) {
    // This would update the incident status in database
    return {
      incidentId,
      status: body.status,
      updatedAt: new Date(),
      updatedBy: 'current-user', // Would get from auth context
      note: body.note,
    };
  }

  @Post(':incidentId/notes')
  @HttpCode(HttpStatus.CREATED)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Add note to incident' })
  @ApiParam({ name: 'incidentId', description: 'Incident ID' })
  async addIncidentNote(
    @Param('incidentId') incidentId: string,
    @Body() body: { content: string; category: string; isInternal: boolean }
  ) {
    // This would add note to incident in database
    return {
      noteId: `note-${Date.now()}`,
      incidentId,
      content: body.content,
      category: body.category,
      isInternal: body.isInternal,
      author: 'current-user', // Would get from auth context
      timestamp: new Date(),
    };
  }

  @Post(':incidentId/external-alert')
  @HttpCode(HttpStatus.OK)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Send incident alert to external systems' })
  @ApiParam({ name: 'incidentId', description: 'Incident ID' })
  async sendIncidentAlert(
    @Param('incidentId') incidentId: string,
    @Body() body: { 
      channels?: string[];
      customMessage?: string;
      urgency?: string;
    }
  ): Promise<{ pagerduty: NotificationResult; slack: NotificationResult }> {
    const results = {
      pagerduty: { success: false, error: 'Not implemented' } as NotificationResult,
      slack: { success: false, error: 'Not implemented' } as NotificationResult,
    };

    // Send to PagerDuty if requested
    if (!body.channels || body.channels.includes('pagerduty')) {
      try {
        // This would fetch the incident and send to PagerDuty
        results.pagerduty = await this.externalIntegrationService.sendToPagerDuty(
          { id: incidentId, title: 'Incident Alert', severity: 'high' } as any,
          { id: 'threat-456', type: 'sql_injection', severity: 'high' } as any
        );
      } catch (error) {
        results.pagerduty = { success: false, error: error.message };
      }
    }

    // Send to Slack if requested
    if (!body.channels || body.channels.includes('slack')) {
      try {
        results.slack = await this.externalIntegrationService.sendToSlack(
          { id: incidentId, title: 'Incident Alert', severity: 'high' } as any,
          { id: 'threat-456', type: 'sql_injection', severity: 'high' } as any,
          body.customMessage
        );
      } catch (error) {
        results.slack = { success: false, error: error.message };
      }
    }

    return results;
  }

  @Get('playbooks')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get incident response playbooks' })
  async getResponsePlaybooks() {
    return {
      playbooks: [
        {
          id: 'brute-force-response',
          name: 'Brute Force Attack Response',
          description: 'Automated response to brute force login attacks',
          threatTypes: ['brute_force'],
          severity: ['high', 'critical'],
          enabled: true,
          actions: [
            {
              id: 'block-source-ip',
              name: 'Block Source IP',
              type: 'block_ip',
              order: 1,
              required: true,
              timeout: 30,
            },
            {
              id: 'send-security-alert',
              name: 'Send Security Alert',
              type: 'send_alert',
              order: 2,
              required: true,
              timeout: 60,
            },
          ],
          escalationRules: [
            {
              condition: 'incident.status == "in_progress" AND duration > 30',
              action: 'escalate_to_ciso',
              delay: 30,
            },
          ],
        },
        {
          id: 'sql-injection-response',
          name: 'SQL Injection Attack Response',
          description: 'Automated response to SQL injection attempts',
          threatTypes: ['sql_injection'],
          severity: ['critical'],
          enabled: true,
          actions: [
            {
              id: 'block-attacker-ip',
              name: 'Block Attacker IP',
              type: 'block_ip',
              order: 1,
              required: true,
              timeout: 30,
            },
            {
              id: 'isolate-web-server',
              name: 'Isolate Web Server',
              type: 'isolate_system',
              order: 2,
              required: true,
              timeout: 60,
            },
          ],
        },
      ],
      totalPlaybooks: 8,
      enabledPlaybooks: 6,
      lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    };
  }

  @Get('statistics')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get incident response statistics' })
  @ApiQuery({ name: 'timeframe', required: false, description: 'Timeframe for statistics' })
  async getIncidentStatistics(@Query('timeframe') timeframe: string = '30d') {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return {
      timeframe,
      period: { start: startDate, end: now },
      totalIncidents: 45,
      incidentsByStatus: {
        new: 8,
        in_progress: 15,
        investigating: 12,
        resolved: 28,
        closed: 25,
        escalated: 2,
      },
      incidentsBySeverity: {
        low: 12,
        medium: 18,
        high: 10,
        critical: 5,
      },
      incidentsByType: {
        security_breach: 8,
        data_breach: 3,
        system_compromise: 7,
        network_intrusion: 6,
        malware_outbreak: 4,
        ddos_attack: 2,
        insider_threat: 1,
        phishing_campaign: 5,
        unauthorized_access: 9,
      },
      averageResolutionTime: {
        overall: 4.5, // hours
        bySeverity: {
          low: 1.2,
          medium: 3.8,
          high: 8.5,
          critical: 12.3,
        },
      },
      responseTime: {
        average: 15.5, // minutes
        median: 12.0,
        p95: 45.0,
      },
      topAnalysts: [
        { name: 'analyst-1', incidentsHandled: 15, averageResolutionTime: 3.2 },
        { name: 'analyst-2', incidentsHandled: 12, averageResolutionTime: 4.8 },
        { name: 'analyst-3', incidentsHandled: 10, averageResolutionTime: 5.1 },
      ],
      automationRate: 67.5, // percentage of incidents with automated responses
    };
  }

  @Post('manual-creation')
  @HttpCode(HttpStatus.CREATED)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Manually create incident' })
  async createIncident(@Body() body: {
    type: string;
    severity: string;
    title: string;
    description: string;
    priority?: string;
    assignedTo?: string;
    affectedSystems?: any[];
  }) {
    // This would create incident in database
    return {
      incidentId: `inc-${Date.now()}`,
      ticketNumber: `INC-2024-${Math.floor(Math.random() * 1000)}`,
      type: body.type,
      severity: body.severity,
      priority: body.priority || this.determinePriority(body.severity),
      status: 'new',
      title: body.title,
      description: body.description,
      detectedAt: new Date(),
      startedAt: new Date(),
      assignedTo: body.assignedTo,
      affectedSystems: body.affectedSystems || [],
      createdBy: 'current-user', // Would get from auth context
      createdAt: new Date(),
    };
  }

  private determinePriority(severity: string): string {
    const mapping = {
      'low': 'p4',
      'medium': 'p3',
      'high': 'p2',
      'critical': 'p1',
    };
    return mapping[severity] || 'p3';
  }
}
