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

### Instalación en 5 Minutos

Sigue nuestra guía paso a paso con configuración automática:

**➡️ [https://saptiva-ai.github.io/ragster/setup5min.html](https://saptiva-ai.github.io/ragster)**

Esta guía incluye:
- ✅ Configuración automática de variables de entorno
- ✅ Obtención de API keys paso a paso
- ✅ Instalación con un solo clic
- ✅ Verificación de funcionamiento

### Instalación Manual

Si prefieres instalación manual, continúa con las instrucciones detalladas más abajo.

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

Agrega lo siguiente a tu `.env.local`:

```env
WEAVIATE_HOST=your_weaviate_host
WEAVIATE_API_KEY=your_weaviate_api_key
```

## Comenzando

### Prerrequisitos

- Node.js >= 20.18.1 ([descargar](https://nodejs.org/))
- MongoDB ([descargar](https://www.mongodb.com/try/download/community))
- API key de Saptiva
- Cuenta y API key de Weaviate

### Instalación

1. Clona el repositorio:

```bash
git clone https://github.com/saptiva-ai/ragster-weaviate.git
cd ragster-weaviate
```

2. Instala las dependencias:

```bash
npm install
```

3. **Obtén tus API keys:**

   **API Key de Saptiva:**
   - Visita [lab.saptiva.com](https://lab.saptiva.com/)
   - Inicia sesión → Crear API Key → Copiar key (comienza con `va-ai-`)

   **Credenciales de Weaviate:**
   - Visita [console.weaviate.cloud](https://console.weaviate.cloud/)
   - Crear cluster gratuito → Copiar REST Endpoint + API Key

4. Crea un archivo `.env.local` con tus variables de entorno:

```env
# Configuración de API Saptiva
SAPTIVA_API_KEY=
SAPTIVA_API_BASE_URL=https://api.saptiva.com
EMBEDDING_API_URL=https://api.saptiva.com/api/embed

# MongoDB
MONGODB_URI=
MONGODB_DB=

# Weaviate
WEAVIATE_HOST=
WEAVIATE_API_KEY=

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Next.js
NEXT_PUBLIC_CHAT_API=http://localhost:3000

# WhatsApp Business (Opcional)
URL_META=https://graph.facebook.com/v19.0
```

5. Ejecuta el servidor de desarrollo:

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## Estructura del Proyecto

```
RAGster/
├── src/              # Código fuente
├── public/           # Archivos estáticos
└── package.json     # Dependencias del proyecto
```

## Scripts Disponibles

- `npm run dev` - Iniciar servidor de desarrollo con Turbopack
- `npm run build` - Construir para producción
- `npm run start` - Iniciar servidor de producción
- `npm run lint` - Ejecutar ESLint

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

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.
