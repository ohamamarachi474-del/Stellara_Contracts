# Advanced Threat Detection System - API Documentation

## Overview

The Advanced Threat Detection System provides a comprehensive REST API for managing security events, threats, incidents, and compliance reporting. This API enables integration with external systems and provides programmatic access to all SIEM functionalities.

## Base URL

```
http://localhost:3000/siem
```

## Authentication

All API endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Response Format

All responses follow a consistent format:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {}
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Log Management

### Ingest Single Log

Ingest a single log entry into the SIEM system.

**Endpoint:** `POST /logs`

**Required Roles:** `security-analyst`, `admin`

**Request Body:**
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "error",
  "source": "application",
  "category": "security_event",
  "message": "Failed login attempt",
  "details": {
    "userId": "user123",
    "sessionId": "sess_456",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "requestId": "req_789"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "log_123",
    "timestamp": "2024-01-01T12:00:00Z",
    "level": "error",
    "source": "application",
    "category": "security_event",
    "message": "Failed login attempt",
    "threatScore": 75.5,
    "triggeredAlert": false,
    "processingStatus": "processed"
  }
}
```

### Batch Log Ingestion

Ingest multiple log entries in a single request.

**Endpoint:** `POST /logs/batch`

**Required Roles:** `security-analyst`, `admin`

**Request Body:**
```json
{
  "logs": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "level": "error",
      "source": "application",
      "category": "security_event",
      "message": "Failed login attempt"
    },
    {
      "timestamp": "2024-01-01T12:01:00Z",
      "level": "warn",
      "source": "database",
      "category": "performance_event",
      "message": "Slow query detected"
    }
  ]
}
```

### Query Logs

Retrieve logs with filtering and pagination.

**Endpoint:** `GET /logs`

**Required Roles:** `security-analyst`, `admin`

**Query Parameters:**
- `startDate` (string): Start date for log query (ISO 8601 format)
- `endDate` (string): End date for log query (ISO 8601 format)
- `levels` (array): Log levels to filter (debug, info, warn, error, critical)
- `sources` (array): Log sources to filter
- `categories` (array): Log categories to filter
- `userId` (string): Filter by user ID
- `sessionId` (string): Filter by session ID
- `ipAddress` (string): Filter by IP address
- `message` (string): Search in message content (case-insensitive)
- `threatScoreMin` (number): Minimum threat score
- `threatScoreMax` (number): Maximum threat score
- `triggeredAlert` (boolean): Filter by alert status
- `limit` (number): Maximum number of logs to return (default: 100)
- `offset` (number): Number of logs to skip (default: 0)
- `sortBy` (string): Sort field (timestamp, level, threatScore)
- `sortOrder` (string): Sort order (ASC, DESC)

**Example Request:**
```
GET /logs?startDate=2024-01-01T00:00:00Z&endDate=2024-01-02T00:00:00Z&levels=error,critical&limit=50&sortBy=timestamp&sortOrder=DESC
```

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_123",
        "timestamp": "2024-01-01T12:00:00Z",
        "level": "error",
        "source": "application",
        "category": "security_event",
        "message": "Failed login attempt",
        "threatScore": 75.5,
        "triggeredAlert": true,
        "threatId": "threat_456"
      }
    ],
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

### Get Log Statistics

Retrieve statistical summary of logs for a time range.

**Endpoint:** `GET /logs/statistics`

**Required Roles:** `security-analyst`, `admin`

**Query Parameters:**
- `start` (string, required): Start date (ISO 8601 format)
- `end` (string, required): End date (ISO 8601 format)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalLogs": 125000,
    "alertCount": 450,
    "stats": [
      {
        "level": "error",
        "source": "application",
        "category": "security_event",
        "count": 1250,
        "avgThreatScore": 65.5,
        "maxThreatScore": 95.0
      }
    ],
    "timeRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-02T00:00:00Z"
    }
  }
}
```

## Threat Detection

### Map Threat to MITRE ATT&CK

Map a threat to MITRE ATT&CK techniques and tactics.

**Endpoint:** `POST /threats/:threatId/mitre-mapping`

**Required Roles:** `security-analyst`, `admin`

**Path Parameters:**
- `threatId` (string): ID of the threat to map

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "threatId": "threat_123",
      "techniqueId": "T1110",
      "tacticId": "TA0001",
      "confidence": 0.85,
      "evidence": [
        "Brute force pattern detected",
        "Multiple failed login attempts"
      ],
      "mappedAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### Get MITRE Techniques

Retrieve all MITRE ATT&CK techniques.

**Endpoint:** `GET /threats/mitre/techniques`

