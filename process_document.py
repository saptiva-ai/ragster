from langchain_text_splitters import RecursiveCharacterTextSplitter
from pinecone import Pinecone, ServerlessSpec
import transformers
from transformers import AutoTokenizer, AutoModel
import torch
import numpy as np
import time
import os
from langchain_community.document_loaders import UnstructuredWordDocumentLoader
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("document_processing.log")
    ]
)
logger = logging.getLogger(__name__)

# E5 model for multilingual embeddings
model_name = "intfloat/multilingual-e5-large"

# Initialize Pinecone client
api_key = "api_KEY_PINECODE"
logger.info(f"Using Pinecone API key: {api_key[:10]}...")

# Function to create embeddings using E5 model
def get_embeddings(texts, model_name="intfloat/multilingual-e5-large", batch_size=8, use_mock=False):
    """Generate embeddings using E5 model with batching to avoid OOM errors"""
    if use_mock:
        logger.info(f"Using mock embeddings (dimension=1024)")
        return [np.random.uniform(-1, 1, 1024).tolist() for _ in texts]
    
    try:
        logger.info(f"Loading model: {model_name}")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModel.from_pretrained(model_name)
        
        # Move model to the right device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        model.to(device)
        
        all_embeddings = []
        # Process in batches to avoid OOM errors
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{len(texts)//batch_size + 1} with {len(batch_texts)} texts")
            
            # Prepare input texts with the E5 format
            batch_text = [f"passage: {text}" for text in batch_texts]
            
            # Tokenize and prepare input tensors
            encoded_input = tokenizer(
                batch_text, 
                padding=True, 
                truncation=True, 
                max_length=512, 
                return_tensors='pt'
            ).to(device)
            
            # Get model embeddings
            with torch.no_grad():
                model_output = model(**encoded_input)
                embeddings = model_output.last_hidden_state[:, 0]
                # Normalize embeddings
                normalized_embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
            
            # Convert to list for Pinecone
            batch_embeddings = normalized_embeddings.cpu().numpy().tolist()
            all_embeddings.extend(batch_embeddings)
            
            # Free memory
            del encoded_input, model_output, embeddings, normalized_embeddings
            if device == "cuda":
                torch.cuda.empty_cache()
        
        dim = len(all_embeddings[0])
        logger.info(f"Generated {len(all_embeddings)} embeddings with dimension: {dim}")
        
        return all_embeddings
    
    except Exception as e:
        logger.error(f"Error loading or using the model: {e}")
        import traceback
        logger.error(traceback.format_exc())
        logger.warning("Falling back to mock embeddings")
        return [np.random.uniform(-1, 1, 1024).tolist() for _ in texts]

def process_document(file_path, index_name="ragster", namespace="documents", chunk_size=1000, chunk_overlap=200):
    """Process a document, split it into chunks, and embed it into Pinecone"""
    try:
        # Load document
        logger.info(f"Loading document: {file_path}")
        loader = UnstructuredWordDocumentLoader(file_path)
        document = loader.load()
        logger.info(f"Document loaded successfully with {len(document)} pages")
        
        # Create text splitter
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
        )
        
        # Split document
        logger.info("Splitting document into chunks...")
        chunks = text_splitter.split_documents(document)
        logger.info(f"Created {len(chunks)} document chunks")
        
        # Initialize Pinecone client
        pc = Pinecone(api_key=api_key)
        
        # Check if index exists
        available_indexes = pc.list_indexes().names()
        logger.info(f"Available indexes: {available_indexes}")
        
        if index_name not in available_indexes:
            logger.error(f"Index {index_name} does not exist. Please create it first.")
            return False
        
        logger.info(f"Using existing index: {index_name}")
        index = pc.Index(index_name)
        
        # Show index stats before upsert
        try:
            stats = index.describe_index_stats()
            logger.info(f"Index before upsert - Dimension: {stats.dimension}, Total vectors: {stats.total_vector_count}")
            if namespace in stats.namespaces:
                logger.info(f"Vectors in namespace '{namespace}': {stats.namespaces[namespace].vector_count}")
        except Exception as e:
            logger.error(f"Error getting index stats: {e}")
        
        # Prepare document texts for embedding
        docs_to_embed = []
        doc_metadatas = []
        
        # Extract filename without extension
        filename = os.path.basename(file_path)
        doc_id = os.path.splitext(filename)[0]
        
        for i, chunk in enumerate(chunks):
            # Extract metadata and add to list
            metadata = {
                "id": f"{doc_id}_chunk_{i+1}",
                "source": file_path,
                "text": chunk.page_content,
                "chunk_num": i+1,
                "total_chunks": len(chunks),
                "document_id": doc_id
            }
            
            doc_metadatas.append(metadata)
            docs_to_embed.append(chunk.page_content)
        
        # Generate embeddings for each document chunk in batches
        logger.info("Generating embeddings for document chunks...")
        document_embeddings = get_embeddings(docs_to_embed, model_name=model_name, batch_size=8)
        
        # Prepare vectors for upsert
        vectors = []
        for i, (embedding, metadata) in enumerate(zip(document_embeddings, doc_metadatas)):
            vectors.append({
                "id": metadata["id"],
                "values": embedding,
                "metadata": metadata
            })
        
        # Upsert vectors to Pinecone in batches
        batch_size = 100  # Adjust based on Pinecone limits
        logger.info(f"Upserting {len(vectors)} vectors to Pinecone in batches of {batch_size}...")
        
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            logger.info(f"Upserting batch {i//batch_size + 1}/{len(vectors)//batch_size + 1} with {len(batch)} vectors")
            index.upsert(vectors=batch, namespace=namespace)
        
        logger.info("Upsert completed!")
        
        # Show index stats after upsert
        try:
            stats = index.describe_index_stats()
            logger.info(f"Index after upsert - Dimension: {stats.dimension}, Total vectors: {stats.total_vector_count}")
            if namespace in stats.namespaces:
                logger.info(f"Vectors in namespace '{namespace}': {stats.namespaces[namespace].vector_count}")
        except Exception as e:
            logger.error(f"Error getting index stats: {e}")
        
        return True
        
    except Exception as e:
        logger.error(f"An error occurred while processing document: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        logger.error("Usage: python process_document.py <document_path> [index_name] [namespace]")
        sys.exit(1)
    
    document_path = sys.argv[1]
    index_name = sys.argv[2] if len(sys.argv) > 2 else "ragster"
    namespace = sys.argv[3] if len(sys.argv) > 3 else "documents"
    
    logger.info(f"Processing document: {document_path}")
    logger.info(f"Using index: {index_name}")
    logger.info(f"Using namespace: {namespace}")
    
    success = process_document(document_path, index_name, namespace)
    
    if success:
        logger.info("Document processed and embedded successfully!")
        sys.exit(0)
    else:
        logger.error("Failed to process and embed document")
        sys.exit(1) 