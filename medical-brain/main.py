import os
import httpx
import asyncio
import xml.etree.ElementTree as ET
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import chromadb
from groq import Groq
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
import re

load_dotenv()
app = FastAPI(title="Cura Link Medical AI - With Subject Locking Context Awareness")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Clients
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="medical_research")

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class BridgedQuery(BaseModel):
    query: str
    bridge_type: str
    weight: str

class ContextAwareness(BaseModel):
    anchor_subject: Optional[str] = None
    anchor_confidence: float = 0.0
    is_locked: bool = False
    is_pivot: bool = False
    last_subject: Optional[str] = None
    detected_intent: Optional[str] = None
    bridged_queries_with_weights: Optional[List[BridgedQuery]] = None

class QueryRequest(BaseModel):
    prompt: str
    expanded_queries: List[str]
    system_prompt: str
    user_role: str
    conversation_context: Optional[dict] = None
    context_awareness: Optional[ContextAwareness] = None

# ============================================================================
# DATA TYPE LABELING SYSTEM
# ============================================================================

class DataTypeLabel:
    THEORETICAL_METHODOLOGY = "Theoretical Methodology"
    LIVE_RESEARCH = "Live Research (PubMed)"
    ACTIVE_RECRUITING_STUDY = "Active Recruiting Study (ClinicalTrials.gov)"
    SEMANTIC_SCHOLAR = "Semantic Scholar Research"
    CROSSREF_JOURNAL = "CrossRef Journal Article"
    OPENALEX_RESEARCH = "OpenAlex Research"

    HIERARCHY = {
        ACTIVE_RECRUITING_STUDY: 1,
        LIVE_RESEARCH: 2,
        SEMANTIC_SCHOLAR: 3,
        CROSSREF_JOURNAL: 4,
        OPENALEX_RESEARCH: 5,
        THEORETICAL_METHODOLOGY: 6
    }

    @staticmethod
    def get_label_instruction(label: str) -> str:
        instructions = {
            DataTypeLabel.ACTIVE_RECRUITING_STUDY: (
                "[ACTIVE TRIAL] This is a currently recruiting clinical trial. "
                "If user asks for specific trials, locations, or enrollment status, prioritize this source."
            ),
            DataTypeLabel.LIVE_RESEARCH: (
                "[LIVE RESEARCH] This is from recent PubMed publications. "
                "Use this for evidence-based findings, mechanisms, and published results."
            ),
            DataTypeLabel.THEORETICAL_METHODOLOGY: (
                "[METHODOLOGY] This is theoretical knowledge from PDFs. "
                "Use for context and background, but prioritize live data if available."
            ),
            DataTypeLabel.SEMANTIC_SCHOLAR: (
                "[SEMANTIC SCHOLAR] This is from Semantic Scholar's academic database. "
                "Highly cited peer-reviewed research. Use for evidence-based answers."
            ),
            DataTypeLabel.CROSSREF_JOURNAL: (
                "[CROSSREF] This is a peer-reviewed journal article indexed by CrossRef. "
                "Use for verified academic citations and DOI-backed findings."
            ),
            DataTypeLabel.OPENALEX_RESEARCH: (
                "[OPENALEX] This is from OpenAlex, the largest open academic database. "
                "Use for broad academic coverage and citation counts."
            ),
        }
        return instructions.get(label, "")

# ============================================================================
# PUBMED FETCHER
# ============================================================================

class PubMedFetcher:
    BASE_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    BASE_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

    async def fetch_research(self, query: str, limit: int = 20):
        async with httpx.AsyncClient() as client:
            search_params = {
                "db": "pubmed",
                "term": query,
                "retmax": limit,
                "retmode": "json",
                "sort": "relevance"
            }
            search_res = await client.get(self.BASE_SEARCH_URL, params=search_params)
            id_list = search_res.json().get("esearchresult", {}).get("idlist", [])
            if not id_list:
                return []
            fetch_params = {"db": "pubmed", "id": ",".join(id_list), "retmode": "xml"}
            fetch_res = await client.get(self.BASE_FETCH_URL, params=fetch_params)
            return self._parse_pubmed_xml(fetch_res.text)

    def _parse_pubmed_xml(self, xml_data: str):
        articles = []
        root = ET.fromstring(xml_data)
        for article in root.findall(".//PubmedArticle"):
            try:
                title = article.find(".//ArticleTitle").text
                abstract_tag = article.find(".//AbstractText")
                abstract = abstract_tag.text if abstract_tag is not None else "No abstract available."
                pmid = article.find(".//PMID").text
                year_tag = article.find(".//PubDate/Year")
                year = year_tag.text if year_tag is not None else "N/A"
                articles.append({
                    "content": f"Title: {title}\nAbstract: {abstract}",
                    "metadata": {
                        "source": "PubMed",
                        "id": pmid,
                        "page": f"PMID:{pmid}",
                        "year": year,
                        "link": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                        "data_type": DataTypeLabel.LIVE_RESEARCH,
                        "type_instruction": DataTypeLabel.get_label_instruction(DataTypeLabel.LIVE_RESEARCH)
                    }
                })
            except Exception:
                continue
        return articles

