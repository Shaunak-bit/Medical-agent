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
from sentence_transformers import CrossEncoder
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
rerank_model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')

# ============================================================================
# FIX #1: UPDATE PYDANTIC MODEL - Add context_awareness field
# ============================================================================

class BridgedQuery(BaseModel):
    """Bridged query with weight information from Express backend"""
    query: str
    bridge_type: str
    weight: str  # "high", "medium", "low"

class ContextAwareness(BaseModel):
    """Context awareness payload from Subject Locking (Express)"""
    anchor_subject: Optional[str] = None
    anchor_confidence: float = 0.0
    is_locked: bool = False
    is_pivot: bool = False
    last_subject: Optional[str] = None
    detected_intent: Optional[str] = None
    bridged_queries_with_weights: Optional[List[BridgedQuery]] = None

class QueryRequest(BaseModel):
    """FIX #1: Updated to accept context_awareness field"""
    prompt: str
    expanded_queries: List[str]
    system_prompt: str
    user_role: str
    conversation_context: Optional[dict] = None
    # ✅ NEW FIELD: This "opens the slot" for the Express data
    context_awareness: Optional[ContextAwareness] = None

# ============================================================================
# LOGIC 1: Data Type Labeling System
# ============================================================================
class DataTypeLabel:
    """
    Defines source hierarchy and context types.
    This tells the LLM how to prioritize and interpret different sources.
    """
    THEORETICAL_METHODOLOGY = "Theoretical Methodology"
    LIVE_RESEARCH = "Live Research (PubMed)"
    ACTIVE_RECRUITING_STUDY = "Active Recruiting Study (ClinicalTrials.gov)"
    
    HIERARCHY = {
        ACTIVE_RECRUITING_STUDY: 1,      # Highest priority - current, real trials
        LIVE_RESEARCH: 2,                # Medium priority - recent publications
        THEORETICAL_METHODOLOGY: 3       # Lower priority - general knowledge
    }

    @staticmethod
    def get_label_instruction(label: str) -> str:
        """Return contextual instruction for each label type."""
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
            )
        }
        return instructions.get(label, "")

class PubMedFetcher:
    """Handles deep retrieval from NCBI PubMed API"""
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

            fetch_params = {
                "db": "pubmed",
                "id": ",".join(id_list),
                "retmode": "xml"
            }
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

class ClinicalTrialsFetcher:
    """
    Handles retrieval from ClinicalTrials.gov API v2 with term-based searching.
    """
    BASE_URL = "https://clinicaltrials.gov/api/v2/studies"

    async def fetch_trials(self, expanded_queries: List[str], limit: int = 15):
        """
        Use expanded_queries for term-based search.
        """
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
                    status_info = protocol.get("statusModule", {})
                    desc_info = protocol.get("descriptionModule", {})
                    eligibility = protocol.get("eligibilityModule", {})
                    locations_info = protocol.get("contactsLocationsModule", {})

                    title = id_info.get("briefTitle", "Untitled Trial")
                    nct_id = id_info.get("nctId", "N/A")
                    summary = desc_info.get("briefSummary", "No summary available.")
                    criteria = eligibility.get("eligibilityCriteria", "No criteria listed.")
                    
                    # Extract locations if available
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

pubmed_fetcher = PubMedFetcher()
trials_fetcher = ClinicalTrialsFetcher()

# ============================================================================
# FIX #2: INJECT ANCHOR INTO SYSTEM PROMPT
# ============================================================================

