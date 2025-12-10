# Ragster - Simple Commands
# No magic, explicit control

.PHONY: help local cloud down logs clean build

help:
	@echo ""
	@echo "  make local   Start ALL (App + Mongo + Weaviate)"
	@echo "  make cloud   Start ONLY App (uses cloud DBs)"
	@echo "  make down    Stop everything"
	@echo "  make logs    View logs"
	@echo "  make clean   Stop and delete all data"
	@echo "  make build   Rebuild containers"
	@echo ""

local:
	@echo ">>> Starting LOCAL mode (App + Mongo + Weaviate)"
	docker-compose --profile local up -d

cloud:
	@echo ">>> Starting CLOUD mode (App only)"
	docker-compose up -d

down:
	docker-compose --profile local down

logs:
	docker-compose logs -f

clean:
	docker-compose --profile local down -v

build:
	docker-compose build
