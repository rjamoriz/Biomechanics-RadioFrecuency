# Deployment

## Local Development

```bash
make setup    # Install dependencies, create .env
make db-up    # Start PostgreSQL
make dev      # Start all services
```

## Docker Compose (Recommended for Production)

```bash
# Build and start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f backend
docker compose logs -f gateway
docker compose logs -f web
```

## Environment Variables

See [.env.example](../.env.example) for all required variables.

### Critical Production Settings

| Variable | Default | Production Requirement |
|----------|---------|----------------------|
| `JWT_SECRET` | `change-me-in-production` | Set to a strong random string |
| `DB_PASSWORD` | `biomech` | Use a strong password |
| `DEMO_MODE` | `false` | Must be `false` in production |

## PostgreSQL

- Version: 15+
- Default database: `biomech`
- Migrations: managed by Flyway (applied automatically on backend startup)

### Backup

```bash
pg_dump -U biomech -h localhost biomech > backup.sql
```

### Restore

```bash
psql -U biomech -h localhost biomech < backup.sql
```

## Reverse Proxy (Production)

Use nginx or Caddy in front of the services:

```nginx
server {
    listen 443 ssl;
    server_name biomech.example.com;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
    }

    location /ws/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Health Checks

- Backend: `GET http://localhost:8080/actuator/health`
- Gateway: `GET http://localhost:3001/health`
- Web: `GET http://localhost:3000`
