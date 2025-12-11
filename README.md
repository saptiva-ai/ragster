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

## Requisitos

- **Docker Desktop** - [Descargar aquí](https://www.docker.com/products/docker-desktop/)
- **API Key de Saptiva** - [Obtener en lab.saptiva.com](https://lab.saptiva.com/)

## 🚀 Inicio Rápido

```bash
git clone https://github.com/saptiva-ai/ragster-weaviate.git
cd ragster-weaviate
cp .env.example .env
# Edita .env con tu API key de Saptiva
docker-compose --profile local up -d    # Local (todo en Docker)
# o
docker-compose up -d                    # Cloud (solo app, DBs en la nube)
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

# AUTH (requerido) - genera con: openssl rand -base64 32
NEXTAUTH_SECRET=genera-un-secreto-aleatorio

# MONGODB (Docker local por defecto, cambiar para cloud)
MONGODB_URI=mongodb://mongo:27017/ragster
# Para cloud: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
# MONGODB_DB_NAME=ragster  # Required for cloud if URI doesn't include DB name

# WEAVIATE (vacío = local Docker, con valor = cloud)
# WEAVIATE_CLOUD=true
# WEAVIATE_HOST=tu-cluster.weaviate.cloud
# WEAVIATE_API_KEY=tu-api-key
```

### 3. Ejecuta

```bash
docker-compose --profile local up -d    # Local (App + Mongo + Weaviate)
# o
docker-compose up -d                    # Cloud (Solo App, DBs en la nube)
```

## Quiero correr LOCAL (desarrollo)

Todo corre en Docker en tu máquina. No necesitas cuentas externas (excepto Saptiva API).

**Tu `.env`:**
```env
# SAPTIVA API (requerido)
SAPTIVA_API_KEY=va-ai-tu-api-key
SAPTIVA_API_BASE_URL=https://api.saptiva.com
EMBEDDING_API_URL=https://api.saptiva.com/api/embed
NEXT_PUBLIC_CHAT_API=https://api.saptiva.com/v1/chat/completions

# AUTH (requerido) - genera con: openssl rand -base64 32
NEXTAUTH_SECRET=cualquier-texto-secreto-aqui

# MONGODB - Docker local
MONGODB_URI=mongodb://mongo:27017/ragster

# WEAVIATE - Docker local (no necesitas poner nada más)
```

**Ejecutar:**
```bash
docker-compose --profile local up -d
```

Listo. Abre `http://localhost:3001`

---

## Quiero correr en CLOUD (producción)

Necesitas cuentas en MongoDB Atlas y Weaviate Cloud.

### Paso 1: Crear cuenta en MongoDB Atlas
1. Ve a [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Crea un cluster gratuito
3. Copia tu connection string → lo pegarás en `MONGODB_URI`

### Paso 2: Crear cuenta en Weaviate Cloud
1. Ve a [console.weaviate.cloud](https://console.weaviate.cloud)
2. Crea un cluster gratuito (sandbox)
3. Copia tu **Cluster URL** → lo pegarás en `WEAVIATE_HOST`
4. Copia tu **API Key** → lo pegarás en `WEAVIATE_API_KEY`

### Paso 3: Tu `.env`
```env
# SAPTIVA API (requerido)
SAPTIVA_API_KEY=va-ai-tu-api-key
SAPTIVA_API_BASE_URL=https://api.saptiva.com
EMBEDDING_API_URL=https://api.saptiva.com/api/embed
NEXT_PUBLIC_CHAT_API=https://api.saptiva.com/v1/chat/completions

# AUTH (requerido) - genera con: openssl rand -base64 32
NEXTAUTH_SECRET=un-secreto-largo-y-seguro-para-produccion
NEXTAUTH_URL=https://tu-dominio.com

# MONGODB - Cloud Atlas
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/
MONGODB_DB_NAME=ragster

# WEAVIATE - Cloud
WEAVIATE_CLOUD=true
WEAVIATE_HOST=tu-cluster.weaviate.cloud
WEAVIATE_API_KEY=tu-api-key-de-weaviate
```

**Ejecutar:**
```bash
docker-compose up -d
```

---

## ¿Por qué Weaviate local y cloud se configuran diferente?

| | Local (Docker) | Cloud (WCS) |
|---|---|---|
| **WEAVIATE_HOST** | **Dejar vacío** (Docker usa `weaviate` automáticamente) | `tu-cluster.weaviate.cloud` |
| **WEAVIATE_CLOUD** | No poner (es `false` por defecto) | `true` |
| **WEAVIATE_API_KEY** | No necesaria | Tu API key de Weaviate |
| **Conexión interna** | `http://weaviate:8080` (dentro de Docker) | `https://tu-cluster.weaviate.cloud` |

**Nota técnica:** Si no defines `WEAVIATE_HOST`, Docker Compose asigna automáticamente el nombre del servicio (`weaviate`). No se recomienda correr fuera de Docker.

**¿Por qué?**
- **Local:** Corre en Docker junto a la app, usa HTTP puerto 8080
- **Cloud:** Está en internet, usa HTTPS y necesita autenticación

## Desarrollo sin Docker (no recomendado)

> **No recomendado.** Usa Docker. Es más fácil y evita problemas de configuración.

Si aún así quieres correr sin Docker, necesitas instalar Weaviate y MongoDB manualmente.

```bash
npm install
npm run dev
```

El código buscará en `localhost` automáticamente:
- MongoDB: `localhost:27017`
- Weaviate: `localhost:8080`

## Comandos

| Escenario | Comando |
|-----------|---------|
| **Local** (App + Mongo + Weaviate) | `docker-compose --profile local up -d` |
| **Cloud** (Solo App) | `docker-compose up -d` |
| Detener | `docker-compose --profile local down` |
| Ver logs | `docker-compose logs -f` |
| Borrar datos | `docker-compose --profile local down -v` |
| Reconstruir | `docker-compose --profile local up -d --build` |

**Importante:** Después de cambiar `.env`, reinicia con:
```bash
docker-compose --profile local down
docker-compose --profile local up -d   # o sin --profile para cloud
```

---

## Atajos con Make (Linux/Mac/Windows)

Si tienes `make` instalado, puedes usar estos comandos simplificados:

| Comando | Equivalente |
|---------|-------------|
| `make local` | Iniciar TODO (App + Mongo + Weaviate) |
| `make cloud` | Iniciar solo App (DBs en la nube) |
| `make down` | Detener todo |
| `make logs` | Ver logs |
| `make clean` | Detener y borrar datos |
| `make build` | Reconstruir contenedores |

<details>
<summary><strong>Instalar Make en Windows</strong></summary>

> Ejecuta PowerShell como **Administrador**

**Opción 1: Chocolatey (recomendado)**
1. Instala Chocolatey siguiendo la [guía oficial](https://chocolatey.org/install)
2. Luego ejecuta:
```powershell
choco install make
```

**Opción 2: winget** (ya viene en Windows 10/11)
```powershell
winget install GnuWin32.Make
```

**Opción 3: Git Bash**
Si tienes Git instalado, usa Git Bash - ya incluye make.

</details>

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