# ============================================================================
# CLINICAL TRIALS FETCHER
# ============================================================================

class ClinicalTrialsFetcher:
    BASE_URL = "https://clinicaltrials.gov/api/v2/studies"

    async def fetch_trials(self, expanded_queries: List[str], limit: int = 15):
        async with httpx.AsyncClient() as client:
            trials = []
            primary_query = expanded_queries[0] if expanded_queries else "clinical trial"
            params = {
                "query.term": primary_query,
                "pageSize": limit,
                "format": "json",
                "filter.overallStatus": "RECRUITING"
            }
            try:
                response = await client.get(self.BASE_URL, params=params, timeout=10.0)
                data = response.json()
                for study in data.get("studies", []):
                    protocol = study.get("protocolSection", {})
                    id_info = protocol.get("identificationModule", {})
                    desc_info = protocol.get("descriptionModule", {})
                    eligibility = protocol.get("eligibilityModule", {})
                    locations_info = protocol.get("contactsLocationsModule", {})
                    title = id_info.get("briefTitle", "Untitled Trial")
                    nct_id = id_info.get("nctId", "N/A")
                    summary = desc_info.get("briefSummary", "No summary available.")
                    criteria = eligibility.get("eligibilityCriteria", "No criteria listed.")
                    locations = []
                    if locations_info:
                        for loc in locations_info.get("locations", []):
                            city = loc.get("city", "")
                            country = loc.get("country", "")
                            if city or country:
                                locations.append(f"{city}, {country}".strip(", "))
                    location_str = f"Locations: {', '.join(locations)}" if locations else "Location: Not specified"
                    trials.append({
                        "content": f"Clinical Trial: {title}\nNCT ID: {nct_id}\n{location_str}\nCriteria: {criteria}\nSummary: {summary}",
                        "metadata": {
                            "source": "ClinicalTrials.gov",
                            "id": nct_id,
                            "page": nct_id,
                            "link": f"https://clinicaltrials.gov/study/{nct_id}",
                            "data_type": DataTypeLabel.ACTIVE_RECRUITING_STUDY,
                            "type_instruction": DataTypeLabel.get_label_instruction(DataTypeLabel.ACTIVE_RECRUITING_STUDY)
                        }
                    })
            except Exception as e:
                print(f"Error fetching clinical trials: {str(e)}")
            return trials

# ============================================================================
# SEMANTIC SCHOLAR FETCHER
# ============================================================================

class SemanticScholarFetcher:
    BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

    async def fetch_papers(self, query: str, limit: int = 10):
        async with httpx.AsyncClient() as client:
            try:
                params = {"query": query, "limit": limit, "fields": "title,abstract,year,authors,url,citationCount"}
                response = await client.get(self.BASE_URL, params=params, timeout=10.0)
                data = response.json()
                papers = []
                for paper in data.get("data", []):
                    title = paper.get("title", "Untitled")
                    abstract = paper.get("abstract") or "No abstract available."
                    year = paper.get("year", "N/A")
                    url = paper.get("url", "")
                    citations = paper.get("citationCount", 0)
                    authors = paper.get("authors", [])
                    author_str = ", ".join([a.get("name", "") for a in authors[:3]])
                    if len(authors) > 3:
                        author_str += " et al."
                    papers.append({
                        "content": f"Title: {title}\nAuthors: {author_str}\nYear: {year}\nCitations: {citations}\nAbstract: {abstract}",
                        "metadata": {
                            "source": "Semantic Scholar",
                            "page": f"Year:{year} | Citations:{citations}",
                            "link": url,
                            "data_type": DataTypeLabel.SEMANTIC_SCHOLAR,
                            "type_instruction": DataTypeLabel.get_label_instruction(DataTypeLabel.SEMANTIC_SCHOLAR)
                        }
                    })
                print(f"   ✓ Semantic Scholar: {len(papers)} papers")
                return papers
            except Exception as e:
                print(f"   ❌ Semantic Scholar error: {str(e)}")
                return []

