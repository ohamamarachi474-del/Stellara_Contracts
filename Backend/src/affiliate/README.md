# Affiliate Marketing Platform

A comprehensive affiliate and referral marketing system built for the Stellara Network, featuring multi-tier commissions, fraud detection, real-time analytics, and automated payouts.

## Features

### ✅ Completed Features

#### 🎯 Core Affiliate System
- **Unique Referral Code Generation**: Human-readable codes with custom option support
- **Multi-Tier Commission Structure**: Up to 3 levels of referral commissions
  - Tier 1: 20% of trading fees from direct referrals
  - Tier 2: 10% from referrals-of-referrals
  - Tier 3: 5% from third-level referrals
- **Affiliate Registration & Onboarding**: Complete application and approval workflow
- **Tier Management**: 5-tier system with increasing benefits

#### 📊 Real-Time Analytics & Dashboard
- **Performance Metrics**: Clicks, signups, conversions, revenue tracking
- **Conversion Funnel Analytics**: Complete funnel analysis from click to conversion
- **Geographic Analytics**: Country and city-level performance data
- **Device & Browser Analytics**: Detailed breakdown of user devices
- **Historical Performance**: Daily, weekly, and monthly reporting

#### 🔒 Advanced Fraud Detection
- **Self-Referral Detection**: IP and behavioral pattern analysis
- **Bot Traffic Identification**: User agent and activity pattern analysis
- **Click Fraud Prevention**: Rapid clicking and interval analysis
- **VPN/Proxy Detection**: Data center IP identification
- **Fraud Scoring**: Real-time risk assessment with configurable thresholds

#### 💰 Automated Payout System
- **Monthly Commission Processing**: Automated batch processing
- **Multiple Payment Methods**: Bank transfer, crypto, and digital wallets
- **Payout History**: Complete transaction tracking
- **Manual Payout Requests**: On-demand payout processing
- **Failed Payout Retry**: Automatic and manual retry mechanisms

#### 🌐 External Network Integration
- **ShareASale Integration**: Complete API integration
- **Commission Junction (CJ) Support**: Full CJ network connectivity
- **Rakuten Advertising**: Rakuten network integration
- **Impact Radius**: Partnership automation platform
- **Credential Management**: Secure encrypted storage
- **Sync Status Tracking**: Real-time synchronization monitoring

#### 📱 Comprehensive API
- **RESTful Endpoints**: Complete CRUD operations
- **Admin Dashboard**: Full administrative interface
- **Role-Based Access Control**: Secure permission system
- **Real-Time Notifications**: Email and in-app alerts

### 🚧 In Progress Features

#### 🎨 Custom Landing Pages
- Template-based landing page builder
- Affiliate customization options
- Performance tracking per landing page

#### 📝 Testing Suite
- Unit tests for all services
- Integration tests for API endpoints
- Performance testing for high-traffic scenarios

## Architecture

### Database Schema

The platform uses PostgreSQL with Prisma ORM and includes the following key models:

#### Core Models
- **Affiliate**: Main affiliate profile and settings
- **ReferralLink**: Unique tracking links and campaigns
- **ReferralClick**: Click tracking with fraud analysis
- **ReferralSignup**: Signup tracking and verification
- **ReferralConversion**: Conversion events and commission calculation

#### Financial Models
- **Commission**: Multi-tier commission records
- **Payout**: Automated payment processing
- **AffiliatePerformanceMetric**: Analytics aggregation

#### Security Models
- **AffiliateFraudFlag**: Fraud detection and management
- **ExternalAffiliateAccount**: Third-party network integration

### Service Architecture

#### Core Services
- **AffiliateService**: Affiliate management and operations
- **ReferralService**: Click tracking and conversion processing
- **CommissionService**: Multi-tier commission calculations
- **PayoutService**: Automated payment processing

#### Analytics Services
- **AnalyticsService**: Real-time performance analytics
- **FraudDetectionService**: Advanced fraud prevention

#### Integration Services
- **CodeGenerationService**: Unique code generation
- **ExternalNetworkService**: Third-party network integration

## API Documentation

### Affiliate Management

#### Registration & Profile
```http
POST /api/affiliate/register
GET  /api/affiliate/profile
PUT  /api/affiliate/profile
```

#### Analytics & Dashboard
```http
GET /api/affiliate/dashboard
GET /api/affiliate/analytics
GET /api/affiliate/funnel
GET /api/affiliate/geographic
GET /api/affiliate/devices
```

### Referral Tracking

#### Click & Conversion Tracking
```http
POST /api/referral/track-click
POST /api/referral/track-signup
PUT  /api/referral/confirm-signup/:signupId
POST /api/referral/track-conversion
```

#### Link Management
```http
GET    /api/referral/links
POST   /api/referral/links
PUT    /api/referral/links/:linkId
DELETE /api/referral/links/:linkId
```

### Commission Management

