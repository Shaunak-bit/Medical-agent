import { Router, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import { prisma } from "../lib/prisma.js";
import middleware from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import Groq from "groq-sdk";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const PYTHON_BRAIN_URL = process.env.PYTHON_BRAIN_URL || "http://127.0.0.1:8000";
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// ============================================================================
// TYPE DEFINITIONS - ENHANCED FOR SUBJECT LOCKING
// ============================================================================

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    createdAt?: Date;
}

interface ConversationMetadata {
    anchorSubject: string | null;           // Locked subject (e.g., "Parkinson's")
    anchorConfidence: number;               // 0-1: how confident we are
    lastSubject: string | null;             // Previous subject
    isPivot: boolean;                       // Did the user change topics?
    pivotReason?: string;                   // Why we detected a pivot
    analysisTimestamp: Date;
    conversationTurn: number;               // Which turn in conversation
}

interface SubjectLockState {
    locked: boolean;                        // Is the subject locked?
    subject: string;                        // The locked subject
    confidence: number;                     // Lock confidence
    lastUpdated: Date;
    messagesSinceUpdate: number;
}

interface BridgedQuery {
    term: string;
    bridge: string;
    weight: "high" | "medium" | "low"; // Change this from searchWeight
}

interface EnhancedConversationContext {
    messages: ChatMessage[];
    metadata: ConversationMetadata;
    subjectLock: SubjectLockState;
    originalQuery: string;
    detectedIntent: string;
}

// ============================================================================
// MEDICAL SUBJECT DATABASE - Comprehensive Disease & Treatment Terms
// ============================================================================

const MEDICAL_SUBJECTS = {
    "Neurological": {
        "Parkinson's": ["parkinson", "pd", "levodopa", "dopamine", "bradykinesia"],
        "Alzheimer's": ["alzheimer", "dementia", "amyloid", "tau", "cognitive decline"],
        "Multiple Sclerosis": ["ms", "multiple sclerosis", "ms", "demyelinating", "relapsing-remitting"],
        "Epilepsy": ["seizure", "epilepsy", "convulsion", "anticonvulsant"],
        "Migraine": ["migraine", "headache", "triptans", "migrainous"]
    },
    "Cardiovascular": {
        "Hypertension": ["hypertension", "high blood pressure", "blood pressure", "antihypertensive"],
        "Heart Failure": ["heart failure", "chf", "ventricular", "cardiomyopathy", "heart", "cardiac"],
        "Coronary Artery Disease": ["cad", "coronary", "acute coronary", "stent", "cardio"],
        "Atrial Fibrillation": ["afib", "atrial fibrillation", "arrhythmia"]
    },
    "Endocrine": {
        "Type 2 Diabetes": ["type 2 diabetes", "diabetes", "t2d", "metformin", "hba1c", "insulin", "glucose", "sugar", "diabetic"],
        "Type 1 Diabetes": ["type 1 diabetes", "t1d", "autoimmune diabetes", "juvenile diabetes"],
        "Thyroid Disease": ["thyroid", "hypothyroidism", "hyperthyroidism", "tsh"]
    },
    "Oncology": {
        "Lung Cancer": ["lung cancer", "nsclc", "small cell", "chemotherapy"],
        "Breast Cancer": ["breast cancer", "oncology", "hormone receptor"],
        "Colorectal Cancer": ["colorectal cancer", "colon cancer", "crc"]
    },
    "Rheumatology": {
        "Rheumatoid Arthritis": ["rheumatoid arthritis", "ra", "tnf inhibitor", "dmard"],
        "Osteoarthritis": ["osteoarthritis", "oa", "joint", "cartilage"]
    },
    "Respiratory": {
        "COPD": ["copd", "chronic obstructive pulmonary disease", "emphysema"],
        "Asthma": ["asthma", "bronchial", "inhaler", "albuterol"],
        "COVID-19": ["covid", "sars-cov-2", "coronavirus", "pandemic"]
    }
};

// ============================================================================
// INTENT KEYWORDS - Detect what the user is asking ABOUT the subject
// ============================================================================

const INTENT_KEYWORDS = {
    "treatment": ["treatment", "therapy", "medication", "drug", "intervention", "cure"],
    "side_effects": ["side effect", "adverse", "toxicity", "safety", "tolerance", "complication"],
    "diagnosis": ["diagnose", "diagnosis", "diagnostic", "screening", "biomarker"],
    "pathophysiology": ["mechanism", "pathophysiology", "pathogenesis", "etiology", "cause"],
    "clinical_trial": ["clinical trial", "trial", "rct", "randomized", "efficacy", "study"],
    "latest_research": ["latest", "recent", "emerging", "novel", "breakthrough", "new development"],
    "epidemiology": ["epidemiology", "prevalence", "incidence", "risk factor", "demographic"],
    "prognosis": ["prognosis", "outcome", "survival", "remission", "relapse"],
    "local_document": ["pdf", "document", "file", "uploaded", "this paper", "upload"]
};

// ============================================================================
// HELPER: Extract Keywords from a Subject
// Used for semantic gap detection in pivot logic
// ============================================================================

function getSubjectKeywords(subject: string): string[] {
    if (!subject) return [];

    for (const category of Object.values(MEDICAL_SUBJECTS)) {
        if (category[subject as keyof typeof category]) {
            return category[subject as keyof typeof category];
        }
    }
    return [];
}

/**
 * Calculate semantic overlap between two strings
 * Returns 0-1: how much keyword overlap exists
 */
