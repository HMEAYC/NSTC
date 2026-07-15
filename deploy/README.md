# HMEAYC Deployment

This directory contains deployment configurations for the HMEAYC system.

## Options

- `docker-compose.prod.yml` — Production Docker Compose override with resource limits and restart policies.
- `install_systemd.sh` — Script to register the backend as a systemd service (for bare-metal or VM deployments).

## Required environment variables (production)

`docker-compose.prod.yml` requires `JWT_SECRET` to be set — the base `docker-compose.yml` only
falls back to an insecure dev-only default, and the prod overlay refuses to start without an
explicit value (a well-known signing secret lets anyone forge login tokens, including
`super_admin`). Set it in the shell environment or a repo-root `.env` file before deploying:

```bash
# repo-root .env (not committed — see .gitignore)
JWT_SECRET=<a long random value, e.g. `openssl rand -hex 32`>
GEMINI_API_KEY=...
CORS_ORIGINS=https://your-dashboard-domain.example

docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

For the systemd deployment (`install_systemd.sh`), set the same variables in
`<repo-root>/.env`, which the generated unit file already loads via `EnvironmentFile=`.
