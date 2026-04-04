.PHONY: setup dev lint format test db-up db-down web gateway backend ml flash-rx flash-tx demo clean docker-build docker-up docker-down health

setup:
	@echo "==> Copying .env.example to .env if missing"
	@test -f .env || cp .env.example .env
	@echo "==> Installing web dependencies"
	cd apps/web && npm install
	@echo "==> Installing gateway dependencies"
	cd apps/gateway && npm install
	@echo "==> Installing shared-types dependencies"
	cd packages/shared-types && npm install
	@echo "==> Setup complete"

dev:
	@echo "==> Starting all services in dev mode"
	docker compose up -d postgres
	@sleep 3
	$(MAKE) backend &
	$(MAKE) gateway &
	$(MAKE) web &
	@wait

db-up:
	docker compose up -d postgres

db-down:
	docker compose down -v

web:
	cd apps/web && npm run dev

gateway:
	cd apps/gateway && npm run start:dev

backend:
	cd apps/backend && ./gradlew bootRun

ml:
	cd ml && python -m src.training.train_proxy

lint:
	cd apps/web && npm run lint
	cd apps/gateway && npm run lint

format:
	cd apps/web && npx prettier --write "src/**/*.{ts,tsx}"
	cd apps/gateway && npx prettier --write "src/**/*.ts"

test:
	cd apps/web && npm test
	cd apps/gateway && npm test
	cd apps/backend && ./gradlew test

flash-rx:
	cd firmware/rx_csi_collector && idf.py build flash monitor

flash-tx:
	cd firmware/tx_ap && idf.py build flash monitor

demo:
	@echo "==> Starting demo mode (gateway + web)"
	DEMO_MODE=true $(MAKE) gateway &
	$(MAKE) web &
	@wait

demo-gateway:
	cd apps/gateway && DEMO_MODE=true npm run start:dev

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

health:
	@echo "==> Gateway health"
	@curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || echo "Gateway not reachable"
	@echo "\n==> Backend health"
	@curl -s http://localhost:8080/actuator/health | python3 -m json.tool 2>/dev/null || echo "Backend not reachable"

sensing:
	@echo "==> Latest sensing data"
	@curl -s http://localhost:3001/api/v1/sensing/latest | python3 -m json.tool 2>/dev/null || echo "Gateway not reachable"

vitals:
	@echo "==> Vital signs estimates"
	@curl -s http://localhost:3001/api/v1/sensing/vital-signs | python3 -m json.tool 2>/dev/null || echo "Gateway not reachable"

clean:
	rm -rf apps/web/.next apps/web/node_modules
	rm -rf apps/gateway/dist apps/gateway/node_modules
	rm -rf apps/backend/build
	rm -rf ml/.venv