function calculateSemanticOverlap(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

// ============================================================================
// PART 1: SUBJECT LABEL EXTRACTION - Anchor Disease Detection
// ENHANCED: Recency-First with fallback to history
// ============================================================================

/**
 * Scans conversation history to identify the "Anchor Subject"
 * The anchor is the disease/condition that dominates the conversation.
 * 
 * ENHANCED LOGIC:
 * - FAST PATH: Latest-Message-First (NEW MESSAGE OVERRIDE)
 * - FALLBACK: Full history scoring (only if latest message has NO medical terms)
 * 
 * @param history - Recent chat messages
 * @returns { subject: string, confidence: number }
 */
function extractAnchorSubject(history: ChatMessage[]): { subject: string | null, confidence: number } {
    if (history.length === 0) {
        return { subject: null, confidence: 0 };
    }

    // ── FAST PATH: Latest-Message-First ─────────────────────────────────────────
    // Scan ONLY the most recent user message for medical keywords.
    // If ANY subject is found here, return it immediately with HIGH confidence.
    // This guarantees a single new sentence (e.g. "Tell me about Ligaments") can
    // override an entire history about Parkinson's.
    const latestUserMsg = [...history].reverse().find(m => m.role === "user");
    const latestText = latestUserMsg ? latestUserMsg.content.toLowerCase() : "";

    if (latestText) {
        for (const [category, diseases] of Object.entries(MEDICAL_SUBJECTS)) {
            for (const [diseaseName, keywords] of Object.entries(diseases)) {
                for (const keyword of keywords) {
                    if (latestText.includes(keyword.toLowerCase())) {
                        console.log(`🚨 LATEST-MSG MATCH: "${diseaseName}" via keyword "${keyword}" → fast-path return`);
                        console.log(`   Category: ${category}`);
                        console.log(`   Confidence: 95% (latest-message override)`);
                        return { subject: diseaseName, confidence: 0.95 };
                    }
                }
            }
        }
    }

    // Check for document/PDF reference in latest message (intent: local_document)
    const documentKeywords = INTENT_KEYWORDS.local_document;
    if (latestText && documentKeywords.some(kw => latestText.includes(kw))) {
        console.log(`📄 DOCUMENT REFERENCE detected in latest message`);
        console.log(`   Subject will be determined by document context, not history`);
        return { subject: null, confidence: 0 };  // Force pivot/reset
    }

    // ── FALLBACK: Full history scoring (no new subject in latest message) ─────────
    // Only reached when the user's latest message has no medical keywords at all
    // (e.g. "What about side effects?" — a vague follow-up).
    console.log(`   No subject in latest message → falling back to history scoring`);
    const allText = history.map(msg => msg.content.toLowerCase()).join(" ");
    const subjectScores = new Map<string, { score: number, category: string }>();

    for (const [category, diseases] of Object.entries(MEDICAL_SUBJECTS)) {
        for (const [diseaseName, keywords] of Object.entries(diseases)) {
            let score = 0;
            for (const keyword of keywords) {
                const regex = new RegExp(keyword, "gi");
                const matches = allText.match(regex) || [];
                score += matches.length;
            }
            if (score > 0) {
                subjectScores.set(diseaseName, { score, category });
            }
        }
    }

    if (subjectScores.size === 0) {
        return { subject: null, confidence: 0 };
    }

    const sortedSubjects = Array.from(subjectScores.entries())
        .sort((a, b) => b[1].score - a[1].score);

    const firstResult = sortedSubjects[0];
    if (!firstResult) {
        return { subject: null, confidence: 0 };
    }

    const [topSubject, topData] = firstResult;
    const totalScore = Array.from(subjectScores.values()).reduce((sum, item) => sum + item.score, 0);
    const confidence = topData.score / Math.max(totalScore, 1);

    console.log(`🎯 Anchor Subject (history scan):`);
    console.log(`   Subject: ${topSubject}`);
    console.log(`   Category: ${topData.category}`);
    console.log(`   Confidence: ${(confidence * 100).toFixed(0)}%`);
    console.log(`   Score: ${topData.score}/${totalScore}`);

    return { subject: topSubject, confidence };
}

// ============================================================================
// PART 2: PIVOT DETECTION - Subject Change vs. Follow-up
// ENHANCED: Add semantic gap detection to prevent context bleed
// ============================================================================

/**
 * ENHANCED: Detects whether the user is pivoting to a new subject or continuing.
 * 
 * NEW LOGIC:
 * - Semantic Gap Check: If new prompt has zero overlap with old subject's keywords,
 *   trigger a pivot even without a new subject detected.
 * 
 * @param newPrompt - User's current query
 * @param lastAnchor - Previously locked subject
 * @param currentAnchor - Currently detected anchor
 * @returns { isPivot: boolean, reason: string }
 */
function detectPivot(
    newPrompt: string,
    lastAnchor: string | null,
    currentAnchor: string | null
): { isPivot: boolean, reason: string } {
    // Rule 1: No history = no pivot
    if (!lastAnchor) {
        return { isPivot: false, reason: "No previous subject to pivot from" };
    }

    // Rule 2: New clear subject detected that differs from last — AGGRESSIVE PIVOT
    if (currentAnchor && currentAnchor !== lastAnchor) {
        return {
            isPivot: true,
            reason: `Subject changed from "${lastAnchor}" to "${currentAnchor}" (aggressive pivot)`
        };
    }

    // Rule 2.5: NEW SEMANTIC GAP CHECK
    // If the new prompt has zero overlap with the old subject's keywords,
    // this likely means the user is discussing something completely different.
    // Example: lastAnchor="Parkinson's", newPrompt="Tell me about ligaments"
    // → No keyword overlap → PIVOT even though currentAnchor=null
    const lastAnchorKeywords = getSubjectKeywords(lastAnchor);
    const promptLower = newPrompt.toLowerCase();

    if (lastAnchorKeywords.length > 0) {
        const keywordOverlap = lastAnchorKeywords.some(kw =>
            promptLower.includes(kw.toLowerCase())
        );

        if (!keywordOverlap) {
            // Check semantic gap: how different is the prompt from the old subject?
            const semanticGap = 1 - calculateSemanticOverlap(
                lastAnchorKeywords.join(" "),
                newPrompt
            );

            // If semantic gap is very high (>0.7 = 70% different), treat as pivot
            if (semanticGap > 0.7) {
                console.log(`   🔍 Semantic Gap Detected: ${(semanticGap * 100).toFixed(0)}% different`);
                return {
                    isPivot: true,
                    reason: `High semantic gap (${(semanticGap * 100).toFixed(0)}%) from "${lastAnchor}" → pivot to new context`
                };
            }
        }
    }

    // Rule 3: Explicit pivot phrases
    const pivotPhrases = [
        /now let me ask about/i,
        /different question/i,
        /let's switch to/i,
        /unrelated question/i,
        /back to/i,
        /reset/i,
        /different topic/i,
        /stop talking about/i,
        /forget (about )?that/i,
        /change (the )?subject/i,
        /new topic/i,
        /never mind/i,
        /forget (the )?previous/i,
        /clear (the )?history/i
    ];

    for (const phrase of pivotPhrases) {
        if (phrase.test(newPrompt)) {
            return {
                isPivot: true,
                reason: `Explicit pivot phrase detected: "${phrase.source}"`
            };
        }
    }

    // Rule 5: Vague continuation = likely NOT a pivot
    return { isPivot: false, reason: "Detected as follow-up (no pivot indicators)" };
}

// ============================================================================
// PART 3: INTENT DETECTION - What is the user asking ABOUT?
// ============================================================================

/**
 * Analyzes the query to detect the user's INTENT
 * Intent is separate from subject: "What about side effects?" = Intent: side_effects
 * 
 * @param query - User's prompt
 * @returns Intent category and matched keywords
 */
function detectIntent(query: string): { intent: string, keywords: string[], confidence: number } {
    const lowerQuery = query.toLowerCase();
    const intentScores = new Map<string, number>();

    for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS)) {
        let score = 0;
        const matchedKeywords: string[] = [];

        for (const keyword of keywords) {
            if (lowerQuery.includes(keyword.toLowerCase())) {
                score += 1;
                matchedKeywords.push(keyword);
            }
        }

        if (score > 0) {
            intentScores.set(intentType, score);
        }
    }

    if (intentScores.size === 0) {
        return { intent: "general_inquiry", keywords: [], confidence: 0 };
    }

    const topIntent = Array.from(intentScores.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "general_inquiry";

    const topScore = intentScores.get(topIntent) || 0;
    const confidence = topScore / Math.max(Array.from(intentScores.values()).reduce((a, b) => a + b, 0), 1);

    return {
        intent: topIntent,
        keywords: INTENT_KEYWORDS[topIntent as keyof typeof INTENT_KEYWORDS] || [],
        confidence
    };
}

