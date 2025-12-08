# RAGster - Plataforma de Procesamiento de Documentos y Búsqueda Vectorial

Una aplicación web moderna construida con Next.js para procesar documentos, generar embeddings y realizar búsquedas semánticas usando bases de datos vectoriales.

## Características

- 📄 **Soporte Multi-formato de Documentos**

  - Procesa formatos TXT, PDF, DOCX y otros
  - Extracción automática de texto y segmentación
  - Soporte para documentos grandes con procesamiento eficiente

- 🔍 **Capacidades de Búsqueda Avanzada**

  - Búsqueda semántica usando embeddings vectoriales
  - Soporte multilingüe con modelo E5

- 🛠️ **Stack Tecnológico Moderno**
  - Next.js 15 con TypeScript
  - React 19
  - TailwindCSS para estilos
  - MongoDB para almacenamiento de datos
  - LangChain para procesamiento de documentos

- 💬 **Integración WhatsApp Business**
  - Chatbot RAG automático que responde usando documentos vectorizados
  - Gestión de conversaciones y leads desde MongoDB
  - Configuración simple desde panel Settings
  - Comando `reset` para reiniciar conversaciones

## 🚀 Inicio Rápido

```bash
git clone https://github.com/saptiva-ai/ragster-weaviate.git
cd ragster-weaviate
# Configura tu .env (ver sección Comenzando)
docker-compose up --build
```

La aplicación estará disponible en `http://localhost:3001`


## Gestión de Base de Datos Vectorial

### Integración con Weaviate

- **Almacenamiento de Embeddings**

  - Almacena y gestiona embeddings de documentos en Weaviate
  - Generación automática de esquemas para diferentes tipos de documentos
  - Búsqueda y recuperación vectorial eficiente

- **Gestión de Embeddings**

  - Ver y modificar embeddings existentes
  - Capacidades de actualización en lote
  - Control de versiones de embeddings
  - Actualizaciones de embeddings en tiempo real

- **Búsqueda y Consulta**
  - Búsqueda semántica en todos los embeddings almacenados
  - Búsqueda híbrida combinando búsqueda vectorial y por palabras clave
  - Métricas de similitud personalizables
  - Capacidades de filtrado y ordenamiento

### Configuración del Entorno

Weaviate se configura automáticamente con Docker Compose. No requiere configuración adicional.

## Comenzando

### Prerrequisitos

- Docker y Docker Compose ([descargar](https://www.docker.com/products/docker-desktop/))
- API key de Saptiva

### Instalación con Docker

Docker Compose incluye MongoDB y Weaviate localmente, sin necesidad de servicios externos.

1. Clona el repositorio:

```bash
git clone https://github.com/saptiva-ai/ragster-weaviate.git
cd ragster-weaviate
```

2. **Obtén tu API key de Saptiva:**
   - Visita [lab.saptiva.com](https://lab.saptiva.com/)
   - Inicia sesión → Crear API Key → Copiar key (comienza con `va-ai-`)

3. Crea un archivo `.env` con las variables requeridas:

```env
# --- REQUIRED: Saptiva API ---
SAPTIVA_API_KEY=va-ai-tu_api_key_aqui
SAPTIVA_API_BASE_URL=https://api.saptiva.com
EMBEDDING_API_URL=https://api.saptiva.com/api/embeddings

# --- REQUIRED: NextAuth ---
NEXTAUTH_SECRET=<SECRET DE NextAuth>
NEXTAUTH_URL=http://localhost:3001

# --- OPTIONAL: Chat API ---
NEXT_PUBLIC_CHAT_API=https://api.saptiva.com/v1/chat/completions

# --- AUTO-CONFIGURED (Docker sets these) ---
# MONGODB_URI=mongodb://mongo:27017/test
# MONGODB_DB=test
# WEAVIATE_HOST=weaviate:8080
```

4. Ejecuta con Docker Compose:

```bash
docker-compose up --build
```

La aplicación estará disponible en `http://localhost:3001`

> **Nota:** MongoDB y Weaviate se configuran automáticamente dentro de Docker. No necesitas instalar ni configurar estos servicios externamente.

## Estructura del Proyecto

```
RAGster/
├── src/              # Código fuente
├── public/           # Archivos estáticos
└── package.json     # Dependencias del proyecto
```

## Comandos Docker

- `docker-compose up --build` - Construir e iniciar todos los servicios
- `docker-compose up` - Iniciar servicios (sin reconstruir)
- `docker-compose down` - Detener todos los servicios
- `docker-compose logs -f ragster` - Ver logs de la aplicación

## Dependencias

### Dependencias Principales

- Next.js 15
- React 19
- TypeScript
- TailwindCSS
- MongoDB
- LangChain

### Procesamiento de Documentos

- pdf-parse
- mammoth
- docx-parser
- @xenova/transformers

## Contribuyendo

1. Fork el repositorio
2. Crea tu rama de características (`git checkout -b feature/CaracteristicaIncreible`)
3. Confirma tus cambios (`git commit -m 'Agregar alguna CaracteristicaIncreible'`)
4. Push a la rama (`git push origin feature/CaracteristicaIncreible`)
5. Abre un Pull Request

## Licencia

Este proyecto está licenciado bajo la Licencia Apache 2.0 - ver el archivo [LICENSE](LICENSE) para más detalles.
