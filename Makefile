# Makefile for Ragster Project

.PHONY: help up down build logs shell clean

# Default target
help:
	@echo "Available commands:"
	@echo "  make up      - Start all services in background"
	@echo "  make down    - Stop and remove all services"
	@echo "  make build   - Rebuild docker images"
	@echo "  make logs    - View logs from all services"
	@echo "  make shell   - Enter the ragster app container shell"
	@echo "  make clean   - Stop services and remove volumes (WARNING: deletes data)"

up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build

logs:
	docker-compose logs -f

shell:
	docker-compose exec ragster sh

clean:
	docker-compose down -v
