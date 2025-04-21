from langchain_text_splitters import MarkdownHeaderTextSplitter
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer
from langchain_core.embeddings import Embeddings

from langchain_core.documents import Document
import time
import os
import sys
import numpy as np

# Add additional paths to find packages if needed
site_packages = os.path.join(os.path.dirname(sys.executable), '..', 'lib', 'python3.13', 'site-packages')
if os.path.exists(site_packages):
    sys.path.append(site_packages)

# Chunk the document based on h2 headers.
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

headers_to_split_on = [
    ("##", "Header 1"),
    ("###", "Header 2"),
    ("####", "Header 3"),
    ("#####", "Header 4"),
    ("######", "Header 5"),
    ("#######", "Header 6"),
]

print("Splitting markdown document into chunks...")
markdown_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=headers_to_split_on, strip_headers=False
)
md_header_splits = markdown_splitter.split_text(markdown_document)

print(f"Created {len(md_header_splits)} document chunks")
for i, chunk in enumerate(md_header_splits):
    print(f"Chunk {i+1}:")
    print(f"  Headers: {chunk.metadata}")
    print(f"  Content length: {len(chunk.page_content)} chars")
    print()

# Custom embeddings class using SentenceTransformer directly
class CustomHuggingFaceEmbeddings(Embeddings):
    def __init__(self, model_name):
        try:
            self.model = SentenceTransformer(model_name)
            self.dimension = self.model.get_sentence_embedding_dimension()
            print(f"Loaded model with dimension: {self.dimension}")
        except Exception as e:
            print(f"Error loading model: {e}")
            # Fallback to a mock model for testing
            self.model = None
            self.dimension = 1024
            print("Using mock embeddings model for testing")
    
    def embed_documents(self, texts):
        """Embed a list of documents using the HuggingFace model"""
        if self.model:
            try:
                embeddings = self.model.encode(texts, normalize_embeddings=True)
                return embeddings.tolist()
            except Exception as e:
                print(f"Error during document embedding: {e}")
        
        # Fallback to random embeddings for testing
        return [np.random.uniform(-1, 1, self.dimension).tolist() for _ in texts]
    
    def embed_query(self, text):
        """Embed a query using the HuggingFace model"""
        if self.model:
            try:
                embedding = self.model.encode(text, normalize_embeddings=True)
                return embedding.tolist()
            except Exception as e:
                print(f"Error during query embedding: {e}")
        
        # Fallback to random embedding for testing
        return np.random.uniform(-1, 1, self.dimension).tolist()

# Using proper HuggingFaceEmbeddings for multilingual-e5-large
model_name = 'intfloat/multilingual-e5-large'
print(f"Using embedding model: {model_name}")

try:
    # Create embeddings from HuggingFace directly
    embeddings = CustomHuggingFaceEmbeddings(model_name)
    
    # Test embedding a simple string
    print("\nTesting embeddings...")
    test_text = "¿Cuáles son los requisitos para un crédito?"
    test_embedding = embeddings.embed_query(test_text)
    print(f"Embedding dimensions: {len(test_embedding)}")
    print(f"First few values: {test_embedding[:5]}")
    
    # Initialize Pinecone client
    api_key = "api_KEY_PINECODE"
    print(f"\nInitializing Pinecone with API key: {api_key[:10]}...")
    
    pc = Pinecone(api_key=api_key)
    
    # Set up Pinecone index
    cloud = 'aws'
    region = 'us-east-1'
    index_name = "multimoney-test"
    
    print(f"Available indexes: {pc.list_indexes().names()}")
    
    # Create index if it doesn't exist
    if index_name not in pc.list_indexes().names():
        print(f"Creating index: {index_name}")
        pc.create_index(
            name=index_name,
            dimension=1024,  # multilingual-e5-large uses 1024 dimensions
            metric="cosine",
            spec=ServerlessSpec(cloud=cloud, region=region)
        )
        print(f"Waiting for index {index_name} to initialize...")
        time.sleep(10)  # Wait for index to be ready
    
    # Get the index and check stats before inserting vectors
    index = pc.Index(index_name)
    
    print("\nIndex before upsert:")
    try:
        stats = index.describe_index_stats()
        print(stats)
    except Exception as e:
        print(f"Error getting index stats: {e}")
    
    # Define namespace
    namespace = "multimoneytest"
    
    # Convert LangChain documents to the format expected by PineconeVectorStore
    documents = []
    for i, doc in enumerate(md_header_splits):
        # Make sure metadata includes text for retrieval
        metadata = doc.metadata.copy()
        metadata['text'] = doc.page_content
        metadata['source'] = f"chunk_{i+1}"
        
        documents.append(
            Document(
                page_content=doc.page_content,
                metadata=metadata
            )
        )
    
    # Use vector store to upload embeddings
    print("\nUploading documents to Pinecone...")
    try:
        # Get document embeddings and upsert to Pinecone
        docsearch = PineconeVectorStore.from_documents(
            documents=documents,
            embedding=embeddings,
            index_name=index_name,
            namespace=namespace
        )
        
        print("Successfully uploaded documents to Pinecone!")
    except Exception as e:
        print(f"Error uploading documents to Pinecone: {e}")
    
    # Wait for data to be indexed
    print("Waiting for indexing to complete...")
    time.sleep(5)
    
    # Index stats after upsert
    print("\nIndex after upsert:")
    try:
        stats = index.describe_index_stats()
        print(stats)
    except Exception as e:
        print(f"Error getting index stats: {e}")
    
    # Test query using the vector store
    print("\nTesting semantic search...")
    query_text = "¿Cuáles son los requisitos para un crédito?"
    
    results = docsearch.similarity_search(
        query=query_text,
        k=3
    )
    
    print(f"Results for query: '{query_text}'")
    for i, doc in enumerate(results):
        print(f"Result {i+1}:")
        print(f"  Source: {doc.metadata.get('source', 'Unknown')}")
        print(f"  Headers: {doc.metadata.get('Header 2', '')} > {doc.metadata.get('Header 3', '')}")
        print(f"  Content: {doc.page_content[:200]}...")
        print()
    
except Exception as e:
    print(f"An error occurred: {e}")
    import traceback
    traceback.print_exc() 