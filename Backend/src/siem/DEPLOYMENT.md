# Deployment Guide - Advanced Threat Detection System

## Overview

This guide provides step-by-step instructions for deploying the Advanced Threat Detection System (SIEM) in production environments.

## Prerequisites

### Infrastructure Requirements

- **Node.js**: 18.x or higher
- **PostgreSQL**: 13.x or higher
- **Redis**: 6.x or higher
- **Memory**: Minimum 8GB RAM (16GB recommended)
- **Storage**: Minimum 100GB SSD (500GB recommended for log retention)
- **CPU**: Minimum 4 cores (8 cores recommended)

### External Services (Optional)

- **PagerDuty**: For incident management and escalation
- **Slack**: For real-time notifications
- **Splunk**: For advanced log analytics
- **Email Service**: For email notifications (SendGrid recommended)

## Deployment Steps

### 1. Environment Setup

```bash
# Clone the repository
git clone https://github.com/Ardecrownn/Stellara_Contracts.git
cd Stellara_Contracts
git checkout feature/advanced-threat-detection-system

# Navigate to backend directory
cd Backend

# Copy environment configuration
cp src/siem/.env.example .env
```

### 2. Configure Environment Variables

Edit `.env` file with your specific configuration:

```bash
# Enable SIEM Module
SIEM_ENABLED=true

# Database Configuration
SIEM_DB_HOST=localhost
SIEM_DB_PORT=5432
SIEM_DB_USERNAME=siem_user
SIEM_DB_PASSWORD=your_secure_password
SIEM_DB_DATABASE=stellara_siem

# Redis Configuration
SIEM_REDIS_HOST=localhost
SIEM_REDIS_PORT=6379
SIEM_REDIS_PASSWORD=your_redis_password

# External Integrations
PAGERDUTY_ENABLED=true
PAGERDUTY_API_KEY=your_pagerduty_api_key
PAGERDUTY_SERVICE_ID=your_service_id

SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_CHANNEL=#security-alerts

SPLUNK_ENABLED=true
SPLUNK_TOKEN=your_splunk_token
SPLUNK_INDEX=security

# Security Configuration
SIEM_ENCRYPTION_KEY=your_256_bit_encryption_key
SIEM_HMAC_KEY=your_hmac_key
```

### 3. Database Setup

```bash
# Create SIEM database
psql -U postgres -c "CREATE DATABASE stellara_siem;"
psql -U postgres -c "CREATE USER siem_user WITH PASSWORD 'your_secure_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE stellara_siem TO siem_user;"

# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

### 4. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies for ML models
pip install -r requirements.txt
```

### 5. Build and Deploy

```bash
# Build the application
npm run build

# Start the application in production mode
npm run start:prod
```

### 6. Verify Deployment

```bash
# Check health status
curl http://localhost:3000/siem/health

# Test API endpoints
curl -H "Authorization: Bearer <your-jwt-token>" \
     http://localhost:3000/siem/dashboard
```

## Docker Deployment

### 1. Build Docker Image

```bash
# Build the Docker image
docker build -t stellara/siem .

# Tag the image
docker tag stellara/siem:latest
```

### 2. Docker Compose Deployment

Create `docker-compose.siem.yml`:

```yaml
version: '3.8'

services:
  siem-app:
    image: stellara/siem:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SIEM_DB_HOST=postgres
      - SIEM_REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    volumes:
      - ./logs:/app/logs
      - ./evidence:/app/evidence
      - ./reports:/app/reports

  postgres:
    image: postgres:13
    environment:
      - POSTGRES_DB=stellara_siem
      - POSTGRES_USER=siem_user
      - POSTGRES_PASSWORD=your_secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:6-alpine
    command: redis-server --requirepass your_redis_password
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - siem-app

volumes:
  postgres_data:
  redis_data:
```

### 3. Deploy with Docker Compose

```bash
# Deploy the stack
docker-compose -f docker-compose.siem.yml up -d

# Check logs
docker-compose -f docker-compose.siem.yml logs -f siem-app
```

## Kubernetes Deployment

### 1. Create Namespace

```bash
kubectl create namespace siem
```

### 2. Deploy ConfigMap

```yaml
# siem-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: siem-config
  namespace: siem
data:
  SIEM_ENABLED: "true"
  SIEM_DB_HOST: "postgres-service"
  SIEM_REDIS_HOST: "redis-service"
```

### 3. Deploy Secrets

```yaml
# siem-secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: siem-secrets
  namespace: siem
type: Opaque
data:
  db-password: <base64-encoded-password>
  redis-password: <base64-encoded-password>
  encryption-key: <base64-encoded-key>
```

### 4. Deploy Application

