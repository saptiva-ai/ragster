"""
Custom Query Script for Pinecone Vector Database

This script allows you to perform custom queries against vectors stored in Pinecone
using the E5 multilingual embedding model.
"""

import argparse
import logging
import sys
import torch
from pinecone import Pinecone
from transformers import AutoTokenizer, AutoModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def generate_embedding(query_text, model_name="intfloat/multilingual-e5-large"):
    """Generate an embedding for the query text using the E5 model"""
    try:
        logger.info(f"Loading model: {model_name}")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModel.from_pretrained(model_name)
        
        # Move model to the right device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        model.to(device)
        
        # Prepare input text with the E5 format
        formatted_text = f"passage: {query_text}"
        
        # Tokenize and prepare input tensors
        encoded_input = tokenizer(
            [formatted_text],
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
        embedding = normalized_embeddings.cpu().numpy().tolist()[0]
        logger.info("Embedding generated successfully")
        
        return embedding
    
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def query_pinecone(query_text, api_key, index_name, namespace, top_k=5):
    """Query Pinecone with the generated embedding"""
    try:
        # Generate embedding for the query
        query_embedding = generate_embedding(query_text)
        if not query_embedding:
            logger.error("Failed to generate embedding for query")
            return False
        
        # Initialize Pinecone
        logger.info(f"Connecting to Pinecone index: {index_name}, namespace: {namespace}")
        pc = Pinecone(api_key=api_key)
        
        if index_name not in pc.list_indexes().names():
            logger.error(f"Index {index_name} does not exist")
            return False
        
        index = pc.Index(index_name)
        
        # Query the index
        logger.info(f"Querying with text: '{query_text}'")
        results = index.query(
            vector=query_embedding,
            namespace=namespace,
            top_k=top_k,
            include_values=False,
            include_metadata=True
        )
        
        # Display results
        if results.matches:
            logger.info(f"Found {len(results.matches)} matches:")
            for i, match in enumerate(results.matches):
                logger.info(f"Match {i+1}:")
                logger.info(f"  ID: {match.id}")
                logger.info(f"  Score: {match.score}")
                logger.info(f"  Content: {match.metadata.get('text', 'No text')[:200]}...")
                for key, value in match.metadata.items():
                    if key != 'text':
                        logger.info(f"  {key}: {value}")
                logger.info("")
        else:
            logger.info("No matches found")
        
        return True
    
    except Exception as e:
        logger.error(f"Error querying Pinecone: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def main():
    parser = argparse.ArgumentParser(description="Query vectors in Pinecone using the E5 model")
    parser.add_argument("query", help="The query text to search for")
    parser.add_argument("--index_name", default="ragster", help="Pinecone index name")
    parser.add_argument("--namespace", default="e5-fixed-sample", help="Namespace within the index")
    parser.add_argument("--api_key", default="api_KEY_PINECODE", help="Pinecone API key")
    parser.add_argument("--top_k", type=int, default=5, help="Number of results to return")
    
    args = parser.parse_args()
    
    success = query_pinecone(args.query, args.api_key, args.index_name, args.namespace, args.top_k)
    
    if success:
        logger.info("Query completed successfully")
        return 0
    else:
        logger.error("Query failed")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 