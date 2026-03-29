# Advanced Threat Detection System - SIEM

## Overview

The Advanced Threat Detection System is a comprehensive Security Information and Event Management (SIEM) solution designed to provide centralized log aggregation, ML-based threat detection, automated incident response, forensic investigation tools, and compliance reporting capabilities for the Stellara Network.

## Architecture

### Core Components

1. **Log Aggregation Service** - Centralized collection and processing of logs from all system components
2. **Threat Detection Engine** - ML-powered threat detection with pattern matching and anomaly detection
3. **Incident Response Service** - Automated response playbooks with configurable escalation rules
4. **MITRE ATT&CK Framework** - Threat mapping to industry-standard attack techniques
5. **Forensic Analysis Service** - Evidence collection, timeline reconstruction, and investigation tools
6. **External Integration Service** - Integration with PagerDuty, Slack, Splunk, and other external systems
7. **Compliance Reporting** - Automated SOC 2 and ISO 27001 compliance reporting

### Data Flow

```
System Logs → Log Aggregation → Threat Detection → Incident Response → External Notifications
     ↓              ↓              ↓              ↓              ↓
   Storage     ML Analysis   Playbooks    Forensics    Compliance Reports
```

## Features

### 🔍 Centralized Log Aggregation

- **Multi-source log collection**: Application, database, infrastructure, blockchain, authentication, authorization, network, and security logs
- **Real-time processing**: High-throughput log ingestion with Redis caching
- **Advanced filtering**: Query logs by level, source, category, time range, IP address, user, and custom filters
- **Log enrichment**: Geo-location, threat scoring, and metadata enrichment
- **Automated archiving**: Configurable retention policies with automated archival

### 🛡️ ML-Based Threat Detection

- **Pattern-based detection**: Pre-configured detection rules for common attack patterns
- **Machine learning models**: TensorFlow.js models for anomaly detection and threat classification
- **Real-time analysis**: Immediate threat detection on log ingestion
- **Confidence scoring**: ML-based confidence scores for threat prioritization
- **Adaptive learning**: Model retraining and update capabilities

### 🚨 Automated Incident Response

- **Response playbooks**: Configurable automated response workflows
- **Multi-stage actions**: IP blocking, account freezing, system isolation, evidence collection
- **Escalation rules**: Time-based and severity-based escalation
- **Integration ready**: Seamless integration with external notification systems
- **Audit trail**: Complete audit log of all response actions

### 🎯 MITRE ATT&CK Framework

- **Automatic mapping**: Threat mapping to MITRE ATT&CK techniques and tactics
- **Coverage analysis**: Identify gaps in threat detection coverage
- **Trending analysis**: Track emerging attack techniques
- **Compliance support**: Framework-aligned threat intelligence

### 🔬 Forensic Investigation Tools

- **Evidence collection**: Automated collection of logs, system data, memory dumps, and network captures
- **Timeline reconstruction**: Event timeline with gap analysis
- **Chain of custody**: Complete evidence tracking and integrity verification
- **Analysis tools**: Pattern analysis, indicator extraction, and attack chain reconstruction
- **Report generation**: Comprehensive forensic reports with findings and recommendations

### 📊 External Integrations

- **PagerDuty**: Incident creation and escalation
- **Slack**: Real-time alerts and notifications
- **Splunk**: Log forwarding and analytics
- **Email**: Automated email notifications
- **Webhooks**: Custom webhook integrations

### 📋 Compliance Reporting

- **SOC 2 Type II**: Automated compliance assessment and reporting
- **ISO 27001**: Information security management system compliance
- **Custom frameworks**: Configurable compliance requirements
- **Scheduled reports**: Automated report generation and distribution
- **Audit trails**: Complete audit logs for compliance verification

## Installation and Setup

### Prerequisites

- Node.js 18+ and TypeScript
- PostgreSQL database
- Redis for caching
- TensorFlow.js for ML capabilities
- External service accounts (PagerDuty, Slack, Splunk) - optional

### Configuration

1. Copy the environment configuration:
```bash
cp src/siem/.env.example .env
```

2. Configure the required environment variables:
```bash
# Enable SIEM module
SIEM_ENABLED=true

# Database configuration
SIEM_DB_HOST=localhost
SIEM_DB_PORT=5432
SIEM_DB_USERNAME=siem_user
SIEM_DB_PASSWORD=siem_password
SIEM_DB_DATABASE=stellara_siem

# Redis configuration
SIEM_REDIS_HOST=localhost
SIEM_REDIS_PORT=6379

# External integrations (optional)
PAGERDUTY_ENABLED=true
SLACK_ENABLED=true
SPLUNK_ENABLED=true
```