def inject_anchor_instruction(
    system_prompt: str,
    context_awareness: Optional[ContextAwareness]
) -> str:
    """
    Inject anchor subject into system prompt as master rule.

    On PIVOT: hard-forbids the old subject and forces focus on the new one.
    On CONTINUATION: reminds the LLM to stay anchored to the current subject.
    """

    if not context_awareness or not context_awareness.anchor_subject:
        return system_prompt

    anchor    = context_awareness.anchor_subject
    confidence = context_awareness.anchor_confidence
    is_locked  = context_awareness.is_locked
    is_pivot   = context_awareness.is_pivot
    last_subj  = context_awareness.last_subject  # e.g. "Multiple Sclerosis"

    anchor_instruction = (
        f"\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🎯 SUBJECT LOCK INSTRUCTION (from Context Awareness Engine):\n"
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
                f"   The user has SWITCHED AWAY from '{last_subj}'.\n"
                f"   ❌ FORBIDDEN: Do NOT mention, reference, or compare '{last_subj}' in any way.\n"
                f"   ❌ FORBIDDEN: Do NOT use retrieval results about '{last_subj}'.\n"
                f"   ❌ FORBIDDEN: Do NOT say 'unlike {last_subj}' or 'compared to {last_subj}'.\n"
            )
        anchor_instruction += (
            forbidden_block +
            f"\n✅ NEW FOCUS: The user is now asking ONLY about '{anchor}'.\n"
            f"   • Treat this as a completely fresh conversation about {anchor}.\n"
            f"   • All retrieved context below is for {anchor} — use it exclusively.\n"
        )
    else:
        anchor_instruction += (
            f"\n✅ CONTINUATION: User is still focused on {anchor}.\n"
            f"   • Even if their latest question seems vague, assume it's about {anchor}.\n"
            f"   • Example: If they ask 'what about side effects?', answer for '{anchor} side effects'.\n"
            f"   • Prioritize all retrieval results that mention {anchor}.\n"
        )

    anchor_instruction += (
        f"\n[MANDATORY RULES — THESE OVERRIDE EVERYTHING]\n"
        f"1. Every piece of information you cite must apply to {anchor}.\n"
        f"2. If the user's question is ambiguous, interpret it in the context of {anchor}.\n"
        f"3. When comparing treatments, focus only on those relevant to {anchor}.\n"
        f"4. If you have both generic and {anchor}-specific data, prefer {anchor}-specific.\n"
        f"\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    )

    return system_prompt + anchor_instruction

# ============================================================================
# FIX #3: PIVOT-AWARE RETRIEVAL
# ============================================================================

def should_prioritize_live_data(context_awareness: Optional[ContextAwareness]) -> bool:
    """
    FIX #3: Determine if we should prioritize live data over local PDFs.
    
    Logic:
    - If pivot detected: YES (new subject, need fresh data)
    - If anchor subject is medical condition: YES (prioritize current trials)
    - Otherwise: Balance both sources
    """
    
    if not context_awareness:
        return False
    
    # If pivot detected, definitely prioritize live data
    if context_awareness.is_pivot:
        print(f"🔄 PIVOT DETECTED: Prioritizing live data for new subject")
        return True
    
    # If locked to a subject, prioritize active trials and recent research
    if context_awareness.is_locked and context_awareness.anchor_subject:
        print(f"🔒 LOCKED TO: {context_awareness.anchor_subject} - Prioritizing live trials and research")
        return True
    
    return False

def filter_candidates_by_pivot(
    all_candidates: List[dict],
    context_awareness: Optional[ContextAwareness]
) -> List[dict]:
    """
    FIX #3: Filter out candidates from previous subject if pivot detected.
    
    This prevents "context bleed" where results from the old topic
    contaminate results for the new topic.
    """
    
    if not context_awareness or not context_awareness.is_pivot:
        # No pivot - keep all candidates
        return all_candidates
    
    print("   🧹 PIVOT DETECTED: Clearing internal short-term memory and focusing solely on new subject.")
    
    last_subject = context_awareness.last_subject
    new_subject = context_awareness.anchor_subject
    
    if not last_subject:
        # No previous subject to filter
        return all_candidates
    
    # Filter: Keep only candidates that DON'T mention the old subject,
    # OR that explicitly mention the new subject, effectively focusing only on the new searches.
    filtered = []
    for cand in all_candidates:
        content = cand.get("content", "").lower()
        meta = cand.get("metadata", {})
        
        # If it explicitly mentions the new subject, definitely keep it
        if new_subject and new_subject.lower() in content:
            filtered.append(cand)
            continue
            
        # If content mentions old subject and not the new one, skip it
        if last_subject.lower() in content:
            print(f"   ❌ Filtering out (old subject '{last_subject}' mentioned without target '{new_subject}'): {meta.get('source')} {meta.get('page')}")
            continue
        
        filtered.append(cand)
    
    print(f"   Pivot filtering: {len(all_candidates)} candidates → {len(filtered)} candidates")
    return filtered

# ============================================================================
# FALLBACK: Retrieve All Documents from ChromaDB (For General Queries)
# ============================================================================

def get_all_chroma_documents() -> List[dict]:
    """
    Retrieve all documents from ChromaDB without semantic filtering.
    Useful when user asks generic questions like "what is in the pdf".
    """
    try:
        print(f"   📂 Fallback: Retrieving all documents from ChromaDB...")
        
        # Get collection size (count)
        count = collection.count()
        print(f"   📊 Collection has {count} documents total")
        
        if count == 0:
            print(f"   ⚠️  ChromaDB collection is empty - no PDFs have been ingested")
            return []
        
        # Get all documents (no filtering)
        # ChromaDB doesn't have a "get all" in newer versions, so we use query with a generic string
        all_docs = collection.get()
        
        candidates = []
        if all_docs and all_docs.get('documents'):
            for doc, meta in zip(all_docs['documents'], all_docs['metadatas']):
                if "data_type" not in meta:
                    meta["data_type"] = DataTypeLabel.THEORETICAL_METHODOLOGY
                    meta["type_instruction"] = DataTypeLabel.get_label_instruction(
                        DataTypeLabel.THEORETICAL_METHODOLOGY
                    )
                candidates.append({"content": doc, "metadata": meta})
            
            print(f"   ✅ Retrieved {len(candidates)} documents from ChromaDB")
            # Group by source for logging
            sources_found = {}
            for cand in candidates:
                source = cand['metadata'].get('source', 'Unknown')
                sources_found[source] = sources_found.get(source, 0) + 1
            
            for source, count in sources_found.items():
                print(f"      • {source}: {count} chunks")
        
        return candidates
    except Exception as e:
        print(f"   ❌ Error retrieving all documents: {str(e)}")
        return []

# ============================================================================
# FIX #4: USE BRIDGED QUERIES FOR ALL API CALLS
# ============================================================================

async def gather_candidates_with_bridge_priority(
    request: QueryRequest,
    context_awareness: Optional[ContextAwareness]
) -> List[dict]:
    """
    Gather candidates using bridged queries with pivot-awareness.

    PIVOT CASE  : Ignore ALL old bridged queries (which are tainted by the old
                  subject). Build fresh search terms directly from the new anchor.
    NORMAL CASE : Use high-weight bridged queries from Express (anchor + intent).
    """

    all_candidates = []
    is_pivot   = context_awareness.is_pivot   if context_awareness else False
    new_anchor = context_awareness.anchor_subject if context_awareness else None

    # ── PIVOT: restart with clean, anchor-focused queries ──────────────────────
    if is_pivot and new_anchor:
        print(f"\n🔄 PIVOT MODE: Ignoring old bridged queries. Building fresh queries for '{new_anchor}'.")
        queries_to_use = [
            new_anchor,
            f"{new_anchor} treatment",
            f"{new_anchor} management",
            f"{new_anchor} clinical trials",
            request.prompt,            # include the user's exact words too
        ]
        print(f"   Fresh pivot queries: {queries_to_use}")

    # ── NORMAL: use high-weight bridged queries supplied by Express ─────────────
    else:
        queries_to_use = request.expanded_queries
        if context_awareness and context_awareness.bridged_queries_with_weights:
            high_weight   = [bq.query for bq in context_awareness.bridged_queries_with_weights if bq.weight == "high"]
            medium_weight = [bq.query for bq in context_awareness.bridged_queries_with_weights if bq.weight == "medium"]
            if high_weight:
                queries_to_use = high_weight + medium_weight + request.expanded_queries
                print(f"🌉 Using bridged queries (high-weight priority)")

    # A. Local PDF Context
    print(f"\n📚 LOCAL PDF RETRIEVAL")
    
    # Check if the user is specifically asking about a local document
    intent = context_awareness.detected_intent if context_awareness else None
    is_local_document = (intent == "local_document") or any(word in request.prompt.lower() for word in ["pdf", "document", "file", "uploaded", "this paper"])
    
    target_source = None
    if is_local_document:
        try:
            meta_res = collection.get(include=["metadatas"])
            if meta_res and meta_res.get('metadatas') and len(meta_res['metadatas']) > 0:
                target_source = meta_res['metadatas'][-1].get('source')
                
                # If they explicitly mention a known source in the prompt, use that instead
                sources = set(m.get('source') for m in meta_res['metadatas'] if m.get('source'))
                for src in sources:
                    if src.lower().replace(".pdf", "") in request.prompt.lower() or src.lower() in request.prompt.lower():
                        target_source = src
                        break
                print(f"   📄 Target document identified: {target_source}")
        except Exception as e:
            print(f"   ❌ Error identifying target document: {str(e)}")

    print(f"   Queries to search: {queries_to_use[:2]}")
    
    for q in queries_to_use[:2]:
        try:
            print(f"   🔍 Searching for: '{q}'")
            if target_source:
                local_res = collection.query(query_texts=[q], n_results=15, where={"source": target_source})
            else:
                local_res = collection.query(query_texts=[q], n_results=15)
            
            # Debug: Check what ChromaDB returned
            if not local_res:
                print(f"   ⚠️  ChromaDB returned None")
                continue
                
            if not local_res.get('documents') or len(local_res['documents']) == 0:
                print(f"   ⚠️  No documents found for query: '{q}'")
                continue
            
            docs_count = len(local_res['documents'][0]) if local_res['documents'][0] else 0
            print(f"   ✅ Found {docs_count} results for query: '{q}'")
            
            for i, (doc, meta) in enumerate(zip(local_res['documents'][0], local_res['metadatas'][0])):
                if "data_type" not in meta:
                    meta["data_type"] = DataTypeLabel.THEORETICAL_METHODOLOGY
                    meta["type_instruction"] = DataTypeLabel.get_label_instruction(
                        DataTypeLabel.THEORETICAL_METHODOLOGY
                    )
                all_candidates.append({"content": doc, "metadata": meta})
                print(f"      [{i+1}] {meta.get('source')} - Page {meta.get('page')}")
        except Exception as e:
            print(f"   ❌ Error querying ChromaDB for '{q}': {str(e)}")
            import traceback
            traceback.print_exc()

    # ⚠️ FALLBACK: If semantic search found nothing, get all documents from collection
    if len(all_candidates) == 0:
        print(f"\n⚠️  FALLBACK: Semantic search returned 0 results")
        fallback_docs = get_all_chroma_documents()
        all_candidates.extend(fallback_docs)
        print(f"   Added {len(fallback_docs)} documents via fallback retrieval")

    # B. Live PubMed Data
    print(f"\n🔬 PUBMED RETRIEVAL")
    if is_local_document:
        print("   Skipping PubMed retrieval (intent is local_document)")
    else:
        primary_query = queries_to_use[0] if queries_to_use else request.prompt
        live_research = await pubmed_fetcher.fetch_research(primary_query, limit=25)
        all_candidates.extend(live_research)
        print(f"   ✓ Retrieved {len(live_research)} PubMed articles")

    # C. Live Clinical Trials
    print(f"\n🏥 CLINICAL TRIALS RETRIEVAL")
    if is_local_document:
        print("   Skipping Clinical Trials retrieval (intent is local_document)")
    else:
        live_trials = await trials_fetcher.fetch_trials(queries_to_use, limit=15)
        all_candidates.extend(live_trials)
        print(f"   ✓ Retrieved {len(live_trials)} active clinical trials")

    return all_candidates

# ============================================================================
# MAIN QUERY ENDPOINT
# ============================================================================

@app.post("/query")
async def query_assistant(request: QueryRequest):
    try:
        print(f"\n{'='*80}")
        print(f"📝 QUERY PROCESSING WITH SUBJECT LOCKING")
        print(f"{'='*80}")
        
        # Extract context awareness
        context_awareness = request.context_awareness
        
        if context_awareness:
            print(f"\n🎯 CONTEXT AWARENESS DETECTED:")
            print(f"   Anchor Subject: {context_awareness.anchor_subject}")
            print(f"   Is Locked: {context_awareness.is_locked}")
            print(f"   Is Pivot: {context_awareness.is_pivot}")
            print(f"   Detected Intent: {context_awareness.detected_intent}")

            if context_awareness.is_pivot:
                print("   🧹 PIVOT FLUSH: Clearing internal short-term conversation context to focus on new subject.")
                request.conversation_context = None

        # ========================================================================
        # Stage 1: Gather Candidates with Bridge Priority (FIX #4)
        # ========================================================================
        print(f"\n📊 STAGE 1: CANDIDATE GATHERING (with Bridge Priority)")
        all_candidates = await gather_candidates_with_bridge_priority(request, context_awareness)

        # ========================================================================
        # Stage 2: Pivot-Aware Filtering (FIX #3)
        # ========================================================================
        print(f"\n🔄 STAGE 2: PIVOT-AWARE FILTERING (FIX #3)")
        all_candidates = filter_candidates_by_pivot(all_candidates, context_awareness)

        if not all_candidates:
            return {
                "answer": "I couldn't find any relevant research or trials.",
                "sources": []
            }

        # ========================================================================
        # Stage 3: Intelligent Re-Ranking
        # ========================================================================
        print(f"\n⚡ STAGE 3: INTELLIGENT RE-RANKING")
        pairs = [[request.prompt, cand["content"]] for cand in all_candidates]
        scores = rerank_model.predict(pairs)
        
        for i, cand in enumerate(all_candidates):
            cand["score"] = float(scores[i])

        ranked_candidates = sorted(all_candidates, key=lambda x: x["score"], reverse=True)[:8]
        print(f"   ✓ Top 8 candidates selected from {len(all_candidates)} total")

        # ========================================================================
        # Stage 4: Format Context with Type Labels
        # ========================================================================
        context_parts = []
        source_list = []
        
        for cand in ranked_candidates:
            meta = cand["metadata"]
            data_type = meta.get("data_type", "Unknown")
            type_instruction = meta.get("type_instruction", "")
            citation = f"[Source: {meta.get('source')}, Ref: {meta.get('page')}]"
            type_label = f"[{data_type}]"
            
            context_entry = f"{type_label} {type_instruction}\n{citation}\n{cand['content']}"
            context_parts.append(context_entry)
            
            source_list.append({
                "file": meta.get('source'),
                "page": meta.get('page'),
                "link": meta.get('link'),
                "data_type": data_type
            })

        # ========================================================================
        # Stage 5: Inject Anchor into System Prompt (FIX #2)
        # ========================================================================
        print(f"\n🔧 STAGE 4: BUILDING ENHANCED SYSTEM PROMPT (FIX #2)")
        system_prompt_with_anchor = inject_anchor_instruction(request.system_prompt, context_awareness)
        
        # Build final prompt with context
        prompt_with_context = ""
        if request.conversation_context:
            ctx = request.conversation_context
            prompt_with_context += "Previous Conversation Context:\n"
            if ctx.get('primary_topic'):
                prompt_with_context += f"Primary Topic: {ctx.get('primary_topic')}\n"
            prompt_with_context += f"Is Follow-up: {ctx.get('is_followup')}\n\n"
            
        prompt_with_context += (
            f"Context (organized by data type):\n\n" +
            "\n\n".join(context_parts) +
            f"\n\nQuestion: {request.prompt}"
        )

        # ========================================================================
        # Stage 6: Call Groq with Enhanced System Prompt
        # ========================================================================
        print(f"\n🤖 STAGE 5: LLM INFERENCE")
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    # Use the anchor-enhanced system prompt
                    "content": system_prompt_with_anchor
                },
                {
                    "role": "user",
                    "content": prompt_with_context
                }
            ],
            temperature=0.1,
            max_tokens=1500
        )

        print(f"\n✅ QUERY COMPLETE")
        print(f"{'='*80}\n")

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
                "candidates_after_pivot_filter": len(ranked_candidates),
                "final_sources": len(source_list)
            }
        }

    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest")