// ============================================================================
// PART 4: PERSISTENT METADATA - MongoDB/Prisma Integration
// ============================================================================

/**
 * Saves conversation metadata to MongoDB using Upsert
 * This creates or updates a "ConversationState" record that persists across conversations
 * 
 * UPSERT LOGIC:
 * - If user has existing state: Update anchorSubject, confidence, increment conversationTurn
 * - If user is new: Create new record with detected subject
 * 
 * @param userId - User's ID
 * @param metadata - Metadata to save
 */
async function saveConversationMetadata(
    userId: string,
    metadata: ConversationMetadata
): Promise<void> {
    try {
        console.log(`💾 Saving metadata for user ${userId}:`);
        console.log(`   Anchor Subject: ${metadata.anchorSubject}`);
        console.log(`   Confidence: ${(metadata.anchorConfidence * 100).toFixed(0)}%`);
        console.log(`   Pivot: ${metadata.isPivot}`);
        console.log(`   Turn: ${metadata.conversationTurn}`);

        // UPSERT: Update if exists, create if not
        const savedState = await prisma.conversationState.upsert({
            where: { userId },
            update: {
                // Update fields when user already has state
                anchorSubject: metadata.anchorSubject,
                anchorConfidence: metadata.anchorConfidence,
                lastSubject: metadata.lastSubject,
                isPivot: metadata.isPivot,
                pivotReason: metadata.pivotReason,
                conversationTurn: metadata.conversationTurn,
                analysisTimestamp: metadata.analysisTimestamp,
                lastUpdated: new Date()
            },
            create: {
                // Create new record if user doesn't exist
                userId,
                anchorSubject: metadata.anchorSubject,
                anchorConfidence: metadata.anchorConfidence,
                lastSubject: metadata.lastSubject,
                isPivot: metadata.isPivot,
                pivotReason: metadata.pivotReason,
                conversationTurn: metadata.conversationTurn,
                analysisTimestamp: metadata.analysisTimestamp,
                lastUpdated: new Date()
            }
        });

        console.log(`✅ Metadata persisted to MongoDB`);
        console.log(`   Record ID: ${savedState.id}`);

    } catch (error) {
        console.warn("⚠️ Metadata save failed:", error);
        // Non-critical error: conversation continues even if metadata save fails
    }
}

/**
 * Retrieves the last conversation metadata from MongoDB
 * This is the "Memory" of what subject the user was discussing
 * 
 * @param userId - User's ID
 * @returns Last known metadata or null if user is new
 */
