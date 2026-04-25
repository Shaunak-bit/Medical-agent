# PDF Reading Issue Diagnosis TODO

## Current Progress
- [x] Searched files for PDF handling
- [x] Read key files: ingest.py, main.py, query.py, requirements.txt
- [x] Identified failure points: scanned PDFs, no text, ingestion errors
- [x] User confirmed: PDF uploads to Atlas, AI ignores it (PubMed only), frontend not showing
- [x] Created diagnostic plan
- [x] Diagnosed root cause: Missing frontend /ingest call after Atlas upload

## Root Cause
PDFs stored in Atlas but **/ingest endpoint never called** -> no ChromaDB chunks -> queries return only live sources (PubMed/ClinicalTrials).

AI response shows no `[Source: your-pdf.pdf]` metadata = no local retrieval.

## Recommended Fix
1. **Frontend**: After Atlas upload, POST file to `http://localhost:8000/ingest`
2. **Verify ingestion**:
   ```
   cd medical-brain
   python -c "import chromadb; c=chromadb.PersistentClient('./chroma_db'); coll=c.get_collection('medical_research'); print('Count:', coll.count())"
   ```
3. **Test ingest**:
   ```
   curl -X POST -F "file=@test.pdf" http://localhost:8000/ingest
   ```
4. **Start server**:
   ```
   cd medical-brain
   uvicorn main:app --reload --port 8000
   ```
5. **Check health**: `curl http://localhost:8000/health`

## Other Common Issues (if ingest called)
- **Scanned PDF**: "No extractable text... OCR needed" (add pytesseract)
- **Encrypted PDF**: PdfReader fails (400)

## Next Steps
Implement frontend ingest call (likely app/chat/ or upload component).


