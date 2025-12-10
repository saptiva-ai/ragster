# Ragster - Simple Commands

.PHONY: help up down logs clean build

help:
	@echo ""
	@echo "  make up      Start app (auto-detects local vs cloud from .env)"
	@echo "  make down    Stop everything"
	@echo "  make logs    View logs"
	@echo "  make clean   Stop and delete all data"
	@echo "  make build   Rebuild containers"
	@echo ""

up:
	docker-compose --profile local-weaviate up -d

down:
	docker-compose --profile local-weaviate down

logs:
	docker-compose logs -f

clean:
	docker-compose --profile local-weaviate down -v

build:
	docker-compose build