# ============================================================================
# CROSSREF FETCHER
# ============================================================================

class CrossRefFetcher:
    BASE_URL = "https://api.crossref.org/works"

    async def fetch_papers(self, query: str, limit: int = 10):
        async with httpx.AsyncClient() as client:
            try:
                params = {"query": query, "rows": limit, "select": "title,abstract,URL,published,author,is-referenced-by-count,container-title"}
                response = await client.get(self.BASE_URL, params=params, timeout=10.0)
                data = response.json()
                papers = []
                for item in data.get("message", {}).get("items", []):
                    title_list = item.get("title", ["Untitled"])
                    title = title_list[0] if title_list else "Untitled"
                    abstract = re.sub(r'<[^>]+>', '', item.get("abstract", "No abstract available."))
                    url = item.get("URL", "")
                    year = item.get("published", {}).get("date-parts", [["N/A"]])[0][0]
                    citations = item.get("is-referenced-by-count", 0)
                    journal = item.get("container-title", [""])[0] if item.get("container-title") else ""
                    authors = item.get("author", [])
                    author_str = ", ".join([f"{a.get('given', '')} {a.get('family', '')}".strip() for a in authors[:3]])
                    if len(authors) > 3:
                        author_str += " et al."
                    papers.append({
                        "content": f"Title: {title}\nJournal: {journal}\nAuthors: {author_str}\nYear: {year}\nCitations: {citations}\nAbstract: {abstract}",
                        "metadata": {
                            "source": "CrossRef",
                            "page": f"Year:{year} | Journal:{journal}",
                            "link": url,
                            "data_type": DataTypeLabel.CROSSREF_JOURNAL,
                            "type_instruction": DataTypeLabel.get_label_instruction(DataTypeLabel.CROSSREF_JOURNAL)
                        }
                    })
                print(f"   ✓ CrossRef: {len(papers)} papers")
                return papers
            except Exception as e:
                print(f"   ❌ CrossRef error: {str(e)}")
                return []

# ============================================================================
# OPENALEX FETCHER
# ============================================================================

class OpenAlexFetcher:
    BASE_URL = "https://api.openalex.org/works"

    async def fetch_papers(self, query: str, limit: int = 10):
        async with httpx.AsyncClient() as client:
            try:
                params = {"search": query, "per-page": limit, "select": "title,abstract_inverted_index,doi,publication_year,cited_by_count,authorships,primary_location"}
                headers = {"User-Agent": "MedicalAssistant/1.0 (mailto:research@medicalapp.com)"}
                response = await client.get(self.BASE_URL, params=params, headers=headers, timeout=10.0)
                data = response.json()
                papers = []
                for work in data.get("results", []):
                    title = work.get("title", "Untitled")
                    doi = work.get("doi", "")
                    year = work.get("publication_year", "N/A")
                    citations = work.get("cited_by_count", 0)
                    abstract = "No abstract available."
                    inverted = work.get("abstract_inverted_index")
                    if inverted:
                        try:
                            word_positions = []
                            for word, positions in inverted.items():
                                for pos in positions:
                                    word_positions.append((pos, word))
                            word_positions.sort(key=lambda x: x[0])
                            abstract = " ".join([w for _, w in word_positions])
                        except Exception:
                            abstract = "Abstract reconstruction failed."
                    journal = ""
                    primary_loc = work.get("primary_location", {})
                    if primary_loc and primary_loc.get("source"):
                        journal = primary_loc["source"].get("display_name", "")
                    authorships = work.get("authorships", [])
                    authors = [a.get("author", {}).get("display_name", "") for a in authorships[:3]]
                    author_str = ", ".join(filter(None, authors))
                    if len(authorships) > 3:
                        author_str += " et al."
                    papers.append({
                        "content": f"Title: {title}\nJournal: {journal}\nAuthors: {author_str}\nYear: {year}\nCitations: {citations}\nAbstract: {abstract}",
                        "metadata": {
                            "source": "OpenAlex",
                            "page": f"Year:{year} | Citations:{citations}",
                            "link": doi or f"https://openalex.org/works?search={title}",
                            "data_type": DataTypeLabel.OPENALEX_RESEARCH,
                            "type_instruction": DataTypeLabel.get_label_instruction(DataTypeLabel.OPENALEX_RESEARCH)
                        }
                    })
                print(f"   ✓ OpenAlex: {len(papers)} papers")
                return papers
            except Exception as e:
                print(f"   ❌ OpenAlex error: {str(e)}")
                return []

