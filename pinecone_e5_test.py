from pinecone import Pinecone, ServerlessSpec
import transformers
from transformers import AutoTokenizer, AutoModel
import torch
import numpy as np
import time
import os

print(f"Transformers version: {transformers.__version__}")

# Initialize Pinecone client
api_key = "api_KEY_PINECODE"
print(f"Using Pinecone API key: {api_key[:10]}...")

pc = Pinecone(api_key=api_key)

# E5 model for multilingual embeddings
model_name = "intfloat/multilingual-e5-large"

# Function to create embeddings using E5 model
def get_embeddings(texts, model_name="intfloat/multilingual-e5-large", use_mock=False):
    """Generate embeddings using E5 model or mock if model fails to load"""
    if use_mock:
        print(f"Using mock embeddings (dimension=1024)")
        return [np.random.uniform(-1, 1, 1024).tolist() for _ in texts]
    
    try:
        print(f"Loading model: {model_name}")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModel.from_pretrained(model_name)
        
        # Move model to the right device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {device}")
        model.to(device)
        
        # Prepare input texts
        batch_text = [f"passage: {text}" for text in texts]
        
        print("Tokenizing inputs...")
        # Tokenize and prepare input tensors
        encoded_input = tokenizer(
            batch_text, 
            padding=True, 
            truncation=True, 
            max_length=512, 
            return_tensors='pt'
        ).to(device)
        
        print("Generating embeddings...")
        # Get model embeddings
        with torch.no_grad():
            model_output = model(**encoded_input)
            embeddings = model_output.last_hidden_state[:, 0]
            # Normalize embeddings
            normalized_embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        
        # Convert to list for Pinecone
        embeddings_list = normalized_embeddings.cpu().numpy().tolist()
        dim = len(embeddings_list[0])
        print(f"Generated embeddings with dimension: {dim}")
        
        return embeddings_list
    
    except Exception as e:
        print(f"Error loading or using the model: {e}")
        print("Falling back to mock embeddings")
        return [np.random.uniform(-1, 1, 1024).tolist() for _ in texts]

try:
    # Test data
    test_texts = [
        "¿Cuáles son los requisitos para aplicar a una línea de crédito?",
        "Quiero saber sobre la tasa de interés para un préstamo",
        "¿Cuánto cuesta el seguro para un préstamo de $5000?",
        "¿Dónde están ubicadas las oficinas?",
        "¿Cómo funciona la cuenta Smart?"
    ]
    
    # Get available indexes
    available_indexes = pc.list_indexes().names()
    print(f"Available indexes: {available_indexes}")
    
    # Use an existing index
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
        print(f"Dimension: {stats.dimension}")
        print(f"Total vectors: {stats.total_vector_count}")
        print(f"Namespaces: {list(stats.namespaces.keys())}")
    except Exception as e:
        print(f"Error getting index stats: {e}")
    
    # Define test data
    namespace = "e5-test"
    
    # Generate embeddings
    use_mock = False  # Set to True if model loading fails
    test_embeddings = get_embeddings(test_texts, model_name=model_name, use_mock=use_mock)
    
    # Prepare vectors for upsert
    vectors = []
    for i, (text, embedding) in enumerate(zip(test_texts, test_embeddings)):
        vectors.append({
            "id": f"e5-doc{i+1}",
            "values": embedding,
            "metadata": {
                "text": text,
                "model": model_name,
                "type": "query"
            }
        })
    
    # Upsert vectors
    print(f"\nUpserting {len(vectors)} vectors to Pinecone...")
    try:
        index.upsert(vectors=vectors, namespace=namespace)
        print("Upsert completed!")
    except Exception as e:
        print(f"Error upserting vectors: {e}")
    
    # Wait for indexing
    time.sleep(3)
    
    # Get index stats after upsert
    print("\nIndex after upsert:")
    try:
        stats = index.describe_index_stats()
        print(f"Dimension: {stats.dimension}")
        print(f"Total vectors: {stats.total_vector_count}")
        if namespace in stats.namespaces:
            print(f"Vectors in namespace '{namespace}': {stats.namespaces[namespace].vector_count}")
    except Exception as e:
        print(f"Error getting index stats: {e}")
    
    # Test query
    print("\nTesting query...")
    query_text = "¿Cuál es el monto mínimo para solicitar un crédito?"
    
    # Generate embedding for query
    query_embedding = get_embeddings([query_text], model_name=model_name, use_mock=use_mock)[0]
    
    # Query Pinecone
    results = index.query(
        vector=query_embedding,
        namespace=namespace,
        top_k=3,
        include_values=False,
        include_metadata=True
    )
    
    print("\nQuery results for:", query_text)
    for i, match in enumerate(results.matches):
        print(f"Result {i+1}:")
        print(f"  ID: {match.id}")
        print(f"  Score: {match.score}")
        print(f"  Text: {match.metadata.get('text', 'No text available')}")
        print()

    # Clean up - delete test vectors
    print(f"\nCleaning up - deleting test vectors from namespace '{namespace}'...")
    doc_ids = [f"e5-doc{i+1}" for i in range(len(test_texts))]
    index.delete(ids=doc_ids, namespace=namespace)
    print("Cleanup completed!")

except Exception as e:
    print(f"An error occurred: {e}")
    import traceback
    traceback.print_exc() 