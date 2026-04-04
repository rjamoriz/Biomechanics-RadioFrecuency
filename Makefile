.PHONY: setup dev lint format test db-up db-down web gateway backend ml flash-rx flash-tx demo clean

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
	DEMO_MODE=true $(MAKE) dev

clean:
	rm -rf apps/web/.next apps/web/node_modules
	rm -rf apps/gateway/dist apps/gateway/node_modules
	rm -rf apps/backend/build
	rm -rf ml/.venv