# ============================================================================
# Initialize all fetchers
# ============================================================================

pubmed_fetcher = PubMedFetcher()
trials_fetcher = ClinicalTrialsFetcher()
semantic_scholar_fetcher = SemanticScholarFetcher()
crossref_fetcher = CrossRefFetcher()
openalex_fetcher = OpenAlexFetcher()

# ============================================================================
# INJECT ANCHOR INTO SYSTEM PROMPT
# ============================================================================

def inject_anchor_instruction(system_prompt: str, context_awareness: Optional[ContextAwareness]) -> str:
    if not context_awareness or not context_awareness.anchor_subject:
        return system_prompt

    anchor = context_awareness.anchor_subject
    confidence = context_awareness.anchor_confidence
    is_locked = context_awareness.is_locked
    is_pivot = context_awareness.is_pivot
    last_subj = context_awareness.last_subject

    anchor_instruction = (
        f"\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🎯 SUBJECT LOCK INSTRUCTION:\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"\nACTIVE SUBJECT : {anchor}\n"
        f"LOCK STATUS    : {'🔒 LOCKED' if is_locked else '🔓 Unlocked'}\n"
        f"CONFIDENCE     : {confidence:.0%}\n"
    )

    if is_pivot:
        forbidden_block = ""
        if last_subj:
            forbidden_block = (
                f"\n🚫 TOPIC PIVOT — HARD MEMORY CLEAR:\n"
                f"   ❌ FORBIDDEN: Do NOT mention '{last_subj}' in any way.\n"
            )
        anchor_instruction += (
            forbidden_block +
            f"\n✅ NEW FOCUS: Only about '{anchor}'.\n"
        )
    else:
        anchor_instruction += (
            f"\n✅ CONTINUATION: User is still focused on {anchor}.\n"
            f"   • Interpret vague questions in the context of {anchor}.\n"
        )

    anchor_instruction += (
        f"\n[MANDATORY RULES]\n"
        f"1. Every piece of information must apply to {anchor}.\n"
        f"2. If ambiguous, interpret in the context of {anchor}.\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    )

    return system_prompt + anchor_instruction

# ============================================================================
# PIVOT-AWARE FILTERING
# ============================================================================

def filter_candidates_by_pivot(all_candidates: List[dict], context_awareness: Optional[ContextAwareness]) -> List[dict]:
    if not context_awareness or not context_awareness.is_pivot:
        return all_candidates

    last_subject = context_awareness.last_subject
    new_subject = context_awareness.anchor_subject

    if not last_subject:
        return all_candidates

    filtered = []
    for cand in all_candidates:
        content = cand.get("content", "").lower()
        if new_subject and new_subject.lower() in content:
            filtered.append(cand)
            continue
        if last_subject.lower() in content:
            continue
        filtered.append(cand)

    print(f"   Pivot filtering: {len(all_candidates)} → {len(filtered)} candidates")
    return filtered

# ============================================================================
# FALLBACK: Retrieve All Documents from ChromaDB
# ============================================================================

def get_all_chroma_documents() -> List[dict]:
    try:
        count = collection.count()
        if count == 0:
            return []
        all_docs = collection.get()
        candidates = []
        if all_docs and all_docs.get('documents'):
            for doc, meta in zip(all_docs['documents'], all_docs['metadatas']):
                if "data_type" not in meta:
                    meta["data_type"] = DataTypeLabel.THEORETICAL_METHODOLOGY
                    meta["type_instruction"] = DataTypeLabel.get_label_instruction(DataTypeLabel.THEORETICAL_METHODOLOGY)
                candidates.append({"content": doc, "metadata": meta})
        return candidates
    except Exception as e:
        print(f"   ❌ Error retrieving documents: {str(e)}")
        return []

# ============================================================================
# GATHER CANDIDATES
# ============================================================================

async def gather_candidates_with_bridge_priority(request: QueryRequest, context_awareness: Optional[ContextAwareness]) -> List[dict]:
    all_candidates = []
    is_pivot = context_awareness.is_pivot if context_awareness else False
    new_anchor = context_awareness.anchor_subject if context_awareness else None

    if is_pivot and new_anchor:
        queries_to_use = [new_anchor, f"{new_anchor} treatment", f"{new_anchor} management", f"{new_anchor} clinical trials", request.prompt]
    else:
        queries_to_use = request.expanded_queries
        if context_awareness and context_awareness.bridged_queries_with_weights:
            high_weight = [bq.query for bq in context_awareness.bridged_queries_with_weights if bq.weight == "high"]
            medium_weight = [bq.query for bq in context_awareness.bridged_queries_with_weights if bq.weight == "medium"]
            if high_weight:
                queries_to_use = high_weight + medium_weight + request.expanded_queries

    primary_query = queries_to_use[0] if queries_to_use else request.prompt

    # A. Local PDF
    print(f"\n📚 LOCAL PDF RETRIEVAL")
    intent = context_awareness.detected_intent if context_awareness else None
    is_local_document = (intent == "local_document") or any(
        word in request.prompt.lower() for word in ["pdf", "document", "file", "uploaded", "this paper"]
    )

    target_source = None
    if is_local_document:
        try:
            meta_res = collection.get(include=["metadatas"])
            if meta_res and meta_res.get('metadatas') and len(meta_res['metadatas']) > 0:
                target_source = meta_res['metadatas'][-1].get('source')
                sources = set(m.get('source') for m in meta_res['metadatas'] if m.get('source'))
                for src in sources:
                    if src.lower().replace(".pdf", "") in request.prompt.lower():
                        target_source = src
                        break
        except Exception as e:
            print(f"   ❌ Error: {str(e)}")

    for q in queries_to_use[:2]:
        try:
            if target_source:
                local_res = collection.query(query_texts=[q], n_results=15, where={"source": target_source})
            else:
                local_res = collection.query(query_texts=[q], n_results=15)

            if not local_res or not local_res.get('documents') or len(local_res['documents']) == 0:
                continue

            for doc, meta in zip(local_res['documents'][0], local_res['metadatas'][0]):
                if "data_type" not in meta:
                    meta["data_type"] = DataTypeLabel.THEORETICAL_METHODOLOGY
                    meta["type_instruction"] = DataTypeLabel.get_label_instruction(DataTypeLabel.THEORETICAL_METHODOLOGY)
                all_candidates.append({"content": doc, "metadata": meta})
        except Exception as e:
            print(f"   ❌ ChromaDB error: {str(e)}")

    if len(all_candidates) == 0:
        all_candidates.extend(get_all_chroma_documents())

    if not is_local_document:
        print(f"\n🔬 PUBMED RETRIEVAL")
        live_research = await pubmed_fetcher.fetch_research(primary_query, limit=20)
        all_candidates.extend(live_research)
        print(f"   ✓ {len(live_research)} articles")

        print(f"\n🏥 CLINICAL TRIALS RETRIEVAL")
        live_trials = await trials_fetcher.fetch_trials(queries_to_use, limit=15)
        all_candidates.extend(live_trials)
        print(f"   ✓ {len(live_trials)} trials")

        print(f"\n📖 SEMANTIC SCHOLAR RETRIEVAL")
        semantic_papers = await semantic_scholar_fetcher.fetch_papers(primary_query, limit=10)
        all_candidates.extend(semantic_papers)

        print(f"\n📰 CROSSREF RETRIEVAL")
        crossref_papers = await crossref_fetcher.fetch_papers(primary_query, limit=10)
        all_candidates.extend(crossref_papers)

        print(f"\n🌐 OPENALEX RETRIEVAL")
        openalex_papers = await openalex_fetcher.fetch_papers(primary_query, limit=10)
        all_candidates.extend(openalex_papers)

    return all_candidates

# ============================================================================
# MAIN QUERY ENDPOINT
# ============================================================================

@app.post("/query")
async def query_assistant(request: QueryRequest):
    try:
        print(f"\n{'='*80}")
        print(f"📝 QUERY PROCESSING")
        print(f"{'='*80}")

        context_awareness = request.context_awareness

        if context_awareness and context_awareness.is_pivot:
            request.conversation_context = None

        # Stage 1: Gather
        all_candidates = await gather_candidates_with_bridge_priority(request, context_awareness)

        # Stage 2: Filter
        all_candidates = filter_candidates_by_pivot(all_candidates, context_awareness)

        if not all_candidates:
            return {"answer": "I couldn't find any relevant research or trials.", "sources": []}

        # Stage 3: Simple selection (no reranking - saves memory on free tier) ✅
        print(f"\n⚡ STAGE 3: CANDIDATE SELECTION")
        ranked_candidates = all_candidates[:8]
        print(f"   ✓ Top 8 from {len(all_candidates)} total")

        # Stage 4: Format Context
        context_parts = []
        source_list = []

        for cand in ranked_candidates:
            meta = cand["metadata"]
            data_type = meta.get("data_type", "Unknown")
            type_instruction = meta.get("type_instruction", "")
            citation = f"[Source: {meta.get('source')}, Ref: {meta.get('page')}]"
            context_entry = f"[{data_type}] {type_instruction}\n{citation}\n{cand['content']}"
            context_parts.append(context_entry)
            source_list.append({
                "file": meta.get('source'),
                "page": meta.get('page'),
                "link": meta.get('link'),
                "data_type": data_type
            })

        # Stage 5: System Prompt
        print(f"\n🔧 STAGE 4: BUILDING SYSTEM PROMPT")
        system_prompt_with_anchor = inject_anchor_instruction(request.system_prompt, context_awareness)

        prompt_with_context = ""
        if request.conversation_context:
            ctx = request.conversation_context
            if ctx.get('primary_topic'):
                prompt_with_context += f"Primary Topic: {ctx.get('primary_topic')}\n"
            prompt_with_context += f"Is Follow-up: {ctx.get('is_followup')}\n\n"

        prompt_with_context += (
            f"Context:\n\n" +
            "\n\n".join(context_parts) +
            f"\n\nQuestion: {request.prompt}"
        )

        # Stage 6: LLM
        print(f"\n🤖 STAGE 5: LLM INFERENCE")
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt_with_anchor},
                {"role": "user", "content": prompt_with_context}
            ],
            temperature=0.1,
            max_tokens=1500
        )

        print(f"\n✅ QUERY COMPLETE\n{'='*80}\n")

        return {
            "answer": completion.choices[0].message.content,
            "sources": source_list,
            "context_analysis": {
                "anchor_subject": context_awareness.anchor_subject if context_awareness else None,
                "is_locked": context_awareness.is_locked if context_awareness else False,
                "is_pivot": context_awareness.is_pivot if context_awareness else False,
                "detected_intent": context_awareness.detected_intent if context_awareness else None
            },
            "retrieval_stats": {
                "candidates_gathered": len(all_candidates),
                "candidates_selected": len(ranked_candidates),
                "final_sources": len(source_list)
            }
        }

    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# INGEST ENDPOINT