async def ingest_pdf(file: UploadFile = File(...)):
    """
    Ingest PDF and add to vector database with Data Type Labeling
    """
    try:
        print(f"[Python Brain] Starting PDF ingestion: {file.filename}")
        print(f"[Python Brain] File size: {file.size} bytes, Content type: {file.content_type}")
        
        # Validate file is actually a PDF
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="File must be a PDF")
        
        # Read the PDF file
        try:
            reader = PdfReader(file.file)
            print(f"[Python Brain] PDF loaded successfully with {len(reader.pages)} pages")
        except Exception as pdf_error:
            print(f"[Python Brain] Error reading PDF: {str(pdf_error)}")
            raise HTTPException(
                status_code=400, 
                detail=f"Failed to read PDF file: {str(pdf_error)}"
            )
        
        # If PDF has no pages
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
                    print(f"[Python Brain] Warning: Page {page_num + 1} extracted no text")
                    continue
                
                extracted_pages += 1
                page_chunks = splitter.split_text(page_text)
                
                for chunk in page_chunks:
                    all_chunks.append(chunk)
                    all_metadatas.append({
                        "source": file.filename,
                        "page": page_num + 1,
                        "link": f"local://{file.filename}#page={page_num + 1}",
                        "data_type": DataTypeLabel.THEORETICAL_METHODOLOGY,
                        "type_instruction": DataTypeLabel.get_label_instruction(
                            DataTypeLabel.THEORETICAL_METHODOLOGY
                        )
                    })
            except Exception as page_error:
                print(f"[Python Brain] Error processing page {page_num + 1}: {str(page_error)}")
                # Continue with next page instead of failing
                continue

        if len(all_chunks) == 0:
            raise HTTPException(
                status_code=400, 
                detail="No extractable text found in PDF. The PDF may be scanned/image-based without OCR."
            )

        # Add to ChromaDB
        try:
            collection.add(
                documents=all_chunks,
                ids=[f"{file.filename}_{i}_{os.urandom(4).hex()}" for i in range(len(all_chunks))],
                metadatas=all_metadatas
            )
            print(f"[Python Brain] Successfully added {len(all_chunks)} chunks to ChromaDB")
        except Exception as chroma_error:
            print(f"[Python Brain] ChromaDB storage error: {str(chroma_error)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to store chunks in vector database: {str(chroma_error)}"
            )
        
        return {
            "message": f"Successfully indexed {file.filename}",
            "chunks_created": len(all_chunks),
            "pages_extracted": extracted_pages,
            "total_pages": len(reader.pages),
            "data_type": DataTypeLabel.THEORETICAL_METHODOLOGY
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Python Brain] Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "features": {
            "fix_1_pydantic_context_awareness": "✅ QueryRequest accepts context_awareness",
            "fix_2_anchor_injection": "✅ Anchor subject injected into system prompt",
            "fix_3_pivot_aware_retrieval": "✅ Pivot detection filters old subject results",
            "fix_4_bridge_queries": "✅ Uses bridged queries for all API calls",
            "data_type_labeling": "✅ Sources labeled by type (Active Trial/Live Research/Methodology)",
            "multi_source_retrieval": "✅ PubMed + ClinicalTrials + Local PDFs",
            "cross_encoder_reranking": "✅ Semantic reranking with CrossEncoder"
        },
        "subject_locking_ready": True
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)