3. Install dependencies:
```bash
npm install
```

4. Run database migrations:
```bash
npm run db:migrate
```

5. Start the SIEM service:
```bash
npm run start:dev
```

## API Documentation

### Log Management

#### Ingest Single Log
```http
POST /siem/logs
Content-Type: application/json

{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "error",
  "source": "application",
  "category": "security_event",
  "message": "Failed login attempt",
  "details": {
    "userId": "user123",
    "ipAddress": "192.168.1.100"
  }
}
```

#### Query Logs
```http
GET /siem/logs?startDate=2024-01-01T00:00:00Z&endDate=2024-01-02T00:00:00Z&level=error&limit=100
```

### Threat Detection

#### Map Threat to MITRE ATT&CK
```http
POST /siem/threats/:threatId/mitre-mapping
```

#### Get Threat Statistics
```http
GET /siem/threats/statistics?timeframe=7d
```

### Incident Response

#### Get Incidents
```http
GET /siem/incidents?status=in_progress&severity=high
```

#### Assign Incident
```http
POST /siem/incidents/:incidentId/assign
{
  "assignedTo": "analyst-1",
  "note": "Taking ownership of this incident"
}
```

### Compliance Reporting

#### Generate SOC 2 Report
```http
POST /siem/compliance/reports/soc2
{
  "periodStart": "2024-01-01T00:00:00Z",
  "periodEnd": "2024-03-31T23:59:59Z"
}
```

## Configuration

### Detection Rules

The system includes pre-configured detection rules for common attack patterns:

- **Brute Force Attacks**: Multiple failed login attempts
- **SQL Injection**: SQL injection pattern detection
- **DDoS Attacks**: High volume requests from multiple sources
- **Unauthorized Access**: Access attempts to restricted resources
- **Anomalous Behavior**: ML-based anomaly detection

### Response Playbooks

Automated response playbooks include:

1. **Brute Force Response**:
   - Block source IP
   - Send security alert
   - Notify incident response team

2. **SQL Injection Response**:
   - Block attacker IP
   - Isolate affected system
   - Collect forensic evidence
   - Send critical alert

3. **DDoS Response**:
   - Activate DDoS mitigation
   - Send critical alert
   - Notify network team

### External Integrations

#### PagerDuty Integration
```javascript
// Configuration
PAGERDUTY_ENABLED=true
PAGERDUTY_API_KEY=your_api_key
PAGERDUTY_SERVICE_ID=your_service_id
```

#### Slack Integration
```javascript
// Configuration
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
SLACK_CHANNEL=#security-alerts
```

#### Splunk Integration
```javascript
// Configuration
SPLUNK_ENABLED=true
SPLUNK_TOKEN=your_splunk_token
SPLUNK_INDEX=security
```

## Monitoring and Maintenance

### Health Checks

Monitor the SIEM system health:
```http
GET /siem/health
```

### Performance Metrics

Key performance indicators:
- Log ingestion rate
- Threat detection accuracy
- Incident response time
- System resource usage
- ML model performance

### Maintenance Tasks

- **Log archival**: Automated archival of old logs
- **Model retraining**: Periodic ML model updates
- **Rule updates**: Update detection rules and patterns
- **Integration testing**: Test external integrations
- **Compliance reporting**: Generate scheduled reports

## Security Considerations

### Data Protection

- **Encryption**: All sensitive data encrypted at rest and in transit
- **Access control**: Role-based access control for all SIEM functions
- **Audit logging**: Complete audit trail of all activities
- **Data retention**: Configurable retention policies

### Privacy

- **PII detection**: Automatic detection of personally identifiable information
- **Data anonymization**: Optional data anonymization for privacy compliance
- **GDPR compliance**: Built-in GDPR compliance features

## Troubleshooting

### Common Issues

1. **High memory usage**: Reduce log batch size or increase processing workers
2. **Slow threat detection**: Check ML model performance and consider retraining
3. **Failed external notifications**: Verify integration credentials and network connectivity
4. **Database performance**: Optimize database queries and consider indexing

### Debug Mode

Enable debug logging:
```bash
SIEM_DEBUG_MODE=true
```

## Contributing

### Development Setup

1. Clone the repository
2. Create a feature branch
3. Install dependencies
4. Make changes
5. Run tests
6. Submit pull request

### Testing

Run the test suite:
```bash
npm run test
npm run test:coverage
```

### Code Style

Follow the existing code style and conventions:
- Use TypeScript for all new code
- Include comprehensive documentation
- Add unit tests for new features
- Follow security best practices

## Support

For support and questions:
- Create an issue in the repository
- Contact the security team
- Check the documentation and FAQ

## License

This project is licensed under the MIT License - see the LICENSE file for details.