#### Commission Tracking
```http
GET /api/commission/my-commissions
GET /api/commission/stats
GET /api/commission/lifetime-earnings
GET /api/commission/pending
```

#### Admin Operations
```http
POST /api/commission/calculate
POST /api/commission/create
PUT  /api/commission/approve
PUT  /api/commission/reject
```

### Payout Management

#### Payout Operations
```http
GET  /api/payout/history
GET  /api/payout/pending
POST /api/payout/request-manual
GET  /api/payout/statistics
```

#### Admin Payout Processing
```http
POST /api/payout/admin/process-monthly
POST /api/payout/admin/process-affiliate/:affiliateId
POST /api/payout/admin/batch-process
```

### External Network Integration

#### Network Management
```http
GET  /api/affiliate/external-networks
POST /api/affiliate/external-networks/connect
GET  /api/affiliate/external-networks/accounts
POST /api/affiliate/external-networks/sync
```

## Configuration

### Environment Variables

```env
# Base Configuration
BASE_URL=https://stellara.network
SHORT_URL_BASE=https://stellara.io

# Payout Configuration
MIN_PAYOUT_AMOUNT=10.00
DEFAULT_CURRENCY=USD

# Fraud Detection
FRAUD_THRESHOLD=70
MAX_CLICKS_PER_MINUTE=20
MAX_SIGNUPS_PER_DAY=5

# External Networks
SHAREASALE_API_KEY=your_api_key
COMMISSION_JUNCTION_API_KEY=your_api_key
RAKUTEN_API_KEY=your_api_key
IMPACT_API_KEY=your_api_key

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/stellara
```

## Commission Structure

### Default Commission Rates

| Conversion Type | Tier 1 | Tier 2 | Tier 3 |
|----------------|--------|--------|--------|
| SIGNUP         | 20%    | 10%    | 5%     |
| FIRST_TRADE    | 15%    | 8%     | 4%     |
| DEPOSIT        | 10%    | 5%     | 2%     |
| TRADING_VOLUME | 5%     | 3%     | 1%     |
| SUBSCRIPTION   | 25%    | 12%    | 6%     |
| CUSTOM_ACTION  | 30%    | 15%    | 7%     |

### Tier Multipliers

| Tier | Multiplier | Benefits |
|------|------------|----------|
| 1    | 1.0x       | Basic support |
| 2    | 1.2x       | 10% max payout bonus |
| 3    | 1.5x       | 25% max payout bonus |
| 4    | 2.0x       | 50% max payout bonus |
| 5    | 2.5x       | 100% max payout bonus |

## Fraud Detection Rules

### High-Risk Indicators
- **Self-Referral**: Same IP as affiliate
- **Bot Traffic**: Suspicious user agents
- **Rapid Clicking**: >10 clicks per minute
- **Multiple Signups**: >5 signups per day from same IP
- **Data Center IPs**: Hosting provider IP ranges
- **Regular Intervals**: Bot-like clicking patterns

### Fraud Scoring
- **0-30**: Low risk - Allow
- **31-50**: Medium risk - Flag for review
- **51-70**: High risk - Block and investigate
- **71-100**: Critical risk - Immediate suspension

## External Network Integration

### Supported Networks

1. **ShareASale**
   - Required: `apiKey`, `affiliateId`
   - Features: Commission sync, click tracking

2. **Commission Junction (CJ)**
   - Required: `apiKey`, `cid`, `websiteId`
   - Features: Real-time reporting, performance analytics

3. **Rakuten Advertising**
   - Required: `apiKey`, `publisherId`
   - Features: Link generator, reporting API

4. **Impact Radius**
   - Required: `apiKey`, `accountSid`, `mediaId`
   - Features: Partnership automation, contract management

## Deployment

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (for caching)
- Prisma CLI

### Installation

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev
npx prisma generate

# Seed database (optional)
npm run db:seed

# Start development server
npm run start:dev
```

### Production Deployment

```bash
# Build application
npm run build

# Run database migrations
npx prisma migrate deploy

# Start production server
npm run start:prod
```

## Monitoring & Analytics

### Key Metrics
- **Click-Through Rate (CTR)**: Clicks ÷ Impressions
- **Conversion Rate**: Conversions ÷ Clicks
- **Cost Per Acquisition (CPA)**: Total Payout ÷ Conversions
- **Return on Investment (ROI)**: Revenue ÷ Commission
- **Affiliate Lifetime Value (LTV)**: Total Revenue per Affiliate

### Real-Time Dashboards
- Affiliate performance overview
- Geographic heatmaps
- Device and browser analytics
- Conversion funnel analysis
- Fraud detection alerts

## Security Considerations

### Data Protection
- Encrypted credential storage
- GDPR compliance features
- Data retention policies
- Secure API authentication

### Fraud Prevention
- Multi-layer fraud detection
- Real-time risk scoring
- Automated suspicious activity alerts
- Manual review workflows

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the documentation wiki

---

**Built with ❤️ for the Stellara Network**