async function getLastConversationMetadata(userId: string): Promise<ConversationMetadata | null> {
    try {
        const savedState = await prisma.conversationState.findUnique({
            where: { userId }
        });

        if (!savedState) {
            console.log(`📭 No previous state found for user ${userId} (new user)`);
            return null;
        }

        console.log(`📖 Retrieved previous state for user ${userId}:`);
        console.log(`   Subject: ${savedState.anchorSubject}`);
        console.log(`   Confidence: ${(savedState.anchorConfidence * 100).toFixed(0)}%`);
        console.log(`   Turn: ${savedState.conversationTurn}`);

        // Reconstruct metadata object from database record
        const metadata: ConversationMetadata = {
            anchorSubject: savedState.anchorSubject,
            anchorConfidence: savedState.anchorConfidence,
            lastSubject: savedState.lastSubject,
            isPivot: savedState.isPivot,
            pivotReason: savedState.pivotReason ?? undefined,
            analysisTimestamp: savedState.analysisTimestamp,
            conversationTurn: savedState.conversationTurn
        };

        return metadata;

    } catch (error) {
        console.warn("⚠️ Metadata retrieval failed:", error);
        // Non-critical error: continue with null metadata
        return null;
    }
}

// ============================================================================
// PART 4B: INGEST-RESET HANDSHAKE (NEW FIX #1)
// ============================================================================

/**
 * Forces a conversation state reset when a new document is ingested.
 * This is the critical logic to prevent the "Parkinson's Obsession" bug.
 * 
 * STRATEGY:
 * - When a PDF is ingested, create/update ConversationState with:
 *   - anchorSubject = null (reset)
 *   - isPivot = true (signal a fresh start)
 *   - conversationTurn = 0 (restart the counter)
 * 
 * This "kills" the memory of previous medical subjects and forces the system
 * to re-detect the anchor from the new document context.
 * 
 * @param userId - User ID
 * @param documentName - Name of ingested document
 */
async function performIngestReset(userId: string, documentName: string): Promise<void> {
    try {
        console.log(`\n🔄 INGEST-RESET HANDSHAKE initiated`);
        console.log(`   Document: ${documentName}`);
        console.log(`   Action: Wiping subject lock and forcing pivot state`);

        const resetMetadata: ConversationMetadata = {
            anchorSubject: null,  // CRITICAL: Wipe the old subject
            anchorConfidence: 0,
            lastSubject: null,
            isPivot: true,        // Signal: This is a fresh conversation
            pivotReason: `New document ingested: "${documentName}" → conversation reset`,
            analysisTimestamp: new Date(),
            conversationTurn: 0   // Restart turn counter
        };

        await saveConversationMetadata(userId, resetMetadata);

        console.log(`✅ INGEST-RESET complete`);
        console.log(`   Old subject lock: WIPED`);
        console.log(`   Pivot state: ENABLED`);
        console.log(`   Next query will re-detect anchor from new document\n`);

    } catch (error) {
        console.warn("⚠️ INGEST-RESET failed (non-critical):", error);
        // Non-critical: conversation continues even if reset fails
    }
}

// ============================================================================
// PART 5: BRIDGE TEMPLATE SEARCH GENERATION
// ============================================================================

/**
 * Generates search queries using the "Bridge Template"
 * Ensures that vague follow-ups are bridged to the anchor subject
 * 
 * Bridge strategy:
 * - Term 1: High-level medical synonyms of current prompt
 * - Term 2: [Anchor] + [Current Intent]
 * - Term 3: [Anchor] + [Current Intent] + [Pathophysiology terms]
 * 
 * @param userPrompt - Original user query
 * @param anchorSubject - Locked subject (e.g., "Parkinson's")
 * @param intent - Detected intent (e.g., "side_effects")
 * @returns Array of bridged search queries
 */
async function generateBridgedQueries(
    userPrompt: string,
    anchorSubject: string | null,
    intent: string
): Promise<BridgedQuery[]> {
    try {
        // Build the bridging prompt for LLM
        const bridgingPrompt = `You are a medical research query optimizer specializing in generating search terms.

USER QUERY: "${userPrompt}"
${anchorSubject ? `ANCHOR SUBJECT (locked): "${anchorSubject}"` : "ANCHOR SUBJECT: None (new topic)"}
DETECTED INTENT: "${intent}"

${anchorSubject ? `
BRIDGE STRATEGY (because user has locked subject "${anchorSubject}"):
- Term 1: Standalone medical synonym search (ignoring anchor)
- Term 2: Bridge term combining [${anchorSubject}] + [${intent}]
- Term 3: Deep bridge with pathophysiology: [${anchorSubject}] + [${intent}] + specific mechanisms
- Term 4: Clinical variation: Different treatments/mechanisms related to the anchor + intent
- Term 5: Latest research bridge: Recent trials/studies on [${anchorSubject}] for [${intent}]
` : `
SEARCH STRATEGY (new topic, no anchor):
- Term 1: Direct synonym search for the query
- Term 2: Clinical/scientific variation
- Term 3: Mechanism/pathophysiology angle
- Term 4: Evidence-based/trial angle
- Term 5: Latest research perspective
`}

RETURN FORMAT: ONLY valid JSON (no markdown):
{
    "queries": [
        {
            "term": "search term here",
            "bridge": "explanation of how it bridges",
            "weight": "high|medium|low"
        }
    ]
}`;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: bridgingPrompt }],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0]?.message?.content || "{}";
        const cleanJson = responseContent.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanJson);

        const bridgedQueries: BridgedQuery[] = parsed.queries || [];

        console.log(`🌉 Bridged Queries Generated:`);
        bridgedQueries.forEach((q, i) => {
            console.log(`   Query ${i + 1}: "${q.term}"`);
            console.log(`      Bridge: ${q.bridge}`);
            console.log(`      Weight: ${q.weight}`);
        });

        return bridgedQueries;

    } catch (error: any) {
        console.warn("⚠️ Bridge generation failed:", error.message);
        return [{
            term: userPrompt,
            bridge: "Fallback (bridge generation failed)",
            weight: "medium"
        }];
    }
}

