# RAGster - Plataforma de Procesamiento de Documentos y Búsqueda Vectorial

Una aplicación web moderna construida con Next.js para procesar documentos, generar embeddings y realizar búsquedas semánticas usando bases de datos vectoriales.

## Características

- 📄 **Soporte Multi-formato de Documentos**
  - Procesa formatos TXT, PDF, DOCX y otros
  - Extracción automática de texto y segmentación

- 🔍 **Búsqueda Semántica**
  - Búsqueda usando embeddings vectoriales
  - Soporte multilingüe

- 🛠️ **Stack Tecnológico**
  - Next.js 15 + React 19 + TypeScript
  - MongoDB (local o cloud)
  - Weaviate (local o cloud)

- 💬 **Integración WhatsApp Business**
  - Chatbot RAG automático
  - Gestión de conversaciones y leads

## 🚀 Inicio Rápido

```bash
git clone https://github.com/saptiva-ai/ragster-weaviate.git
cd ragster-weaviate
cp .env.example .env
# Edita .env con tu API key de Saptiva
docker-compose up -d
```

Abre `http://localhost:3001`

## Configuración

### 1. Obtén tu API key de Saptiva
- Visita [lab.saptiva.com](https://lab.saptiva.com/)
- Inicia sesión → Crear API Key → Copiar (comienza con `va-ai-`)

### 2. Configura tu archivo `.env`

```env
# SAPTIVA API (requerido)
SAPTIVA_API_KEY=va-ai-tu-api-key
SAPTIVA_API_BASE_URL=https://api.saptiva.com
EMBEDDING_API_URL=https://api.saptiva.com/api/embed
NEXT_PUBLIC_CHAT_API=https://api.saptiva.com/v1/chat/completions

# AUTH (requerido)
NEXTAUTH_SECRET=genera-un-secreto-aleatorio

# MONGODB (Docker local por defecto, cambiar para cloud)
MONGODB_URI=mongodb://mongo:27017/ragster
# Para cloud: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/tu-database

# WEAVIATE (vacío = local Docker, con valor = cloud)
# WEAVIATE_CLOUD=true
# WEAVIATE_HOST=tu-cluster.weaviate.cloud
# WEAVIATE_API_KEY=tu-api-key
```

### 3. Ejecuta

```bash
docker-compose up -d
```

## Local vs Cloud - ¿Cómo funciona?

El sistema detecta automáticamente si usar servicios locales o cloud basándose en tu `.env`:

| Servicio | `.env` vacío | `.env` con valor |
|----------|--------------|------------------|
| MongoDB | Docker local (automático) | MongoDB Atlas (cloud) |
| Weaviate | Docker local (automático) | Weaviate Cloud |

**Ejemplos:**

**Todo local (desarrollo):**
```env
# Saptiva API y NEXTAUTH_SECRET son requeridos
# MongoDB y Weaviate usan Docker local
MONGODB_URI=mongodb://mongo:27017/ragster
```

**MongoDB local + Weaviate cloud:**
```env
WEAVIATE_CLOUD=true
WEAVIATE_HOST=tu-cluster.weaviate.cloud
WEAVIATE_API_KEY=tu-api-key
```

**Todo cloud (producción):**
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ragster
WEAVIATE_CLOUD=true
WEAVIATE_HOST=tu-cluster.weaviate.cloud
WEAVIATE_API_KEY=tu-api-key
```

## Comandos Docker

| Comando | Descripción |
|---------|-------------|
| `docker-compose up -d` | Iniciar servicios |
| `docker-compose down` | Detener servicios |
| `docker-compose logs -f ragster` | Ver logs |
| `docker-compose down -v` | Detener y borrar datos |
| `docker-compose up -d --build` | Reconstruir después de cambios en código |

**Importante:** Después de cambiar `.env`, reinicia con:
```bash
docker-compose down
docker-compose up -d
```

## Estructura del Proyecto

```
ragster-weaviate/
├── src/              # Código fuente
├── public/           # Archivos estáticos
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── package.json
```

## Contribuyendo

1. Fork el repositorio
2. Crea tu rama de características (`git checkout -b feature/CaracteristicaIncreible`)
3. Confirma tus cambios (`git commit -m 'Agregar alguna CaracteristicaIncreible'`)
4. Push a la rama (`git push origin feature/CaracteristicaIncreible`)
5. Abre un Pull Request

## Licencia

Apache 2.0 - ver [LICENSE](LICENSE)
