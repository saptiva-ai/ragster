from langchain_text_splitters import MarkdownHeaderTextSplitter
from pinecone import Pinecone, ServerlessSpec
import transformers
from transformers import AutoTokenizer, AutoModel
import torch
import numpy as np
import time
import os
from dotenv import load_dotenv

load_dotenv()

print(f"Transformers version: {transformers.__version__}")

# Initialize Pinecone client
api_key = os.environ.get("PINECONE_API_KEY", "")
print(f"Using Pinecone API key: {api_key[:10]}...")

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

# The Markdown document from the original code
markdown_document = """## **Multi Money - Base de conocimientos**

### **Crédito**

#### **¿Cuáles son las características de la línea de crédito?**

Es una línea de crédito rotativa, con la cual te prestamos desde $450 hasta $25,000 con un plazo de hasta 60 meses. La línea autorizada la puedes utilizar total o parcialmente. Si utilizas tu línea parcialmente, puedes solicitar dinero adicional en cualquier momento, sin trámites adicionales. A medida que vayas pagando tu crédito, vas incrementando el disponible que puedes utilizar. Si haces pagos extraordinarios disminuyes tu plazo. El monto y condiciones de la línea de crédito rotativa y desembolsos adicionales están sujetos a aprobación de política de crédito vigente.

---

#### **Tasas, Comisiones y Plazo**

| **Tasa (%)** | **Comisión (%)** | **Plazo (meses)** |
|-------------|----------------|-----------------|
| 1.50%      | 4.99%          | 72              |
| 1.75%      | 4.99%          | 72              |
| 2.00%      | 4.99%          | 72              |
| 2.50%      | 4.99%          | 72              |
| 3.25%      | 4.99%          | 60              |
| 3.50%      | 5.99%          | 60              |
| 3.75%      | 6.99%          | 60              |
| 4.00%      | 6.99%          | 60              |
| 4.15%      | 6.99%          | 60              |

---

#### **¿Cuáles son los requisitos para aplicar a una línea de crédito?**

- Tener al menos 21 años de edad.
- Presentar DUI.
- Comprobante de ingresos desde $600.
- Cumplir con la política de crédito vigente.

#### **¿Cómo puedo saber cuál sería la cuota según el monto de mi línea de crédito?**

Puedes simular distintos montos para saber la cuota mínima mensual utilizando nuestra calculadora de cuotas.

---

### **Agencias de Cobro Autorizadas**

| **Agencia** | **Dirección** | **Teléfono** | **Horario** |
|------------|-------------|------------|----------|
| Alemán Soto & Asociados | Av. Jose Matías Delgado #335, Colonia Escalón, San Salvador | 2560-7200 Ext. 1060 | Lunes a viernes 08:00 - 18:00 |
| CCBO | - | 2560-7099 | Lunes a viernes 08:00 - 18:00 |
| Despacho y Cobranza Corporativa S.A. de C.V. (Dcobranza) | Col. Montevideo, Calle Ciriaco Alas y Ave. Manuel Arce, Edificio 27, Sonzacate | 2404-3407 | Lunes a viernes 08:00 - 18:00 |
| Solventa S.A. de C.V. | Centro Comercial Feria Rosa, local 3G, col. San Benito, San Salvador | 2520-7100 | Lunes a viernes 08:00 - 18:00 |
| Bufete Judicial Amaya Fuentes & Asociados | Colonia Escalón, calle circunvalación, pasaje #3, casa No. 8, San Salvador | 2521-6808 | Lunes a viernes 08:00 - 18:00 |
| Bufete Judicial Cabrera & Asociados | 7° Calle Poniente #13, entre 87 y 89 avenida norte, Col Escalón | 2264-1697 | Lunes a viernes 08:00 - 18:00 |

---

### **Smart**

#### **¿Qué hace la cuenta Smart diferente a un certificado de depósito?**

A diferencia de un certificado de depósito, el dinero que ahorres en la cuenta Smart lo puedes retirar de tu cuenta sin ninguna penalidad. Además, te damos acceso a nuestra app y banca en línea, desde donde podrás realizar transferencias, pagar servicios y más. La tasa de interés de 3.5% es fija sin importar montos o tiempo.

---

### **Seguros y Asistencias**

#### **Cobertura del Seguro**

| **Línea desde ($)** | **Línea hasta ($)** | **Monto Asegurado ($)** | **Prima de Seguro ($)** |
|----------------|----------------|----------------|----------------|
| 450.00       | 1,500.00        | 1,500.00       | 1.00          |
| 1,501.00     | 4,500.00        | 4,500.00       | 3.00          |
| 4,501.00     | 7,500.00        | 7,500.00       | 5.00          |
| 7,501.00     | 12,000.00       | 12,000.00      | 8.00          |
| 12,001.00    | 15,000.00       | 15,000.00      | 10.00         |
| 15,001.00    | 20,000.00       | 20,000.00      | 13.00         |
| 20,001.00    | 25,000.00       | 25,000.00      | 17.00         |

#### **¿En qué casos tengo cobertura con mi seguro?**

- En caso de incapacidad por invalidez total o permanente.
- En caso de fallecimiento por enfermedad o accidente del asegurado.
- Cobertura adicional de gastos funerarios.

---

### **Multiasistencia**

#### **Cobertura de Asistencia Vial**

- La cobertura aplicará al vehículo en el cual viaja el afiliado y/o beneficiarios que vivan en el mismo domicilio del afiliado.
- La cobertura queda activa en 48 horas posterior a la aceptación.

---

### **Condiciones de Crédito**

#### **Beneficios y Condiciones**

- Crédito rotativo: conforme pagues, siempre tienes crédito disponible.
- Entrega en un máximo de 24 horas después de recibida toda tu documentación.
- Sin fiador ni garantía.
- Más de 400 puntos de pago disponibles en la red de Puntoxpress.
- Plazo de hasta 72 meses sin penalización por pago anticipado.

---

### **Empresa**

#### **¿Quiénes somos?**

Nuestra misión es desarrollar productos financieros honestos que le permitan a las personas lograr sus metas.

---

### **Oficinas y Atención al Cliente**

| **Ubicación** | **Horario** |
|-------------|-----------|
| Centro Comercial Bambú City Center, local 1 nivel 1, Boulevard El Hipódromo y Avenida Las Magnolias, Colonia San Benito, Zona Rosa, San Salvador | Lunes a Viernes: 9:00 a.m. - 5:00 p.m. Sábado: 9:00 a.m. - 12:00 m.d. |
"""