// ============================================================================
// PART 6: CONTEXT ANALYSIS - Full Conversation Awareness
// ============================================================================

/**
 * Performs comprehensive conversation analysis including:
 * - Anchor subject extraction from chat history
 * - Pivot detection (subject change vs follow-up)
 * - Intent detection (what is user asking about)
 * - Subject locking state (persistent memory)
 * 
 * DATA FLOW:
 * 1. Fetch last state from MongoDB (ConversationState)
 * 2. Extract current anchor from history (extractAnchorSubject)
 * 3. Detect if pivot happened (detectPivot)
 * 4. Determine subject lock state
 * 5. Return full context with metadata
 * 
 * @param userId - User ID
 * @param currentPrompt - User's current query
 * @param history - Recent chat messages
 * @returns Enhanced context object with all metadata
 */
async function analyzeEnhancedContext(
    userId: string,
    currentPrompt: string,
    history: ChatMessage[]
): Promise<EnhancedConversationContext> {
    console.log(`\n🔍 ENHANCED CONTEXT ANALYSIS for user ${userId}`);

    // Step 1: Get last conversation state from MongoDB
    // This is the "persistent memory" - what subject were we discussing?
    const lastMetadata = await getLastConversationMetadata(userId);

    // Step 2: Extract current anchor subject from chat history
    // This analyzes the most recent messages to detect the current subject
    const { subject: currentAnchor, confidence: currentConfidence } = extractAnchorSubject(history);

    // Step 3: Detect pivot
    // Did the user change topics? Is this a follow-up or new subject?
    const { isPivot, reason: pivotReason } = detectPivot(
        currentPrompt,
        lastMetadata?.anchorSubject || null,
        currentAnchor
    );

    console.log(`\n🔄 PIVOT DETECTION:`);
    console.log(`   Result: ${isPivot ? "PIVOT" : "FOLLOW-UP"}`);
    console.log(`   Reason: ${pivotReason}`);

    // Step 4: Detect intent
    // What is the user asking about? (treatment, side effects, diagnosis, etc.)
    const { intent, keywords, confidence: intentConfidence } = detectIntent(currentPrompt);

    console.log(`\n🎯 INTENT DETECTION:`);
    console.log(`   Intent: ${intent}`);
    console.log(`   Keywords: [${keywords.join(", ")}]`);
    console.log(`   Confidence: ${(intentConfidence * 100).toFixed(0)}%`);

    // Step 5: Determine subject lock state
    // This is the critical logic that maintains context across messages
    let lockedSubject = currentAnchor;
    let lockConfidence = currentConfidence;

    if (isPivot && currentAnchor) {
        // New pivot detected - lock new subject
        lockedSubject = currentAnchor;
        console.log(`\n🔒 SUBJECT LOCK (PIVOT):`);
        console.log(`   Action: Lock new subject "${currentAnchor}"`);
    } else if (!isPivot && lastMetadata?.anchorSubject && !currentAnchor) {
        // Follow-up without new anchor - maintain last lock
        // This is the "persistence" magic: user said "what about side effects?" 
        // and we remember they were talking about Parkinson's
        lockedSubject = lastMetadata.anchorSubject;
        lockConfidence = lastMetadata.anchorConfidence;
        console.log(`\n🔒 SUBJECT LOCK (MAINTAINED):`);
        console.log(`   Action: Maintain previous lock "${lockedSubject}"`);
    } else if (currentAnchor && !isPivot) {
        // Continue with current anchor
        lockedSubject = currentAnchor;
        console.log(`\n🔒 SUBJECT LOCK (CONTINUED):`);
        console.log(`   Action: Continue with "${lockedSubject}"`);
    }

    console.log(`   Subject: ${lockedSubject || "None"}`);
    console.log(`   Confidence: ${(lockConfidence * 100).toFixed(0)}%`);

    // Build metadata object
    const metadata: ConversationMetadata = {
        anchorSubject: lockedSubject || null,
        anchorConfidence: lockConfidence,
        lastSubject: lastMetadata?.anchorSubject || null,
        isPivot,
        pivotReason,
        analysisTimestamp: new Date(),
        conversationTurn: (lastMetadata?.conversationTurn || 0) + 1
    };

    // Build subject lock state
    const subjectLock: SubjectLockState = {
        locked: !!lockedSubject,
        subject: lockedSubject || "",
        confidence: lockConfidence,
        lastUpdated: new Date(),
        messagesSinceUpdate: 0
    };

    return {
        messages: history,
        metadata,
        subjectLock,
        originalQuery: currentPrompt,
        detectedIntent: intent
    };
}

// ============================================================================
// PART 7: DYNAMIC SYSTEM PROMPT
// ============================================================================

const getSystemPrompt = (role?: string | null) => {
    const baseInstructions =
        " You must search the provided context thoroughly for specific data, tables, and figures. " +
        "When asked for statistical significance, look for P-values, Confidence Intervals (CI), and 'Table' references. " +
        "Always report the specific Page number where the information was found using the [Source: Name, Page: Num] format. " +
        "If the information is in a table, extract the exact values. Do not be lazy; if the context mentions a page, that is where the answer is.";

    switch (role) {
        case "Medical Student":
            return "You are a medical educator." + baseInstructions +
                " Explain concepts using analogies and define all medical terminology for a learner.";
        case "Clinical Researcher":
            return "You are an expert clinical research consultant." + baseInstructions +
                " Prioritize trial methodology, statistical power, p-values, and evidence-based findings.";
        case "Practicing Physician":
            return "You are a clinical peer." + baseInstructions +
                " Be concise and technical. Focus on diagnostic criteria, treatment protocols, and drug interactions.";
        default:
            return "You are a helpful medical research assistant." + baseInstructions;
    }
};