```yaml
# siem-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: siem-app
  namespace: siem
spec:
  replicas: 3
  selector:
    matchLabels:
      app: siem-app
  template:
    metadata:
      labels:
        app: siem-app
    spec:
      containers:
      - name: siem-app
        image: stellara/siem:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: siem-config
        - secretRef:
            name: siem-secrets
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
```

### 5. Deploy Services

```yaml
# siem-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: siem-service
  namespace: siem
spec:
  selector:
    app: siem-app
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

### 6. Apply Kubernetes Manifests

```bash
kubectl apply -f siem-configmap.yaml
kubectl apply -f siem-secrets.yaml
kubectl apply -f siem-deployment.yaml
kubectl apply -f siem-service.yaml
```

## Monitoring and Observability

### 1. Application Monitoring

```bash
# Enable metrics collection
SIEM_METRICS_ENABLED=true

# Configure Prometheus endpoint
METRICS_PORT=9090
```

### 2. Log Monitoring

```bash
# Configure log levels
LOG_LEVEL=info

# Enable structured logging
STRUCTURED_LOGGING=true
```

### 3. Health Checks

```bash
# Configure health check interval
HEALTH_CHECK_INTERVAL=30000

# Configure health check timeout
HEALTH_CHECK_TIMEOUT=5000
```

## Security Configuration

### 1. SSL/TLS Setup

```bash
# Generate SSL certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/private.key \
  -out ssl/certificate.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

### 2. Firewall Configuration

```bash
# Open required ports
ufw allow 3000/tcp  # API server
ufw allow 5432/tcp  # PostgreSQL
ufw allow 6379/tcp  # Redis
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
```

### 3. Access Control

```bash
# Configure role-based access control
RBAC_ENABLED=true

# Set up user roles
ADMIN_USERS=admin@company.com
ANALYST_USERS=analyst@company.com
COMPLIANCE_USERS=compliance@company.com
```

## Performance Optimization

### 1. Database Optimization

```sql
-- Create indexes for performance
CREATE INDEX idx_logs_timestamp ON siem_logs(timestamp);
CREATE INDEX idx_logs_level ON siem_logs(level);
CREATE INDEX idx_logs_source ON siem_logs(source);
CREATE INDEX idx_threats_timestamp ON threats(timestamp);
CREATE INDEX idx_incidents_status ON incidents(status);
```

### 2. Redis Configuration

```bash
# Configure Redis memory
redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru

# Enable persistence
redis-server --save 900 1 --save 300 10 --save 60 10000
```

### 3. Application Scaling

```bash
# Configure worker processes
WORKER_PROCESSES=4

# Configure connection pools
DB_POOL_SIZE=20
REDIS_POOL_SIZE=10
```

## Backup and Recovery

### 1. Database Backup

```bash
# Create backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U siem_user stellara_siem > backup_$DATE.sql
gzip backup_$DATE.sql
```

### 2. Evidence Backup

```bash
# Backup evidence directory
tar -czf evidence_backup_$(date +%Y%m%d).tar.gz /var/lib/stellara/siem/evidence/
```

### 3. Configuration Backup

```bash
# Backup configuration files
cp .env .env.backup.$(date +%Y%m%d)
cp nginx.conf nginx.conf.backup.$(date +%Y%m%d)
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Check database status
   systemctl status postgresql
   
   # Check connection
   psql -h localhost -U siem_user -d stellara_siem
   ```

2. **Redis Connection Errors**
   ```bash
   # Check Redis status
   systemctl status redis
   
   # Test connection
   redis-cli -h localhost -p 6379 ping
   ```

3. **High Memory Usage**
   ```bash
   # Check memory usage
   free -h
   
   # Monitor Node.js process
   ps aux | grep node
   ```

4. **Slow Performance**
   ```bash
   # Check database queries
   psql -h localhost -U siem_user -d stellara_siem -c "SELECT * FROM pg_stat_activity;"
   
   # Check Redis memory
   redis-cli info memory
   ```

### Log Analysis

```bash
# Application logs
tail -f /var/log/stellara/siem/app.log

# Error logs
tail -f /var/log/stellara/siem/error.log

# Access logs
tail -f /var/log/nginx/access.log
```

## Maintenance

### 1. Regular Tasks

```bash
# Daily: Log rotation
logrotate -f /etc/logrotate.d/stellara-siem

# Weekly: Database maintenance
vacuumdb stellara_siem;

# Monthly: Security updates
npm audit fix
```

### 2. Model Retraining

```bash
# Retrain ML models
npm run siem:ml:retrain

# Update threat patterns
npm run siem:patterns:update
```

### 3. Compliance Reporting

```bash
# Generate monthly compliance reports
npm run siem:compliance:generate --framework=SOC2
npm run siem:compliance:generate --framework=ISO27001
```

## Support

For deployment support:
- Documentation: https://docs.stellara.com/siem
- Support: siem-support@stellara.com
- Issues: https://github.com/Ardecrownn/Stellara_Contracts/issues