**Required Roles:** `security-analyst`, `admin`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "T1110",
      "name": "Brute Force",
      "description": "Adversaries may use brute force techniques to gain access to accounts.",
      "tactic": {
        "id": "TA0001",
        "name": "Initial Access"
      },
      "dataSources": ["Authentication logs", "Network traffic"],
      "detection": "Monitor for multiple failed login attempts",
      "mitigation": "Implement account lockout policies"
    }
  ]
}
```

### Get Threat Analytics

Retrieve threat analytics and trending patterns.

**Endpoint:** `GET /threats/analytics/trending`

**Required Roles:** `security-analyst`, `admin`

**Query Parameters:**
- `timeframe` (string): Timeframe for analysis (24h, 7d, 30d)

**Response:**
```json
{
  "success": true,
  "data": {
    "timeframe": "7d",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-08T00:00:00Z",
    "trendingThreats": [
      {
        "threatType": "brute_force",
        "count": 45,
        "trend": "increasing",
        "percentage": 35.5
      }
    ],
    "totalThreats": 127,
    "topAttackers": [
      {
        "ip": "192.168.1.100",
        "count": 15,
        "country": "Unknown"
      }
    ]
  }
}
```

### Get Threat Statistics

Retrieve comprehensive threat detection statistics.

**Endpoint:** `GET /threats/statistics`

**Required Roles:** `security-analyst`, `admin`

**Query Parameters:**
- `timeframe` (string): Timeframe for statistics (24h, 7d, 30d)

**Response:**
```json
{
  "success": true,
  "data": {
    "timeframe": "30d",
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    },
    "totalThreats": 127,
    "threatsByType": {
      "brute_force": 45,
      "sql_injection": 12,
      "ddos": 8
    },
    "threatsBySeverity": {
      "low": 35,
      "medium": 58,
      "high": 28,
      "critical": 6
    },
    "averageThreatScore": 67.5,
    "highConfidenceThreats": 89,
    "falsePositiveRate": 8.2,
    "detectionRate": 94.3
  }
}
```

## Incident Management

### Get Incidents

Retrieve incidents with filtering and pagination.

**Endpoint:** `GET /incidents`

**Required Roles:** `security-analyst`, `admin`

**Query Parameters:**
- `status` (string): Filter by incident status
- `severity` (string): Filter by incident severity
- `limit` (number): Maximum number of incidents to return
- `offset` (number): Number of incidents to skip

**Response:**
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "id": "inc_123",
        "ticketNumber": "INC-2024-001",
        "type": "security_breach",
        "severity": "high",
        "priority": "p2",
        "status": "in_progress",
        "title": "SQL Injection Attack Detected",
        "description": "SQL injection attempt blocked on web application",
        "detectedAt": "2024-01-01T12:00:00Z",
        "assignedTo": "analyst-1",
        "threatIds": ["threat_456"]
      }
    ],
    "total": 2
  }
}
```

### Get Incident Details

Retrieve detailed information about a specific incident.

**Endpoint:** `GET /incidents/:incidentId`

**Required Roles:** `security-analyst`, `admin`

**Path Parameters:**
- `incidentId` (string): ID of the incident

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "inc_123",
    "ticketNumber": "INC-2024-001",
    "type": "security_breach",
    "severity": "high",
    "priority": "p2",
    "status": "in_progress",
    "title": "SQL Injection Attack Detected",
    "description": "SQL injection attempt blocked on web application",
    "detectedAt": "2024-01-01T12:00:00Z",
    "assignedTo": "analyst-1",
    "teamMembers": ["analyst-1", "analyst-2"],
    "threatIds": ["threat_456"],
    "affectedSystems": [
      {
        "systemId": "web-server-01",
        "systemName": "Web Server 01",
        "impactLevel": "high"
      }
    ],
    "responseActions": [
      {
        "action": "block_ip",
        "description": "Block attacker IP address",
        "executedBy": "system",
        "executedAt": "2024-01-01T12:01:00Z",
        "success": true
      }
    ],
    "timeline": [
      {
        "timestamp": "2024-01-01T12:00:00Z",
        "event": "Threat detected by SIEM",
        "source": "Threat Detection Service",
        "significance": "high"
      }
    ]
  }
}
```

### Assign Incident

Assign an incident to an analyst.

**Endpoint:** `POST /incidents/:incidentId/assign`

**Required Roles:** `security-analyst`, `admin`

**Request Body:**
```json
{
  "assignedTo": "analyst-1",
  "note": "Taking ownership of this incident for investigation"
}
```

### Update Incident Status

Update the status of an incident.

**Endpoint:** `POST /incidents/:incidentId/status`

**Required Roles:** `security-analyst`, `admin`

**Request Body:**
```json
{
  "status": "resolved",
  "note": "Incident resolved after blocking attacker IP and patching vulnerability"
}
```

### Send Incident Alert

Send incident alerts to external systems.

**Endpoint:** `POST /incidents/:incidentId/external-alert`

**Required Roles:** `security-analyst`, `admin`

**Request Body:**
```json
{
  "channels": ["pagerduty", "slack"],
  "customMessage": "Critical security incident requiring immediate attention",
  "urgency": "high"
}
```

## Compliance Reporting

### Generate SOC 2 Report

Generate a SOC 2 compliance report.

**Endpoint:** `POST /compliance/reports/soc2`

**Required Roles:** `compliance-analyst`, `admin`

**Request Body:**
```json
{
  "periodStart": "2024-01-01T00:00:00Z",
  "periodEnd": "2024-03-31T23:59:59Z",
  "reportType": "compliance_assessment"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "report_123",
    "title": "SOC 2 Compliance Report - Q1 2024",
    "framework": "SOC2",
    "reportType": "compliance_assessment",
    "status": "draft",
    "complianceScore": 87.5,
    "riskLevel": "medium",
    "periodStart": "2024-01-01T00:00:00Z",
    "periodEnd": "2024-03-31T23:59:59Z",
    "generatedAt": "2024-04-15T10:00:00Z"
  }
}
```

### Get Compliance Reports

Retrieve compliance reports with filtering.

**Endpoint:** `GET /compliance/reports`

**Required Roles:** `compliance-analyst`, `admin`

**Query Parameters:**
- `framework` (string): Filter by compliance framework (SOC2, ISO27001)
- `limit` (number): Maximum number of reports to return

**Response:**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": "report_123",
        "title": "SOC 2 Compliance Report - Q1 2024",
        "framework": "SOC2",
        "status": "approved",
        "complianceScore": 87.5,
        "generatedAt": "2024-04-15T10:00:00Z"
      }
    ],
    "total": 2
  }
}
```