// ============================================================================
// PART 8: ROUTES - ENHANCED ORCHESTRATION
// ============================================================================

/**
 * @route    POST /api/chat/ingest
 * @desc     FIX #1: Proxy PDF files to Python Brain + Perform Ingest-Reset Handshake
 * 
 * THE FIX:
 * 1. Send to Python Brain (unchanged)
 * 2. Save document to MongoDB (unchanged)
 * 3. **NEW**: Call performIngestReset() to wipe old subject lock
 * 
 * This prevents the "Parkinson's Obsession" by resetting the ConversationState
 * every time a new document is uploaded.
 */
router.post('/ingest', middleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const userId = req.user?.id;
        const originalFilename = req.file.originalname;

        console.log(`[Ingest] Processing file for userId: ${userId}, filename: ${originalFilename}`);

        // Step 1: Send to Python Brain
        const pythonFormData = new FormData();
        pythonFormData.append('file', req.file.buffer, {
            filename: originalFilename,
            contentType: req.file.mimetype,
        });

        let pythonResponse;
        try {
            pythonResponse = await axios.post(`${PYTHON_BRAIN_URL}/ingest`, pythonFormData, {
                headers: { ...pythonFormData.getHeaders() },
                timeout: 60000
            });
            console.log(`[Ingest] Python Brain response:`, pythonResponse.data);
        } catch (pythonError: any) {
            const errorMsg = pythonError.response?.data?.detail || pythonError.message;
            console.error(`[Ingest] Python Brain failed:`, errorMsg);
            return res.status(500).json({
                error: "Failed to process PDF in Medical Brain",
                details: errorMsg
            });
        }

        // Step 2: Save metadata to MongoDB (only if Python Brain succeeded)
        let savedDoc;
        try {
            savedDoc = await prisma.document.create({
                data: {
                    name: originalFilename,
                    url: `chroma://vector-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    userId: userId as string,
                    description: `Auto-ingested from ${originalFilename}`
                }
            });
            console.log(`[Ingest] Document saved to MongoDB with ID: ${savedDoc.id}`);
        } catch (dbError: any) {
            console.error(`[Ingest] MongoDB save failed:`, dbError.message);
            return res.status(500).json({
                error: "Document metadata could not be saved to database",
                details: dbError.message
            });
        }

        // ========== FIX #1: INGEST-RESET HANDSHAKE ==========
        // CRITICAL: When a new document arrives, wipe the subject lock
        // This prevents old medical subjects from contaminating the new conversation
        await performIngestReset(userId as string, originalFilename);
        // ===================================================

        return res.status(200).json({
            message: "Medical document ingested and persisted successfully",
            success: true,
            docId: savedDoc.id,
            fileName: originalFilename,
            conversationReset: true,  // Signal to frontend: old context is gone
            ...pythonResponse.data
        });
    } catch (error: any) {
        console.error("[Ingest] Unexpected error:", error.message);
        return res.status(500).json({ error: "Failed to index medical document" });
    }
});

/**
 * @route    POST /api/chat
 * @desc     Enhanced chat endpoint with Subject Locking & Intent Routing
 * 
 * FIXES IMPLEMENTED:
 * - FIX #2: Recency-First anchor detection (already in extractAnchorSubject)
 * - FIX #3: Smart Pivot with semantic gap (in detectPivot)
 * - FIX #4: Source persistence (see lines with "SOURCES" comment)
 * 
 * COMPLETE DATA FLOW:
 * 1. ✅ Fetch recent chat history (from Chat collection)
 * 2. ✅ Analyze enhanced context (detect anchor, pivot, intent)
 * 3. ✅ Generate bridged queries (bridge template strategy)
 * 4. ✅ Save metadata to MongoDB (ConversationState upsert)
 * 5. ✅ Call Python Brain with context hints (subject lock + intent)
 * 6. ✅ Save response to Chat collection WITH SOURCES (FIX #4)
 * 7. ✅ Return response with full context metadata
 */
router.post('/', middleware, async (req: AuthRequest, res: Response) => {
    try {
        const { prompt, sessionId } = req.body;
        const currentSessionId = sessionId || "legacy-session";
        const userId = req.user?.id;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        // ========================================
        // STEP 1: Fetch user role and history
        // ========================================
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });

        const userRole = user?.role || "Medical Assistant";
        const systemInstructions = getSystemPrompt(userRole);

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📝 NEW QUERY PROCESSING - User: ${userId}`);
        console.log(`${'='.repeat(80)}`);

        // Fetch chat history (last 6 exchanges = 12 messages) for the current session
        // This provides the context for anchor extraction
        const chatHistory = await prisma.chat.findMany({
            where: { userId: userId as string, sessionId: currentSessionId },
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: {
                role: true,
                content: true,
                createdAt: true,
                // FIX #4: Make sure we're selecting sources from history
                sources: true
            }
        });

        const history: ChatMessage[] = chatHistory.reverse().map(msg => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            createdAt: msg.createdAt
        }));

        console.log(`📜 Retrieved ${history.length} messages from history`);

        // ========================================
        // STEP 2: Enhanced Context Analysis
        // Hydrate with persistent memory from MongoDB
        // ========================================
        const enhancedContext = await analyzeEnhancedContext(userId as string, prompt, history);

        // ========================================
        // STEP 3: Generate Bridged Queries
        // Use anchor subject + intent to generate better search terms
        // ========================================
        console.log(`\n🌉 GENERATING BRIDGED QUERIES...`);
        const bridgedQueries = await generateBridgedQueries(
            prompt,
            enhancedContext.subjectLock.subject || null,
            enhancedContext.detectedIntent
        );

        // ── MEMORY FLUSH HANDSHAKE ────────────────────────────────────────────────
        // If a pivot is detected, override the expanded_queries with clean anchor-only
        // terms (discard old MS-flavored bridge queries) and signal conversation_context: null
        // so Python treats this turn as a completely fresh conversation.
        const isPivot = enhancedContext.metadata.isPivot;
        const newAnchor = enhancedContext.subjectLock.subject;

        const finalExpandedQueries = isPivot && newAnchor
            ? [
                newAnchor,
                `${newAnchor} treatment`,
                `${newAnchor} management`,
                `${newAnchor} clinical research`,
                prompt
            ]
            : bridgedQueries.map(q => q.term);

        if (isPivot) {
            console.log(`\n🔄 PIVOT MEMORY FLUSH: Overriding queries to anchor-only for "${newAnchor}"`);
            console.log(`   Old MS-flavored bridge queries discarded.`);
            console.log(`   Sending conversation_context: null to Python Brain.`);
        }

        // ========================================
        // STEP 4: Save Metadata to MongoDB
        // This creates the "persistent memory"
        // ========================================
        console.log(`\n💾 SAVING CONVERSATION STATE`);
        await saveConversationMetadata(userId as string, enhancedContext.metadata);

        // ========================================
        // STEP 5: Build Enhanced Python Brain Payload
        // Hydrate with context awareness
        // ========================================
        const brainPayload = {
            prompt: prompt,
            expanded_queries: finalExpandedQueries,
            system_prompt: systemInstructions,
            user_role: userRole,
            // MEMORY FLUSH: on pivot → null wipes Python's short-term memory;
            // on continuation → omit (Python will handle as follow-up)
            conversation_context: isPivot ? null : undefined,
            context_awareness: {
                anchor_subject: enhancedContext.subjectLock.subject || null,
                anchor_confidence: enhancedContext.subjectLock.confidence,
                is_locked: enhancedContext.subjectLock.locked,
                is_pivot: isPivot,
                last_subject: enhancedContext.metadata.lastSubject,
                detected_intent: enhancedContext.detectedIntent,
                bridged_queries_with_weights: bridgedQueries.map(q => ({
                    query: q.term,
                    bridge_type: q.bridge,
                    weight: q.weight
                }))
            },
            conversation_metadata: {
                turn: enhancedContext.metadata.conversationTurn,
                history_length: isPivot ? 0 : history.length,  // report 0 on flush
                timestamp: enhancedContext.metadata.analysisTimestamp
            }
        };

        console.log(`\n📤 SENDING TO PYTHON BRAIN`);
        console.log(`   Anchor Subject: ${enhancedContext.subjectLock.subject || "None"}`);
        console.log(`   Is Pivot: ${enhancedContext.metadata.isPivot}`);
        console.log(`   Queries Count: ${finalExpandedQueries.length}`);

        // ========================================
        // STEP 6: Call Python Brain
        // ========================================
        const response = await axios.post(`${PYTHON_BRAIN_URL}/query`, brainPayload, {
            timeout: 45000
        });

        const aiAnswer = response.data.answer || "No response received.";
        const sources = response.data.sources || [];  // FIX #4: Extract sources
        const retrievalStats = response.data.retrieval_stats || null;

        // ========================================
        // STEP 7: Save to Chat History WITH SOURCES
        // FIX #4: Critical - ensure sources are saved to MongoDB
        // ========================================
        try {
            await prisma.chat.createMany({
                data: [
                    {
                        role: "user",
                        content: prompt,
                        userId: userId as string,
                        sessionId: currentSessionId,
                        sources: []  // User messages have no sources
                    },
                    {
                        role: "assistant",
                        content: aiAnswer,
                        userId: userId as string,
                        sessionId: currentSessionId,
                        // FIX #4: CRITICAL - Pass sources as JSON array to Prisma
                        // If your schema stores sources as JSON, this should work directly.
                        // If it's a string, stringify it: JSON.stringify(sources)
                        sources: sources
                    }
                ]
            });

            console.log(`✅ Chat messages saved to history`);
            console.log(`   User message: stored`);
            console.log(`   Assistant message: stored with ${sources.length} sources`);
        } catch (dbError) {
            console.warn("⚠ History Save Warning:", dbError);
            // Continue even if history save fails (non-critical)
        }

        // ========================================
        // STEP 8: Return Enhanced Response
        // ========================================
        console.log(`\n✅ RESPONSE COMPLETE`);
        console.log(`${'='.repeat(80)}\n`);

        return res.status(200).json({
            answer: aiAnswer,
            persona: userRole,
            sources: sources,  // FIX #4: Return sources in response
            expansion_summary: {
                original_query: prompt,
                terms_used: finalExpandedQueries,
                bridged_queries: bridgedQueries.map(q => ({
                    term: q.term,
                    bridge: q.bridge,
                    weight: q.weight
                }))
            },
            context_analysis: {
                subject_locking: {
                    locked_subject: enhancedContext.subjectLock.subject || null,
                    confidence: enhancedContext.subjectLock.confidence,
                    is_locked: enhancedContext.subjectLock.locked
                },
                pivot_detection: {
                    is_pivot: enhancedContext.metadata.isPivot,
                    previous_subject: enhancedContext.metadata.lastSubject,
                    reason: enhancedContext.metadata.pivotReason
                },
                intent_detection: {
                    intent: enhancedContext.detectedIntent,
                    confidence: enhancedContext.metadata.anchorConfidence
                },
                conversation_turn: enhancedContext.metadata.conversationTurn
            },
            retrieval_stats: retrievalStats
        });

    } catch (error: any) {
        console.error("❌ Brain Communication Error:", error.response?.data || error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ error: "Medical Brain connection failed." });
    }
});

