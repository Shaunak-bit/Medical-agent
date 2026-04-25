import os
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb

# 1. Configuration
DB_PATH = "./chroma_db"
COLLECTION_NAME = "medical_research"

def process_pdf(file_path, source_url=None):
    """
    Extracts, chunks, and stores medical data with Page-Level Metadata.
    """
    print(f"--- Starting Ingestion for: {file_path} ---")
    file_name = os.path.basename(file_path)

    # 2. Extract Text by Page (Crucial for Citations)
    all_chunks = []
    all_metadatas = []
    
    try:
        reader = PdfReader(file_path)
        # We use a medical-grade splitter
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=300,
            separators=["\n\n", "\n", " ", ""]
        )

        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if not text:
                continue
            
            # Chunk the specific page
            page_chunks = text_splitter.split_text(text)
            
            for i, chunk in enumerate(page_chunks):
                all_chunks.append(chunk)
                # --- KEY CHANGE: ADD PAGE AND LINK TO METADATA ---
                all_metadatas.append({
                    "source": file_name,
                    "page": page_num + 1,
                    "chunk_id": i,
                    "link": source_url if source_url else f"local://{file_name}#page={page_num + 1}"
                })
        
        print(f"Extracted {len(all_chunks)} chunks across {len(reader.pages)} pages.")

    except Exception as e:
        print(f"Error reading PDF: {e}")
        return

    # 3. Initialize ChromaDB
    client = chromadb.PersistentClient(path=DB_PATH)
    collection = client.get_or_create_collection(name=COLLECTION_NAME)

    # 4. Add to Collection with explicit IDs
    ids = [f"{file_name}_p{m['page']}_c{m['chunk_id']}" for m in all_metadatas]

    collection.add(
        documents=all_chunks,
        ids=ids,
        metadatas=all_metadatas
    )

    print(f"--- Successfully indexed {file_name} with clickable page metadata ---")

if __name__ == "__main__":
    test_file = "sample.pdf" 
    if os.path.exists(test_file):
        # You can pass a real link if you upload the PDF to a cloud bucket like S3 or Supabase Storage
        process_pdf(test_file, source_url="https://your-medical-repo.com/files/sample.pdf")
    else:
        print(f"File '{test_file}' not found.")