### Get Compliance Dashboard

Retrieve compliance dashboard data.

**Endpoint:** `GET /compliance/dashboard`

**Required Roles:** `compliance-analyst`, `admin`

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "overallComplianceScore": 85.5,
      "riskLevel": "medium",
      "totalReports": 12,
      "pendingReports": 2
    },
    "frameworkScores": {
      "SOC2": 87.5,
      "ISO27001": 82.3,
      "PCI_DSS": 91.2
    },
    "upcomingDeadlines": [
      {
        "framework": "SOC2",
        "reportType": "Q2 2024",
        "dueDate": "2024-07-15T00:00:00Z",
        "daysRemaining": 45
      }
    ]
  }
}
```

## System Management

### Get System Health

Check the health status of the SIEM system.

**Endpoint:** `GET /health`

**Required Roles:** Any authenticated user

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T12:00:00Z",
    "services": {
      "logAggregation": "operational",
      "threatDetection": "operational",
      "incidentResponse": "operational",
      "mitreMapping": "operational",
      "forensicAnalysis": "operational",
      "externalIntegrations": "operational",
      "complianceReporting": "operational"
    }
  }
}
```

### Get Integration Status

Check the status of external integrations.

**Endpoint:** `GET /integrations/status`

**Required Roles:** `admin`

**Response:**
```json
{
  "success": true,
  "data": {
    "pagerduty": {
      "id": "pagerduty-1",
      "name": "PagerDuty",
      "type": "pagerduty",
      "enabled": true,
      "status": "active",
      "lastSync": "2024-01-01T12:00:00Z"
    },
    "slack": {
      "id": "slack-1",
      "name": "Slack",
      "type": "slack",
      "enabled": true,
      "status": "active",
      "lastSync": "2024-01-01T12:00:00Z"
    }
  }
}
```

### Test Integrations

Test all external integrations.

**Endpoint:** `POST /integrations/test`

**Required Roles:** `admin`

**Response:**
```json
{
  "success": true,
  "data": {
    "pagerduty": {
      "success": true,
      "messageId": "test_incident_123"
    },
    "slack": {
      "success": true,
      "messageId": "test_message_456"
    },
    "splunk": {
      "success": false,
      "error": "Connection timeout"
    }
  }
}
```

## Error Codes

| Error Code | Description |
|------------|-------------|
| VALIDATION_ERROR | Invalid input parameters |
| UNAUTHORIZED | Authentication required or invalid |
| FORBIDDEN | Insufficient permissions |
| NOT_FOUND | Resource not found |
| CONFLICT | Resource conflict |
| RATE_LIMITED | Too many requests |
| INTERNAL_ERROR | Internal server error |
| SERVICE_UNAVAILABLE | Service temporarily unavailable |

## Rate Limiting

API requests are rate-limited to prevent abuse:
- Default limit: 1000 requests per hour per user
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`: Total requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time when limit resets

## Pagination

List endpoints support pagination:
- `limit`: Maximum items per page (default: 100, max: 1000)
- `offset`: Number of items to skip (default: 0)
- Response includes total count for pagination

## Webhooks

Configure webhooks for real-time notifications:

**Endpoint:** `POST /webhooks`

**Request Body:**
```json
{
  "url": "https://your-webhook-endpoint.com/siem",
  "events": ["threat.detected", "incident.created", "report.generated"],
  "secret": "your_webhook_secret"
}
```

## SDKs and Libraries

Official SDKs available:
- Node.js: `@stellara/siem-sdk`
- Python: `stellara-siem-python`
- Go: `github.com/stellara/siem-go`

## Support

For API support:
- Documentation: https://docs.stellara.com/siem-api
- Support: siem-support@stellara.com
- Status page: https://status.stellara.com
