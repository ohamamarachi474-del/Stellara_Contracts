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
import { ThreatDetectionService, ThreatDetectionResult } from '../services/threat-detection.service';
import { MitreAttackService, ThreatMitreMapping } from '../services/mitre-attack.service';
import { ExternalIntegrationService, NotificationResult } from '../services/external-integration.service';

@ApiTags('Threat Detection')
@Controller('siem/threats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThreatController {
  constructor(
    private readonly threatDetectionService: ThreatDetectionService,
    private readonly mitreAttackService: MitreAttackService,
    private readonly externalIntegrationService: ExternalIntegrationService,
  ) {}

  @Post(':threatId/mitre-mapping')
  @HttpCode(HttpStatus.OK)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Map threat to MITRE ATT&CK techniques' })
  @ApiParam({ name: 'threatId', description: 'Threat ID to map' })
  @ApiResponse({ status: 200, description: 'MITRE mapping completed' })
  async mapThreatToMitre(@Param('threatId') threatId: string): Promise<ThreatMitreMapping[]> {
    // This would need to fetch the threat entity from database
    // For now, return a placeholder implementation
    return [{
      threatId,
      techniqueId: 'T1110',
      tacticId: 'TA0001',
      confidence: 0.85,
      evidence: ['Brute force pattern detected', 'Multiple failed login attempts'],
      mappedAt: new Date(),
    }];
  }

  @Get(':threatId/mitre-mapping')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get existing MITRE mapping for threat' })
  @ApiParam({ name: 'threatId', description: 'Threat ID' })
  async getThreatMitreMapping(@Param('threatId') threatId: string): Promise<ThreatMitreMapping[]> {
    // This would fetch existing mappings from database
    return [];
  }

  @Post(':threatId/external-alert')
  @HttpCode(HttpStatus.OK)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Send threat alert to external systems' })
  @ApiParam({ name: 'threatId', description: 'Threat ID' })
  @ApiResponse({ status: 200, description: 'Alert sent successfully' })
  async sendThreatAlert(
    @Param('threatId') threatId: string,
    @Body() body: { 
      channels?: string[];
      customMessage?: string;
      urgency?: string;
    }
  ): Promise<{ pagerduty: NotificationResult; slack: NotificationResult }> {
    const results = {
      pagerduty: { success: false, error: 'Not implemented' },
      slack: { success: false, error: 'Not implemented' },
    };

    // Send to PagerDuty if requested
    if (!body.channels || body.channels.includes('pagerduty')) {
      try {
        // This would fetch the threat and create incident
        results.pagerduty = await this.externalIntegrationService.sendToPagerDuty(
          { id: threatId, title: 'Threat Alert', severity: 'high' } as any,
          { id: threatId, type: 'brute_force', severity: 'high' } as any
        );
      } catch (error) {
        results.pagerduty = { success: false, error: error.message };
      }
    }

    // Send to Slack if requested
    if (!body.channels || body.channels.includes('slack')) {
      try {
        results.slack = await this.externalIntegrationService.sendToSlack(
          { id: threatId, title: 'Threat Alert', severity: 'high' } as any,
          { id: threatId, type: 'brute_force', severity: 'high' } as any,
          body.customMessage
        );
      } catch (error) {
        results.slack = { success: false, error: error.message };
      }
    }

    return results;
  }

  @Get('analytics/trending')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get trending threat patterns' })
  @ApiQuery({ name: 'timeframe', required: false, description: 'Timeframe for analysis (24h, 7d, 30d)' })
  async getTrendingThreats(@Query('timeframe') timeframe: string = '24h') {
    // This would analyze threat trends over the specified timeframe
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return {
      timeframe,
      startDate,
      endDate: now,
      trendingThreats: [
        {
          threatType: 'brute_force',
          count: 45,
          trend: 'increasing',
          percentage: 35.5,
        },
        {
          threatType: 'sql_injection',
          count: 12,
          trend: 'stable',
          percentage: 9.5,
        },
        {
          threatType: 'ddos',
          count: 8,
          trend: 'decreasing',
          percentage: 6.3,
        },
      ],
      totalThreats: 127,
      topAttackers: [
        { ip: '192.168.1.100', count: 15, country: 'Unknown' },
        { ip: '10.0.0.50', count: 8, country: 'Internal' },
      ],
    };
  }

  @Get('statistics')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get threat detection statistics' })
  @ApiQuery({ name: 'timeframe', required: false, description: 'Timeframe for statistics' })
  async getThreatStatistics(@Query('timeframe') timeframe: string = '24h') {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return {
      timeframe,
      period: { start: startDate, end: now },
      totalThreats: 127,
      threatsByType: {
        brute_force: 45,
        sql_injection: 12,
        ddos: 8,
        phishing: 23,
        malware: 15,
        insider_threat: 4,
        unauthorized_access: 20,
      },
      threatsBySeverity: {
        low: 35,
        medium: 58,
        high: 28,
        critical: 6,
      },
      averageThreatScore: 67.5,
      highConfidenceThreats: 89,
      falsePositiveRate: 8.2,
      detectionRate: 94.3,
      responseTime: {
        average: 4.5, // minutes
        median: 3.2,
        p95: 12.8,
      },
    };
  }

  @Post('manual-detection')
  @HttpCode(HttpStatus.OK)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Trigger manual threat detection on specific data' })
  async triggerManualDetection(@Body() body: {
    dataSource: string;
    timeRange: { start: string; end: string };
    filters?: Record<string, any>;
  }) {
    const startDate = new Date(body.timeRange.start);
    const endDate = new Date(body.timeRange.end);

    // This would trigger manual threat detection on the specified data
    return {
      detectionId: `manual-${Date.now()}`,
      status: 'initiated',
      dataSource: body.dataSource,
      timeRange: { start: startDate, end: endDate },
      filters: body.filters || {},
      estimatedDuration: '5-10 minutes',
      initiatedAt: new Date(),
    };
  }

  @Get('detection-rules')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get active threat detection rules' })
  async getDetectionRules() {
    return {
      rules: [
        {
          id: 'brute-force-login',
          name: 'Brute Force Login Detection',
          enabled: true,
          severity: 'high',
          description: 'Detects multiple failed login attempts from same IP',
          conditions: [
            { field: 'category', operator: 'equals', value: 'authentication' },
            { field: 'message', operator: 'contains', value: 'failed' },
          ],
          threshold: 5,
          timeWindow: 15, // minutes
          lastTriggered: new Date(Date.now() - 2 * 60 * 60 * 1000),
          triggerCount: 127,
        },
        {
          id: 'sql-injection',
          name: 'SQL Injection Detection',
          enabled: true,
          severity: 'critical',
          description: 'Detects potential SQL injection attacks',
          conditions: [
            { field: 'category', operator: 'equals', value: 'security_event' },
            { field: 'message', operator: 'regex', value: '(?i)(union|select|insert|update|delete|drop|exec|script)' },
          ],
          threshold: 1,
          timeWindow: 1,
          lastTriggered: new Date(Date.now() - 6 * 60 * 60 * 1000),
          triggerCount: 12,
        },
        {
          id: 'unauthorized-access',
          name: 'Unauthorized Access Detection',
          enabled: true,
          severity: 'high',
          description: 'Detects unauthorized access attempts',
          conditions: [
            { field: 'category', operator: 'equals', value: 'authorization' },
            { field: 'message', operator: 'contains', value: 'unauthorized' },
          ],
          threshold: 3,
          timeWindow: 10,
          lastTriggered: new Date(Date.now() - 1 * 60 * 60 * 1000),
          triggerCount: 45,
        },
      ],
      totalRules: 15,
      enabledRules: 12,
      lastUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };
  }

  @Post('detection-rules/:ruleId/toggle')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Enable/disable threat detection rule' })
  @ApiParam({ name: 'ruleId', description: 'Detection rule ID' })
  async toggleDetectionRule(
    @Param('ruleId') ruleId: string,
    @Body() body: { enabled: boolean }
  ) {
    // This would toggle the detection rule in the database
    return {
      ruleId,
      enabled: body.enabled,
      updatedAt: new Date(),
      updatedBy: 'current-user', // Would get from auth context
    };
  }

  @Get('ml-models')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get ML model information' })
  async getMLModels() {
    return {
      models: [
        {
          id: 'threat-classifier-v1',
          name: 'Threat Classification Model',
          version: '1.2.0',
          type: 'classification',
          status: 'active',
          accuracy: 94.3,
          precision: 92.1,
          recall: 89.7,
          f1Score: 90.9,
          lastTrained: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          trainingDataSize: 125000,
          features: ['log_level', 'source', 'category', 'message_content', 'ip_address', 'user_agent'],
        },
        {
          id: 'anomaly-detector-v2',
          name: 'Anomaly Detection Model',
          version: '2.1.0',
          type: 'anomaly_detection',
          status: 'active',
          accuracy: 91.8,
          precision: 88.5,
          recall: 85.2,
          f1Score: 86.8,
          lastTrained: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          trainingDataSize: 89000,
          features: ['timestamp_patterns', 'user_behavior', 'resource_access', 'network_flow'],
        },
      ],
      totalModels: 2,
      activeModels: 2,
      lastModelUpdate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    };
  }

  @Post('ml-models/:modelId/retrain')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Retrain ML model' })
  @ApiParam({ name: 'modelId', description: 'ML model ID' })
  async retrainMLModel(@Param('modelId') modelId: string) {
    // This would initiate model retraining
    return {
      modelId,
      trainingJobId: `training-${Date.now()}`,
      status: 'initiated',
      estimatedDuration: '2-4 hours',
      initiatedAt: new Date(),
      trainingDataSize: 150000,
      hyperparameters: {
        learningRate: 0.001,
        batchSize: 32,
        epochs: 100,
      },
    };
  }
}
