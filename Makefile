.PHONY: dev dev-backend dev-dashboard start stop install-backend install-dashboard test lint

dev:
	docker compose up --build

dev-backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

dev-dashboard:
	cd dashboard && npm run dev

start:
	bash start.sh

stop:
	bash stop.sh

install-backend:
	cd backend && pip install -e ".[dev]"

install-dashboard:
	cd dashboard && npm install

test-backend:
	cd backend && python -m pytest

test-dashboard:
	cd dashboard && npm run test

lint-backend:
	cd backend && ruff check .

lint-dashboard:
	cd dashboard && npx tsc --noEmit