try:
    # Set headers for splitting the markdown
    headers_to_split_on = [
        ("##", "Header 1"),
        ("###", "Header 2"),
        ("####", "Header 3"),
        ("#####", "Header 4"),
        ("######", "Header 5"),
        ("#######", "Header 6"),
    ]

    print("\nSplitting markdown document into chunks...")
    markdown_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on, strip_headers=False
    )
    md_header_splits = markdown_splitter.split_text(markdown_document)

    print(f"Created {len(md_header_splits)} document chunks")
    
    # Initialize Pinecone client and set up cloud parameters
    pc = Pinecone(api_key=api_key)
    cloud = 'aws'
    region = 'us-east-1'
    
    # Specify index name to create or use
    index_name = "multimoney"
    
    # Check if index exists, create if it doesn't
    available_indexes = pc.list_indexes().names()
    print(f"\nAvailable indexes: {available_indexes}")
    
    if index_name not in available_indexes:
        print(f"\nCreating index: {index_name}")
        pc.create_index(
            name=index_name,
            dimension=1024,  # multilingual-e5-large uses 1024 dimensions
            metric="cosine",
            spec=ServerlessSpec(cloud=cloud, region=region)
        )
        print(f"Waiting for index {index_name} to initialize...")
        time.sleep(10)  # Wait for index to be ready
    else:
        print(f"\nUsing existing index: {index_name}")
    
    # Get the index
    index = pc.Index(index_name)
    
    # Show index stats before upsert
    print("\nIndex before upsert:")
    try:
        stats = index.describe_index_stats()
        print(f"Dimension: {stats.dimension}")
        print(f"Total vectors: {stats.total_vector_count}")
        print(f"Namespaces: {list(stats.namespaces.keys())}")
    except Exception as e:
        print(f"Error getting index stats: {e}")
    
    # Define namespace for our content
    namespace = "multimoneyvector"
    
    # Prepare document texts for embedding
    docs_to_embed = []
    doc_metadatas = []
    
    for i, doc in enumerate(md_header_splits):
        # Extract metadata and add to list
        metadata = {
            "id": f"chunk_{i+1}",
            "source": f"multimoney_knowledge_base",
            "text": doc.page_content
        }
        
        # Add headers to metadata
        for header_key, header_value in doc.metadata.items():
            metadata[header_key] = header_value
            
        doc_metadatas.append(metadata)
        docs_to_embed.append(doc.page_content)
    
    # Generate embeddings for each document
    use_mock = False  # Set to True if you have trouble with the model
    document_embeddings = get_embeddings(docs_to_embed, model_name=model_name, use_mock=use_mock)
    
    # Prepare vectors for upsert
    vectors = []
    for i, (embedding, metadata) in enumerate(zip(document_embeddings, doc_metadatas)):
        vectors.append({
            "id": metadata["id"],
            "values": embedding,
            "metadata": metadata
        })
    
    # Upsert vectors to Pinecone
    print(f"\nUpserting {len(vectors)} vectors to Pinecone...")
    index.upsert(vectors=vectors, namespace=namespace)
    print("Upsert completed!")
    
    # Show index stats after upsert
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
    query_text = "¿Cuáles son los requisitos para aplicar a una línea de crédito?"
    
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
        print(f"  Headers: {match.metadata.get('Header 2', '')} > {match.metadata.get('Header 3', '')}")
        print(f"  Content: {match.metadata.get('text', 'No text available')[:200]}...")
        print()
    
    print("\nScript completed successfully!")

except Exception as e:
    print(f"An error occurred: {e}")
    import traceback
    traceback.print_exc() 