# Pinecone Embedding Solution with Multilingual E5 Model

This repository contains a solution for embedding documents in multiple languages using the `multilingual-e5-large` model and storing them in Pinecone vector database.

## Problem Solved

The original code was facing a `PineconeBadRequestError` when attempting to generate embeddings for document chunks. This was because:

1. The code was trying to use a different embedding model than the one the Pinecone index was configured for
2. There were dimension mismatches between the embeddings and the index
3. There were issues with the proper initialization and usage of the embedding model

## Solution

Our solution uses the following components:

1. **E5 Multilingual Model**: Uses the `intfloat/multilingual-e5-large` model directly through Hugging Face Transformers
2. **Batched Processing**: Processes documents in batches to avoid out-of-memory errors
3. **Proper Text Formatting**: Formats input texts with the "passage:" prefix as required by E5 models
4. **Vector Normalization**: Properly normalizes embeddings before storing them in Pinecone
5. **Error Handling**: Includes comprehensive error handling and fallbacks

## Key Files

- `final_embedding_solution.py`: Complete solution for processing documents and storing embeddings
- `custom_query.py`: Tool for querying vectors stored in Pinecone
- `process_text.py`: Simplified script for processing text files
- `process_document.py`: Script for processing Word documents

## Usage

### Processing a Document

```bash
python final_embedding_solution.py <document_path> --index_name <index> --namespace <namespace>
```

### Querying Vectors

```bash
python custom_query.py "Your query text" --index_name <index> --namespace <namespace>
```

## Requirements

- Python 3.8+
- transformers
- torch
- pinecone-client
- langchain-text-splitters (optional)
- langchain-community (optional)
- unstructured (for docx files)
- pypdf (for pdf files)

## Implementation Details

### Embedding Process

1. Load document from file (supports txt, md, docx, pdf)
2. Split document into manageable chunks
3. Initialize the E5 model (`intfloat/multilingual-e5-large`)
4. Format text inputs with "passage:" prefix
5. Generate embeddings in batches
6. Normalize embeddings to unit length
7. Store embeddings in Pinecone with metadata

### Query Process

1. Convert query to embedding using the same model and process
2. Query Pinecone index with the embedding
3. Return and display matching results with scores

## Tips for Avoiding Errors

1. Make sure your Pinecone index dimension matches your embedding model (1024 for multilingual-e5-large)
2. Use batching for large documents to avoid memory issues
3. Always normalize embeddings before storing or querying
4. Use unique IDs for document chunks
5. Store appropriate metadata with vectors for context
6. Use namespaces to organize and isolate different document sets
7. Handle model loading errors with appropriate fallbacks
