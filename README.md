# ragster - Document Processing and Vector Search Platform

A modern web application built with Next.js for processing documents, generating embeddings, and performing semantic search using vector databases.

## Features

- 📄 **Multi-format Document Support**

  - Process TXT, PDF, DOCX, and other document formats
  - Automatic text extraction and chunking
  - Support for large documents with efficient processing

- 🔍 **Advanced Search Capabilities**

  - Semantic search using vector embeddings
  - Multilingual support with E5 model

- 🛠️ **Modern Tech Stack**
  - Next.js 15 with TypeScript
  - React 19
  - TailwindCSS for styling
  - MongoDB for data storage
  - LangChain for document processing

## Vector Database Management

### Weaviate Integration

- **Embedding Storage**

  - Store and manage document embeddings in Weaviate
  - Automatic schema generation for different document types
  - Efficient vector search and retrieval

- **Embedding Management**

  - View and modify existing embeddings
  - Batch update capabilities
  - Embedding version control
  - Real-time embedding updates

- **Search and Query**
  - Semantic search across all stored embeddings
  - Hybrid search combining vector and keyword search
  - Customizable similarity metrics
  - Filter and sort capabilities

### Environment Setup

Add the following to your `.env.local`:

```env
WEAVIATE_HOST=your_weaviate_host
WEAVIATE_API_KEY=your_weaviate_api_key
```

## Getting Started

### Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- MongoDB ([download](https://www.mongodb.com/try/download/community))
- Saptiva API key
- Weaviate account and API key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/saptiva-ai/ragster-weaviate.git
cd ragster-weaviate
```

2. Install dependencies:

```bash
npm install
```

3. **Get your API keys:**

   **Saptiva API Key:**
   - Visit [lab.saptiva.com](https://lab.saptiva.com/)
   - Sign in → Create API Key → Copy key (starts with `va-ai-`)

   **Weaviate Credentials:**
   - Visit [console.weaviate.cloud](https://console.weaviate.cloud/)
   - Create free cluster → Copy REST Endpoint + API Key

4. Create a `.env.local` file with your environment variables:

```env
# Saptiva API Configuration
SAPTIVA_API_KEY=
SAPTIVA_API_BASE_URL=https://api.saptiva.com
EMBEDDING_API_URL=https://api.saptiva.com/api/embed

# MongoDB Database
MONGODB_URI=
MONGODB_DB=

# Weaviate Vector Database
WEAVIATE_HOST=
WEAVIATE_API_KEY=

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Next.js Configuration
NEXT_PUBLIC_CHAT_API=http://localhost:3000

# WhatsApp Business (Optional)
URL_META=https://graph.facebook.com/v19.0
```

5. Run the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
ragster/
├── src/              # Source code
├── public/           # Static files
└── package.json     # Project dependencies
```

## Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Dependencies

### Core Dependencies

- Next.js 15
- React 19
- TypeScript
- TailwindCSS
- MongoDB
- LangChain

### Document Processing

- pdf-parse
- mammoth
- docx-parser
- @xenova/transformers

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