/**
 * @route    GET /api/chat/history
 * @desc     Retrieve user's complete chat history WITH SOURCES and custom session titles
 */
router.get('/history', middleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        // Fetch messages and custom session titles in parallel
        const [history, sessionTitles] = await Promise.all([
            prisma.chat.findMany({
                where: { userId: userId },
                orderBy: { createdAt: 'asc' },
                take: 100,
                select: {
                    id: true,
                    role: true,
                    content: true,
                    createdAt: true,
                    sources: true,
                    sessionId: true
                }
            }),
            prisma.chatSession.findMany({
                where: { userId: userId as string },
                select: { sessionId: true, title: true }
            })
        ]);

        // Build a lookup map: sessionId -> custom title
        const titleMap: Record<string, string> = {};
        sessionTitles.forEach(s => { titleMap[s.sessionId] = s.title; });

        const processedHistory = history.map(msg => ({
            ...msg,
            sources: typeof msg.sources === 'string'
                ? JSON.parse(msg.sources || '[]')
                : msg.sources || [],
            // Attach custom title if one exists for this session
            customTitle: titleMap[msg.sessionId] || null
        }));

        return res.status(200).json(processedHistory);
    } catch (error) {
        console.error("❌ History retrieval error:", error);
        return res.status(500).json({ error: "Could not load history." });
    }
});

