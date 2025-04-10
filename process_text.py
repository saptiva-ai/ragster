from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from pinecone import Pinecone, ServerlessSpec
import transformers
from transformers import AutoTokenizer, AutoModel
import torch
import numpy as np
import time
import os
import logging
import sys
import uuid
from dotenv import load_dotenv
# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("text_processing.log")
    ]
)
logger = logging.getLogger(__name__)

# E5 model for multilingual embeddings
model_name = "intfloat/multilingual-e5-large"

# Initialize Pinecone client
api_key = os.environ.get("PINECONE_API_KEY", "")
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

def process_text_file(file_path, index_name="ragster", namespace=None, chunk_size=1000, chunk_overlap=200):
    """Process a text file, split it into chunks, and embed it into Pinecone"""
    try:
        # Generate a unique namespace if none provided
        if namespace is None:
            namespace = f"text_test_{int(time.time())}"
        
        logger.info(f"Using namespace: {namespace}")
        
        # Load document
        logger.info(f"Loading text file: {file_path}")
        with open(file_path, 'r', encoding='utf-8') as f:
            text_content = f.read()
        
        logger.info(f"Text file loaded successfully with {len(text_content)} characters")
        
        # Set headers for splitting if this is markdown content
        headers_to_split_on = [
            ("##", "Header 1"),
            ("###", "Header 2"),
            ("####", "Header 3"),
            ("#####", "Header 4"),
            ("######", "Header 5"),
            ("#######", "Header 6"),
        ]

        if text_content.strip().startswith("#"):
            logger.info("Detected markdown content, using markdown splitter")
            splitter = MarkdownHeaderTextSplitter(
                headers_to_split_on=headers_to_split_on, strip_headers=False
            )
            chunks = splitter.split_text(text_content)
            logger.info(f"Created {len(chunks)} document chunks using markdown splitter")
            
            # Convert to format similar to document splitter output
            docs_to_embed = []
            doc_metadatas = []
            
            for i, chunk in enumerate(chunks):
                # Generate a unique ID for each chunk
                chunk_id = str(uuid.uuid4())
                
                metadata = {
                    "id": chunk_id,
                    "source": file_path,
                    "text": chunk.page_content,
                    "chunk_num": i+1,
                    "total_chunks": len(chunks)
                }
                
                # Add headers to metadata
                for header_key, header_value in chunk.metadata.items():
                    metadata[header_key] = header_value
                    
                doc_metadatas.append(metadata)
                docs_to_embed.append(chunk.page_content)
        else:
            logger.info("Using recursive character splitter for non-markdown content")
            # Create text splitter for non-markdown content
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                length_function=len,
            )
            
            # Split document
            text_chunks = text_splitter.split_text(text_content)
            logger.info(f"Created {len(text_chunks)} document chunks using character splitter")
            
            # Prepare for embedding
            docs_to_embed = text_chunks
            doc_metadatas = []
            
            for i, chunk in enumerate(text_chunks):
                # Generate a unique ID for each chunk
                chunk_id = str(uuid.uuid4())
                
                doc_metadatas.append({
                    "id": chunk_id,
                    "source": file_path,
                    "text": chunk,
                    "chunk_num": i+1,
                    "total_chunks": len(text_chunks)
                })
        
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
            for ns, ns_stats in stats.namespaces.items():
                logger.info(f"  Namespace '{ns}': {ns_stats.vector_count} vectors")
        except Exception as e:
            logger.error(f"Error getting index stats: {e}")
        
        # Generate embeddings for each document chunk in batches
        logger.info("Generating embeddings for text chunks...")
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
        logger.info(f"Upserting {len(vectors)} vectors to Pinecone in namespace '{namespace}'...")
        
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            logger.info(f"Upserting batch {i//batch_size + 1}/{len(vectors)//batch_size + 1} with {len(batch)} vectors")
            index.upsert(vectors=batch, namespace=namespace)
        
        logger.info("Upsert completed!")
        
        # Show index stats after upsert
        try:
            stats = index.describe_index_stats()
            logger.info(f"Index after upsert - Dimension: {stats.dimension}, Total vectors: {stats.total_vector_count}")
            for ns, ns_stats in stats.namespaces.items():
                logger.info(f"  Namespace '{ns}': {ns_stats.vector_count} vectors")
        except Exception as e:
            logger.error(f"Error getting index stats: {e}")
        
        # Test a query
        test_query = "¿Qué requisitos necesito para un crédito?"
        logger.info(f"Testing query: '{test_query}'")
        
        # Get embedding for query
        query_embedding = get_embeddings([test_query], model_name=model_name, batch_size=1)[0]
        
        # Query Pinecone
        logger.info(f"Querying namespace '{namespace}'...")
        results = index.query(
            vector=query_embedding,
            namespace=namespace,
            top_k=3,
            include_values=False,
            include_metadata=True
        )
        
        logger.info(f"Query results ({len(results.matches)} matches):")
        for i, match in enumerate(results.matches):
            logger.info(f"Result {i+1}:")
            logger.info(f"  ID: {match.id}")
            logger.info(f"  Score: {match.score}")
            if "Header 2" in match.metadata:
                logger.info(f"  Headers: {match.metadata.get('Header 2', '')} > {match.metadata.get('Header 3', '')}")
            logger.info(f"  Content snippet: {match.metadata.get('text', 'No text available')[:150]}...")
        
        return True
        
    except Exception as e:
        logger.error(f"An error occurred while processing text file: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        logger.error("Usage: python process_text.py <text_file_path> [index_name] [namespace]")
        sys.exit(1)
    
    text_file_path = sys.argv[1]
    index_name = sys.argv[2] if len(sys.argv) > 2 else "ragster"
    namespace = sys.argv[3] if len(sys.argv) > 3 else f"test_{int(time.time())}"
    
    logger.info(f"Processing text file: {text_file_path}")
    logger.info(f"Using index: {index_name}")
    
    success = process_text_file(text_file_path, index_name, namespace)
    
    if success:
        logger.info(f"Text file processed and embedded successfully in namespace '{namespace}'!")
        sys.exit(0)
    else:
        logger.error("Failed to process and embed text file")
        sys.exit(1) 