# ============================================================================

@app.post("/ingest")
async def ingest_pdf(file: UploadFile = File(...)):
    try:
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="File must be a PDF")

        try:
            reader = PdfReader(file.file)
        except Exception as pdf_error:
            raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(pdf_error)}")

        if len(reader.pages) == 0:
            raise HTTPException(status_code=400, detail="PDF file has no pages")

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=300)
        all_chunks = []
        all_metadatas = []
        extracted_pages = 0

        for page_num, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                if not page_text or page_text.strip() == "":
                    continue
                extracted_pages += 1
                for chunk in splitter.split_text(page_text):
                    all_chunks.append(chunk)
                    all_metadatas.append({
                        "source": file.filename,
                        "page": page_num + 1,
                        "link": f"local://{file.filename}#page={page_num + 1}",
                        "data_type": DataTypeLabel.THEORETICAL_METHODOLOGY,
                        "type_instruction": DataTypeLabel.get_label_instruction(DataTypeLabel.THEORETICAL_METHODOLOGY)
                    })
            except Exception:
                continue

        if len(all_chunks) == 0:
            raise HTTPException(status_code=400, detail="No extractable text found in PDF.")

        collection.add(
            documents=all_chunks,
            ids=[f"{file.filename}_{i}_{os.urandom(4).hex()}" for i in range(len(all_chunks))],
            metadatas=all_metadatas
        )

        return {
            "message": f"Successfully indexed {file.filename}",
            "chunks_created": len(all_chunks),
            "pages_extracted": extracted_pages,
            "total_pages": len(reader.pages)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "sources": {
            "pubmed": "✅ Active",
            "clinical_trials": "✅ Active",
            "semantic_scholar": "✅ Active",
            "crossref": "✅ Active",
            "openalex": "✅ Active",
            "local_pdfs": "✅ Active"
        },
        "reranking": "⚡ Simple selection (optimized for free tier)",
        "subject_locking_ready": True
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))