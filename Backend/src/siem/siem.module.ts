import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../database.module';
import { RedisModule } from '../redis/redis.module';
import { LoggingModule } from '../logging/logging.module';
import { AuditModule } from '../audit/audit.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationModule } from '../notification/notification.module';

// SIEM Components
import { LogAggregationService } from './services/log-aggregation.service';
import { ThreatDetectionService } from './services/threat-detection.service';
import { IncidentResponseService } from './services/incident-response.service';
import { ForensicAnalysisService } from './services/forensic-analysis.service';
import { ComplianceReportingService } from './services/compliance-reporting.service';
import { MitreAttackService } from './services/mitre-attack.service';
import { ExternalIntegrationService } from './services/external-integration.service';

// Controllers
import { SiemController } from './controllers/siem.controller';
import { ThreatController } from './controllers/threat.controller';
import { IncidentController } from './controllers/incident.controller';
import { ForensicController } from './controllers/forensic.controller';
import { ComplianceController } from './controllers/compliance.controller';

// Database Entities
import { SiemLog } from './entities/siem-log.entity';
import { Threat } from './entities/threat.entity';
import { Incident } from './entities/incident.entity';
import { ForensicCase } from './entities/forensic-case.entity';
import { ComplianceReport } from './entities/compliance-report.entity';

// Processors and Workers
import { LogProcessor } from './processors/log.processor';
import { ThreatProcessor } from './processors/threat.processor';
import { IncidentProcessor } from './processors/incident.processor';

// DTOs
import { CreateLogDto } from './dto/create-log.dto';
import { CreateThreatDto } from './dto/create-threat.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateForensicCaseDto } from './dto/create-forensic-case.dto';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    LoggingModule,
    AuditModule,
    MonitoringModule,
    WebsocketModule,
    NotificationModule,
  ],
  controllers: [
    SiemController,
    ThreatController,
    IncidentController,
    ForensicController,
    ComplianceController,
  ],
  providers: [
    // Core Services
    LogAggregationService,
    ThreatDetectionService,
    IncidentResponseService,
    ForensicAnalysisService,
    ComplianceReportingService,
    MitreAttackService,
    ExternalIntegrationService,
    
    // Processors
    LogProcessor,
    ThreatProcessor,
    IncidentProcessor,
    
    // Entity Models
    SiemLog,
    Threat,
    Incident,
    ForensicCase,
    ComplianceReport,
  ],
  exports: [
    LogAggregationService,
    ThreatDetectionService,
    IncidentResponseService,
    ForensicAnalysisService,
    ComplianceReportingService,
    MitreAttackService,
    ExternalIntegrationService,
  ],
})
export class SiemModule {}
