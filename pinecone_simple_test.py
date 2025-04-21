from pinecone import Pinecone, ServerlessSpec
import time
import os
import numpy as np
import random

# Initialize Pinecone client
api_key = "api_KEY_PINECODE"
print(f"Using Pinecone API key: {api_key[:10]}...")

pc = Pinecone(api_key=api_key)

# Function to create simulated embeddings
def create_embedding(dim=1024):
    """Create a random vector with the specified dimension"""
    return np.random.uniform(-1, 1, dim).tolist()

try:
    # Set up Pinecone index
    dimensions = 1024  # This should match what's in your .env.local file
    
    # Get available indexes
    available_indexes = pc.list_indexes().names()
    print(f"Available indexes: {available_indexes}")
    
    # Use an existing index (ragster) instead of creating a new one
    index_name = "ragster"
    
    if index_name not in available_indexes:
        print(f"Error: Index '{index_name}' does not exist. Available indexes: {available_indexes}")
        exit(1)
    
    print(f"Using existing index: {index_name}")
    
    # Get the index
    index = pc.Index(index_name)
    
    # Index stats before upsert
    print("\nIndex before upsert:")
    try:
        stats = index.describe_index_stats()
        print(stats)
    except Exception as e:
        print(f"Error getting index stats: {e}")
    
    # Define test data
    namespace = "test-simple"
    doc_count = 5  # Number of test documents
    
    # Prepare sample data
    vectors = []
    for i in range(doc_count):
        text = f"Test document {i+1}"
        
        vectors.append({
            "id": f"doc{i+1}",
            "values": create_embedding(dimensions),
            "metadata": {
                "text": text,
                "category": random.choice(["credit", "insurance", "banking"]),
                "importance": random.randint(1, 5)
            }
        })
    
    # Upsert vectors
    print(f"\nUpserting {len(vectors)} vectors to Pinecone...")
    index.upsert(vectors=vectors, namespace=namespace)
    print("Upsert completed!")
    
    # Wait for indexing
    time.sleep(3)
    
    # Get index stats after upsert
    print("\nIndex after upsert:")
    try:
        stats = index.describe_index_stats()
        print(stats)
    except Exception as e:
        print(f"Error getting index stats: {e}")
    
    # Test query
    print("\nTesting query on Pinecone index...")
    query_vector = create_embedding(dimensions)
    
    results = index.query(
        vector=query_vector,
        namespace=namespace,
        top_k=3,
        include_values=False,
        include_metadata=True
    )
    
    print("\nQuery results:")
    for match in results.matches:
        print(f"ID: {match.id}")
        print(f"Score: {match.score}")
        print(f"Metadata: {match.metadata}")
        print()

    # Clean up - delete test vectors
    print(f"\nCleaning up - deleting test vectors from namespace '{namespace}'...")
    doc_ids = [f"doc{i+1}" for i in range(doc_count)]
    index.delete(ids=doc_ids, namespace=namespace)
    print("Cleanup completed!")

except Exception as e:
    print(f"An error occurred: {e}")
    import traceback
    traceback.print_exc() 