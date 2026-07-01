# HMEAYC Deployment

This directory contains deployment configurations for the HMEAYC system.

## Options

- `docker-compose.prod.yml` — Production Docker Compose override with resource limits and restart policies.
- `install_systemd.sh` — Script to register the backend as a systemd service (for bare-metal or VM deployments).
