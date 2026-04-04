# Privacy and Security

## Design Principles

- **Local-first**: all processing and storage happens on-premises by default
- **No cloud dependency**: the platform runs without internet connectivity
- **No camera dependency**: Wi-Fi CSI does not capture visual imagery
- **Minimal data collection**: collect only what is needed for biomechanics analysis

## Authentication

- JWT-based stateless authentication
- BCrypt password hashing (cost factor 12)
- Token expiration: configurable (default 24h)
- Refresh token support planned for v2

## Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, user management, system configuration |
| **Coach** | Athlete management, session control, reports, validation |
| **Operator** | Session control, live monitoring, calibration |

## Audit Logging

Critical actions are logged:
- User login/logout
- Session start/stop
- Calibration performed
- Validation imports
- Report generation
- User management changes

## Data Protection

- Athlete data (name, date of birth) stored in PostgreSQL with role-based access
- Raw CSI files contain no personally identifiable information
- Inferred motion data is skeletal — no visual imagery
- Reports can be generated without PII if configured

## Network Security

- Backend API requires authentication (except health endpoints and auth endpoints)
- CORS configured for known frontend origins only
- WebSocket connections authenticated via token
- No external API calls in default configuration

## Deployment Recommendations

- Use HTTPS in production (reverse proxy with TLS termination)
- Change default JWT secret immediately
- Use strong database passwords
- Restrict network access to the platform's ports
- Regular database backups
- Monitor audit logs
