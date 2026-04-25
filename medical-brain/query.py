import os
import chromadb
from groq import Groq
from dotenv import load_dotenv

# 1. Setup
load_dotenv()
DB_PATH = "./chroma_db"
COLLECTION_NAME = "medical_research"

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
chroma_client = chromadb.PersistentClient(path=DB_PATH)
collection = chroma_client.get_collection(name=COLLECTION_NAME)

def ask_medical_assistant(question):
    print(f"\nSearching for: {question}...")
    results = collection.query(
        query_texts=[question],
        n_results=3
    )
    
    context = "\n\n".join(results['documents'][0])
    sources = list(set([m['source'] for m in results['metadatas'][0]]))
    system_prompt = (
        "You are Cura Link, an advanced AI Medical Research Assistant. "
        "Your goal is to provide evidence-based answers using the provided context. "
        "1. Start by directly answering the question. "
        "2. Cite your sources clearly using [Source Name]. "
        "3. If the context is insufficient, use your high-level medical knowledge but flag it as 'General Medical Insight'. "
        "4. Be concise, professional, and do not offer diagnostic advice to patients."
    )

    # 4. Generation: Call Groq
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"RESEARCH CONTEXT:\n{context}\n\nQUESTION: {question}"}
        ],
        temperature=0.2, # Low temperature ensures medical accuracy over creativity
        max_tokens=1024
    )

    return {
        "answer": response.choices[0].message.content,
        "sources": sources
    }

if __name__ == "__main__":
    # Test a query
    user_q = "What are the primary findings in the research?"
    result = ask_medical_assistant(user_q)
    
    print("\n--- CURA LINK RESPONSE ---")
    print(result['answer'])
    print(f"\nSources analyzed: {', '.join(result['sources'])}")