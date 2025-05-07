# ragster - Document Processing and Vector Search Platform

A modern web application built with Next.js for processing documents, generating embeddings, and performing semantic search using vector databases.

## Features

- 📄 **Multi-format Document Support**

  - Process TXT, PDF, DOCX, and other document formats
  - Automatic text extraction and chunking
  - Support for large documents with efficient processing

- 🔍 **Advanced Search Capabilities**

  - Semantic search using vector embeddings
  - Integration with Pinecone vector database
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
WEAVIATE_URL=your_weaviate_url
WEAVIATE_API_KEY=your_weaviate_api_key
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB
- Pinecone account and API key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/saptiva-ai/ragster.git
cd ragster
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file with your environment variables:

```env
MONGODB_URI=your_mongodb_uri
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
```

4. Run the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
ragster/
├── src/              # Source code
├── public/           # Static files
├── Test/            # Test files
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
- Pinecone
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