/**
 * @route    DELETE /api/chat/:sessionId
 * @desc     Delete all chat messages for a conversation session
 */
router.delete('/:sessionId', middleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { sessionId } = req.params;

        // Delete all chat messages for the session
        const deleted = await prisma.chat.deleteMany({
            where: { userId: userId as string, sessionId: sessionId as string }
        });

        // Also delete any stored custom title for this session
        await prisma.chatSession.deleteMany({
            where: { userId: userId as string, sessionId: sessionId as string }
        });

        console.log(`🗑️ Deleted ${deleted.count} messages for session ${sessionId}`);
        return res.status(200).json({ success: true, deletedCount: deleted.count });
    } catch (error) {
        console.error("❌ Delete session error:", error);
        return res.status(500).json({ error: "Could not delete conversation." });
    }
});

/**
 * @route    PUT /api/chat/:sessionId/title
 * @desc     Upsert a custom title for a conversation session
 */
router.put('/:sessionId/title', middleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { sessionId } = req.params;
        const { title } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: "Title is required" });
        }

        const session = await prisma.chatSession.upsert({
            where: { sessionId: sessionId as string },
            update: { title: title.trim() },
            create: {
                sessionId: sessionId as string,
                title: title.trim(),
                userId: userId as string
            }
        });

        console.log(`✏️ Renamed session ${sessionId} to "${session.title}"`);
        return res.status(200).json({ success: true, session });
    } catch (error) {
        console.error("❌ Rename session error:", error);
        return res.status(500).json({ error: "Could not rename conversation." });
    }
});

/**
 * @route    GET /api/chat/context
 * @desc     Get current conversation context with full analysis
 * This endpoint shows the current subject lock, pivot state, and intent
 */
router.get('/context', middleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const sessionId = (req.query.sessionId as string) || "legacy-session";

        // Fetch recent history
        const chatHistory = await prisma.chat.findMany({
            where: { userId: userId as string, sessionId: sessionId },
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: {
                role: true,
                content: true,
                createdAt: true,
                sources: true
            }
        });

        const history: ChatMessage[] = chatHistory.reverse().map(msg => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            createdAt: msg.createdAt
        }));

        // Analyze context (using empty prompt since we're just analyzing history)
        const context = await analyzeEnhancedContext(userId as string, "", history);

        return res.status(200).json({
            messages_count: history.length,
            subject_locking: {
                locked_subject: context.subjectLock.subject,
                confidence: context.subjectLock.confidence,
                is_locked: context.subjectLock.locked
            },
            pivot_history: {
                is_pivot: context.metadata.isPivot,
                last_subject: context.metadata.lastSubject,
                current_subject: context.metadata.anchorSubject
            },
            conversation_turn: context.metadata.conversationTurn,
            messages: history.map(msg => ({
                role: msg.role,
                content: msg.content.substring(0, 200) + (msg.content.length > 200 ? "..." : ""),
                createdAt: msg.createdAt
            }))
        });
    } catch (error: any) {
        return res.status(500).json({ error: "Could not analyze context." });
    }
});

/**
 * @route    GET /api/chat/subjects
 * @desc     Debug endpoint - list all known medical subjects in the database
 */
router.get('/subjects', middleware, async (req: AuthRequest, res: Response) => {
    try {
        const subjects: { [key: string]: string[] } = {};

        for (const [category, diseases] of Object.entries(MEDICAL_SUBJECTS)) {
            subjects[category] = Object.keys(diseases);
        }

        return res.status(200).json({
            total_categories: Object.keys(MEDICAL_SUBJECTS).length,
            total_diseases: Object.values(MEDICAL_SUBJECTS).reduce((sum, cat) => sum + Object.keys(cat).length, 0),
            subjects
        });
    } catch (error) {
        return res.status(500).json({ error: "Could not retrieve subjects." });
    }
});

export default router;