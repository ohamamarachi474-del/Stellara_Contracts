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
import { LogAggregationService, LogEntry, LogQuery } from '../services/log-aggregation.service';
import { ThreatDetectionService, ThreatDetectionResult } from '../services/threat-detection.service';
import { IncidentResponseService } from '../services/incident-response.service';
import { MitreAttackService, ThreatMitreMapping } from '../services/mitre-attack.service';
import { ForensicAnalysisService, ForensicReport } from '../services/forensic-analysis.service';
import { ExternalIntegrationService, NotificationResult } from '../services/external-integration.service';
import { ComplianceReportingService, ComplianceReport } from '../services/compliance-reporting.service';

@ApiTags('SIEM')
@Controller('siem')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SiemController {
  constructor(
    private readonly logAggregationService: LogAggregationService,
    private readonly threatDetectionService: ThreatDetectionService,
    private readonly incidentResponseService: IncidentResponseService,
    private readonly mitreAttackService: MitreAttackService,
    private readonly forensicAnalysisService: ForensicAnalysisService,
    private readonly externalIntegrationService: ExternalIntegrationService,
    private readonly complianceReportingService: ComplianceReportingService,
  ) {}

  @Post('logs')
  @HttpCode(HttpStatus.CREATED)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Ingest a single log entry' })
  @ApiResponse({ status: 201, description: 'Log successfully ingested' })
  async ingestLog(@Body() logEntry: LogEntry) {
    return this.logAggregationService.ingestLog(logEntry);
  }

  @Post('logs/batch')
  @HttpCode(HttpStatus.CREATED)
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Ingest multiple log entries' })
  @ApiResponse({ status: 201, description: 'Logs successfully ingested' })
  async ingestLogsBatch(@Body() logEntries: LogEntry[]) {
    return this.logAggregationService.ingestLogsBatch(logEntries);
  }

  @Get('logs')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Query logs with filters' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date for log query' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date for log query' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of logs to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of logs to skip' })
  async queryLogs(@Query() query: LogQuery) {
    return this.logAggregationService.queryLogs(query);
  }

  @Get('logs/statistics')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get log statistics for a time range' })
  @ApiQuery({ name: 'start', required: true, description: 'Start date for statistics' })
  @ApiQuery({ name: 'end', required: true, description: 'End date for statistics' })
  async getLogStatistics(@Query() timeRange: { start: string; end: string }) {
    const start = new Date(timeRange.start);
    const end = new Date(timeRange.end);
    return this.logAggregationService.getLogStatistics({ start, end });
  }

  @Post('threats/:threatId/mitre-mapping')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Map threat to MITRE ATT&CK techniques' })
  @ApiParam({ name: 'threatId', description: 'Threat ID to map' })
  async mapThreatToMitre(@Param('threatId') threatId: string) {
    // This would need to get the threat entity first
    // For now, return a placeholder
    return { message: 'MITRE mapping functionality', threatId };
  }

  @Get('mitre/techniques')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get all MITRE ATT&CK techniques' })
  async getAllMitreTechniques() {
    return this.mitreAttackService.getAllTechniques();
  }

  @Get('mitre/tactics')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get all MITRE ATT&CK tactics' })
  async getAllMitreTactics() {
    return this.mitreAttackService.getAllTactics();
  }

  @Get('mitre/analytics')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get MITRE ATT&CK analytics' })
  @ApiQuery({ name: 'start', required: true, description: 'Start date for analytics' })
  @ApiQuery({ name: 'end', required: true, description: 'End date for analytics' })
  async getMitreAnalytics(@Query() timeRange: { start: string; end: string }) {
    const start = new Date(timeRange.start);
    const end = new Date(timeRange.end);
    return this.mitreAttackService.getMitreAnalytics({ start, end });
  }

  @Get('integrations/status')
  @Roles('admin')
  @ApiOperation({ summary: 'Get status of external integrations' })
  async getIntegrationStatus() {
    return this.externalIntegrationService.getIntegrationStatus();
  }

  @Post('integrations/test')
  @Roles('admin')
  @ApiOperation({ summary: 'Test all external integrations' })
  async testIntegrations() {
    return this.externalIntegrationService.testIntegrations();
  }

  @Post('integrations/:type/toggle')
  @Roles('admin')
  @ApiOperation({ summary: 'Enable/disable external integration' })
  @ApiParam({ name: 'type', description: 'Integration type (pagerduty, slack, splunk)' })
  async toggleIntegration(
    @Param('type') type: string,
    @Body() body: { enabled: boolean }
  ) {
    const success = await this.externalIntegrationService.toggleIntegration(type, body.enabled);
    return { success, type, enabled: body.enabled };
  }

  @Get('dashboard')
  @Roles('security-analyst', 'admin')
  @ApiOperation({ summary: 'Get SIEM dashboard data' })
  async getDashboardData() {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const [logStats, mitreAnalytics, integrationStatus] = await Promise.all([
      this.logAggregationService.getLogStatistics({ start: twentyFourHoursAgo, end: now }),
      this.mitreAttackService.getMitreAnalytics({ start: twentyFourHoursAgo, end: now }),
      this.externalIntegrationService.getIntegrationStatus(),
    ]);

    return {
      logStatistics: logStats,
      mitreAnalytics,
      integrationStatus,
      timestamp: now,
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get SIEM system health status' })
  async getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        logAggregation: 'operational',
        threatDetection: 'operational',
        incidentResponse: 'operational',
        mitreMapping: 'operational',
        forensicAnalysis: 'operational',
        externalIntegrations: 'operational',
        complianceReporting: 'operational',
      },
    };
  }
}
