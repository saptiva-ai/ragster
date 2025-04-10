"""
Pinecone Embedding Solution with E5 Multilingual Model

This script provides a complete solution for:
1. Loading and processing documents (Word, PDF, text)
2. Splitting documents into chunks
3. Generating embeddings using the E5 multilingual model
4. Storing embeddings in Pinecone
5. Querying the vectors with semantic search

Usage:
    python final_embedding_solution.py <document_path> [--index_name INDEX] [--namespace NAMESPACE]
"""

import argparse
import logging
import os
import sys
import time
import uuid
from typing import List, Dict, Any, Optional, Union

import numpy as np
import torch
from pinecone import Pinecone, ServerlessSpec
from transformers import AutoTokenizer, AutoModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("embedding_solution.log")
    ]
)
logger = logging.getLogger(__name__)

class E5Embedder:
    """Class for generating embeddings using the E5 multilingual model"""
    
    def __init__(self, model_name="intfloat/multilingual-e5-large"):
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self.device = None
        self.is_initialized = False
    
    def initialize(self):
        """Load the model and tokenizer"""
        if self.is_initialized:
            return
        
        try:
            logger.info(f"Loading E5 model: {self.model_name}")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModel.from_pretrained(self.model_name)
            
            # Move model to the right device
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Using device: {self.device}")
            self.model.to(self.device)
            self.is_initialized = True
            
        except Exception as e:
            logger.error(f"Error initializing E5 model: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    def generate_embeddings(self, texts: List[str], batch_size=8) -> List[List[float]]:
        """Generate embeddings for a list of texts using batching"""
        self.initialize()
        
        all_embeddings = []
        
        # Process in batches to avoid OOM errors
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{len(texts)//batch_size + 1} with {len(batch_texts)} texts")
            
            # Prepare input texts with the E5 format
            batch_text = [f"passage: {text}" for text in batch_texts]
            
            # Tokenize and prepare input tensors
            encoded_input = self.tokenizer(
                batch_text, 
                padding=True, 
                truncation=True, 
                max_length=512, 
                return_tensors='pt'
            ).to(self.device)
            
            # Get model embeddings
            with torch.no_grad():
                model_output = self.model(**encoded_input)
                embeddings = model_output.last_hidden_state[:, 0]
                # Normalize embeddings
                normalized_embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
            
            # Convert to list for Pinecone
            batch_embeddings = normalized_embeddings.cpu().numpy().tolist()
            all_embeddings.extend(batch_embeddings)
            
            # Free memory
            del encoded_input, model_output, embeddings, normalized_embeddings
            if self.device == "cuda":
                torch.cuda.empty_cache()
        
        dim = len(all_embeddings[0]) if all_embeddings else 0
        logger.info(f"Generated {len(all_embeddings)} embeddings with dimension: {dim}")
        
        return all_embeddings

class DocumentProcessor:
    """Class for loading and processing documents"""
    
    @staticmethod
    def load_document(file_path: str) -> str:
        """Load a document based on its file extension"""
        _, ext = os.path.splitext(file_path)
        ext = ext.lower()
        
        if ext == '.txt' or ext == '.md':
            return DocumentProcessor._load_text_file(file_path)
        elif ext == '.docx':
            return DocumentProcessor._load_docx_file(file_path)
        elif ext == '.pdf':
            return DocumentProcessor._load_pdf_file(file_path)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")
    
    @staticmethod
    def _load_text_file(file_path: str) -> str:
        """Load a text file"""
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    @staticmethod
    def _load_docx_file(file_path: str) -> str:
        """Load a Word file"""
        try:
            # Import here to avoid dependency issues
            from langchain_community.document_loaders import UnstructuredWordDocumentLoader
            loader = UnstructuredWordDocumentLoader(file_path)
            docs = loader.load()
            return "\n\n".join([doc.page_content for doc in docs])
        except ImportError:
            # Fallback to python-docx if langchain is not available
            import docx
            doc = docx.Document(file_path)
            return "\n\n".join([para.text for para in doc.paragraphs if para.text.strip()])
    
    @staticmethod
    def _load_pdf_file(file_path: str) -> str:
        """Load a PDF file"""
        try:
            # Import here to avoid dependency issues
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(file_path)
            docs = loader.load()
            return "\n\n".join([doc.page_content for doc in docs])
        except ImportError:
            # Fallback to pypdf if langchain is not available
            import pypdf
            with open(file_path, 'rb') as file:
                pdf = pypdf.PdfReader(file)
                return "\n\n".join([page.extract_text() for page in pdf.pages if page.extract_text()])
    
    @staticmethod
    def split_text(text: str, chunk_size=1000, chunk_overlap=200) -> List[str]:
        """Split text into chunks using simple paragraph-based approach"""
        try:
            # Try to use LangChain's text splitter if available
            from langchain_text_splitters import RecursiveCharacterTextSplitter
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                length_function=len,
            )
            return splitter.split_text(text)
        except ImportError:
            # Fallback to simple paragraph-based splitting
            import re
            paragraphs = re.split(r'\n\s*\n', text)
            chunks = []
            current_chunk = []
            current_size = 0
            
            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue
                
                para_size = len(para)
                
                if current_size + para_size > chunk_size and current_chunk:
                    chunks.append("\n\n".join(current_chunk))
                    # Keep last paragraph for overlap if it exists
                    overlap_paras = current_chunk[-1:] if chunk_overlap > 0 else []
                    current_chunk = overlap_paras
                    current_size = sum(len(p) for p in current_chunk)
                
                current_chunk.append(para)
                current_size += para_size
            
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
            
            return chunks

class PineconeManager:
    """Class for managing Pinecone operations"""
    
    def __init__(self, api_key):
        self.api_key = api_key
        self.pc = Pinecone(api_key=api_key)
    
    def list_indexes(self) -> List[str]:
        """List available indexes"""
        return self.pc.list_indexes().names()
    
    def create_index(self, index_name: str, dimension: int, metric: str = "cosine") -> bool:
        """Create a new index if it doesn't exist"""
        if index_name in self.list_indexes():
            logger.info(f"Index {index_name} already exists")
            return False
        
        logger.info(f"Creating index: {index_name}, dimension: {dimension}, metric: {metric}")
        self.pc.create_index(
            name=index_name,
            dimension=dimension,
            metric=metric,
            spec=ServerlessSpec(cloud='aws', region='us-east-1')
        )
        # Wait for index to initialize
        time.sleep(10)
        return True
    
    def get_index(self, index_name: str):
        """Get an index by name"""
        if index_name not in self.list_indexes():
            logger.error(f"Index {index_name} does not exist")
            return None
        
        return self.pc.Index(index_name)
    
    def upsert_vectors(self, index, vectors: List[Dict], namespace: str, batch_size: int = 100) -> bool:
        """Upsert vectors to an index in batches"""
        try:
            logger.info(f"Upserting {len(vectors)} vectors to namespace '{namespace}'...")
            
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                logger.info(f"Upserting batch {i//batch_size + 1}/{len(vectors)//batch_size + 1} with {len(batch)} vectors")
                index.upsert(vectors=batch, namespace=namespace)
            
            logger.info("Upsert completed!")
            return True
        
        except Exception as e:
            logger.error(f"Error upserting vectors: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def query_index(self, index, query_vector, namespace: str, top_k: int = 5, 
                   include_metadata: bool = True) -> Any:
        """Query an index with a vector"""
        try:
            logger.info(f"Querying namespace '{namespace}' for top {top_k} matches...")
            results = index.query(
                vector=query_vector,
                namespace=namespace,
                top_k=top_k,
                include_values=False,
                include_metadata=include_metadata
            )
            return results
        
        except Exception as e:
            logger.error(f"Error querying index: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

def process_document(file_path: str, pinecone_api_key: str, index_name: str = "documents", 
                    namespace: Optional[str] = None, chunk_size: int = 1000, 
                    chunk_overlap: int = 200) -> bool:
    """Process a document, split it, generate embeddings, and store in Pinecone"""
    try:
        # Generate a unique namespace if not provided
        if namespace is None:
            namespace = f"doc_{int(time.time())}"
        
        logger.info(f"Processing document: {file_path}")
        logger.info(f"Using index: {index_name}, namespace: {namespace}")
        
        # Load document
        doc_processor = DocumentProcessor()
        content = doc_processor.load_document(file_path)
        logger.info(f"Document loaded successfully with {len(content)} characters")
        
        # Split document
        chunks = doc_processor.split_text(content, chunk_size, chunk_overlap)
        logger.info(f"Created {len(chunks)} document chunks")
        
        # Generate embeddings
        embedder = E5Embedder()
        embeddings = embedder.generate_embeddings(chunks)
        
        # Initialize Pinecone
        pc_manager = PineconeManager(pinecone_api_key)
        
        # Get or create index
        available_indexes = pc_manager.list_indexes()
        logger.info(f"Available indexes: {available_indexes}")
        
        if index_name not in available_indexes:
            # Get embedding dimension
            dimension = len(embeddings[0]) if embeddings else 1024  # Default to 1024 for e5-large
            logger.info(f"Creating new index '{index_name}' with dimension {dimension}")
            pc_manager.create_index(index_name, dimension)
        
        index = pc_manager.get_index(index_name)
        if not index:
            logger.error(f"Failed to get index {index_name}")
            return False
        
        # Prepare vectors for upsert
        filename = os.path.basename(file_path)
        doc_id = os.path.splitext(filename)[0]
        
        vectors = []
        for i, (text, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = f"{doc_id}_chunk_{i+1}"
            vectors.append({
                "id": chunk_id,
                "values": embedding,
                "metadata": {
                    "document": filename,
                    "chunk_id": i+1,
                    "total_chunks": len(chunks),
                    "text": text
                }
            })
        
        # Upsert vectors
        success = pc_manager.upsert_vectors(index, vectors, namespace)
        if not success:
            logger.error("Failed to upsert vectors")
            return False
        
        # Test a query
        query_text = "¿Qué servicios ofrece la empresa?"
        logger.info(f"Testing query: '{query_text}'")
        
        # Generate query embedding
        query_embedding = embedder.generate_embeddings([query_text])[0]
        
        # Query index
        results = pc_manager.query_index(index, query_embedding, namespace, top_k=3)
        
        if results and results.matches:
            logger.info(f"Query returned {len(results.matches)} matches:")
            for i, match in enumerate(results.matches):
                logger.info(f"Match {i+1}:")
                logger.info(f"  ID: {match.id}")
                logger.info(f"  Score: {match.score}")
                logger.info(f"  Content: {match.metadata['text'][:150]}...")
        else:
            logger.info("Query returned no matches")
        
        return True
    
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process documents and store embeddings in Pinecone")
    parser.add_argument("document_path", help="Path to the document file")
    parser.add_argument("--index_name", default="documents", help="Pinecone index name")
    parser.add_argument("--namespace", default=None, help="Namespace within the index")
    parser.add_argument("--api_key", default=None, help="Pinecone API key")
    
    args = parser.parse_args()
    
    # Use provided API key or fetch from environment variable
    api_key = args.api_key or os.environ.get("PINECONE_API_KEY", "")
    
    success = process_document(
        args.document_path, 
        api_key, 
        args.index_name, 
        args.namespace
    )
    
    if success:
        logger.info(f"Document processed and stored successfully!")
        sys.exit(0)
    else:
        logger.error(f"Failed to process document")
        sys.exit(1) 