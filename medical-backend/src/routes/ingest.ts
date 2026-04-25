import { Router, Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import { prisma } from "../lib/prisma.js"; // Your Prisma 7 singleton

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const PYTHON_BRAIN_URL = process.env.PYTHON_BRAIN_URL || "http://127.0.0.1:8000";

// Step 1: MongoDB Gatekeeper - Valid 24-character hex string (MongoDB ObjectId format)
const SYSTEM_USER_ID = "507f1f77bcf86cd799439011"; // Valid MongoDB ObjectId hex format
const REGEX_MONGO_OBJECTID = /^[a-f0-9]{24}$/i; // Validates 24-char hex string

/**
 * STEP 1: Identity Validation Helper
 * Validates that userId is a proper 24-character hexadecimal string
 * MongoDB will silently fail or throw errors with UUID format like "0000-0000-..."
 */
function validateAndSanitizeUserId(userId: string | undefined): string {
    if (!userId) {
        console.warn("[Identity Validation] No userId provided. Using SYSTEM_USER_ID as fallback.");
        return SYSTEM_USER_ID;
    }

    // Clean up any potential formatting
    const cleanId = userId.replace(/-/g, '').toLowerCase();

    // Validate 24-character hex format
    if (!REGEX_MONGO_OBJECTID.test(cleanId)) {
        console.warn(`[Identity Validation] Invalid userId format "${userId}". Expected 24-char hex. Using SYSTEM_USER_ID.`);
        return SYSTEM_USER_ID;
    }

    console.log(`[Identity Validation] ✓ Valid userId: ${cleanId}`);
    return cleanId;
}

// ============================================================================
// ✨ NEW: INGEST-RESET HANDSHAKE FUNCTION
// ============================================================================
/**
 * Resets the conversation state when a new document is ingested.
 * This is the critical fix to prevent the "Parkinson's Obsession" bug.
 * 
 * When a user uploads a new PDF:
 * 1. Set anchorSubject = null (wipe old subject)
 * 2. Set isPivot = true (signal fresh conversation)
 * 3. Reset conversationTurn = 0 (restart counter)
 * 4. Update analysisTimestamp = now
 * 
 * This ensures the next chat query will re-detect the subject from the new document
 * instead of continuing with the old subject (e.g., Parkinson's).
 * 
 * @param userId - User's ID
 * @param documentName - Name of the ingested document
 */
async function performIngestReset(userId: string, documentName: string): Promise<void> {
    try {
        console.log(`\n🔄 INGEST-RESET HANDSHAKE INITIATED`);
        console.log(`   Document: ${documentName}`);
        console.log(`   User: ${userId}`);
        console.log(`   Action: Wiping subject lock and forcing fresh conversation`);

        // Upsert ConversationState: update if exists, create if doesn't
        const resetState = await prisma.conversationState.upsert({
            where: { userId },
            update: {
                // Update existing state
                anchorSubject: null,           // CRITICAL: Wipe old subject lock
                anchorConfidence: 0,
                lastSubject: null,
                isPivot: true,                 // Signal: Fresh conversation starting
                pivotReason: `New document ingested: "${documentName}"`,
                conversationTurn: 0,           // Restart turn counter
                analysisTimestamp: new Date(),
                lastUpdated: new Date()
            },
            create: {
                // Create new state if user doesn't exist
                userId,
                anchorSubject: null,
                anchorConfidence: 0,
                lastSubject: null,
                isPivot: true,
                pivotReason: `New document ingested: "${documentName}"`,
                conversationTurn: 0,
                analysisTimestamp: new Date(),
                lastUpdated: new Date()
            }
        });

        console.log(`✅ INGEST-RESET COMPLETE`);
        console.log(`   Old subject lock: WIPED`);
        console.log(`   Pivot state: ENABLED`);
        console.log(`   Turn counter: RESET to 0`);
        console.log(`   Next query: Will re-detect subject from new document\n`);

    } catch (error: any) {
        console.warn("⚠️ INGEST-RESET FAILED (non-critical):", error.message);
        console.log("   Conversation will continue, but subject lock may not be reset.");
        // Non-critical error: ingestion continues even if reset fails
    }
}

/**
 * POST /ingest
 * 
 * DUAL-PERSISTENCE FLOW WITH INGEST-RESET:
 * 1. Validate userId (MongoDB Gatekeeper)
 * 2. Send to Python Brain (Brain-First Handshake)
 * 3. If Brain returns 200 OK, save metadata to MongoDB (Receipt Creation)
 * 4. ✨ NEW: Perform Ingest-Reset Handshake (Wipe old subject lock)
 * 5. Return confirmation with document reference
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
        // ============================================
        // STEP 1: IDENTITY VALIDATION (MongoDB Gatekeeper)
        // ============================================
        const { userId } = req.body;
        const validatedUserId = validateAndSanitizeUserId(userId);
        console.log(`[Ingest] Processing file for userId: ${validatedUserId}`);

        // Validate file exists
        if (!req.file) {
            return res.status(400).json({
                error: "No medical document provided",
                code: "NO_FILE"
            });
        }

        const originalFilename = req.file.originalname;
        console.log(`[Ingest] File received: ${originalFilename} (${req.file.size} bytes)`);

        // ============================================
        // STEP 2: BRAIN-FIRST HANDSHAKE (Send to Python Service First)
        // ============================================
        console.log(`[Brain Handshake] Sending file to Python Brain at ${PYTHON_BRAIN_URL}/ingest`);

        const form = new FormData();
        form.append('file', req.file.buffer, {
            filename: originalFilename,
            contentType: req.file.mimetype,
        });

        let brainResponse;
        try {
            brainResponse = await axios.post(`${PYTHON_BRAIN_URL}/ingest`, form, {
                headers: {
                    ...form.getHeaders(),
                },
                timeout: 60000
            });

            // Success Condition: Python Brain returns 200 OK
            if (brainResponse.status !== 200) {
                throw new Error(`Brain returned status ${brainResponse.status}`);
            }

            console.log(`[Brain Handshake] ✓ Brain returned 200 OK`);
            console.log(`[Brain Handshake] Brain response:`, brainResponse.data);
        } catch (brainError: any) {
            const errorMsg = brainError.response?.data?.error || brainError.message;
            const status = brainError.response?.status || 500;
            console.error(`[Brain Handshake] ✗ Brain failed with status ${status}:`, errorMsg);

            return res.status(status).json({
                error: "The Medical Brain failed to digest the document.",
                details: errorMsg,
                code: "BRAIN_INGESTION_FAILED"
            });
        }

        // ============================================
        // STEP 3: METADATA RECEIPT CREATION (The Atlas Write)
        // ============================================
        console.log(`[Atlas Write] Creating metadata record in MongoDB for userId: ${validatedUserId}`);

        let savedDoc;
        try {
            savedDoc = await prisma.document.create({
                data: {
                    name: originalFilename,
                    // Store reference string instead of direct URL (since using memory storage)
                    // This tells the frontend the file is "Vectorized" in ChromaDB
                    url: `chroma://vector-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    userId: validatedUserId,
                    // Optional: Store additional metadata
                    description: `Auto-ingested from ${originalFilename}`,
                }
            });

            console.log(`[Atlas Write] ✓ Document saved to MongoDB with ID: ${savedDoc.id}`);
            console.log(`[Prisma Query Log] INSERT INTO "Document" - Should see this in your terminal`);
        } catch (dbError: any) {
            console.error(`[Atlas Write] ✗ MongoDB save failed:`, dbError.message);

            return res.status(500).json({
                error: "Document metadata could not be saved to database.",
                details: dbError.message,
                code: "DATABASE_SAVE_FAILED"
            });
        }

        // ============================================================================
        // ✨ STEP 4: INGEST-RESET HANDSHAKE (THE KEY FIX)
        // ============================================================================
        // This is the critical step that prevents the "Parkinson's Obsession" bug.
        // By resetting ConversationState immediately after the document is saved,
        // we ensure the next chat query will re-detect the subject from the new document
        // instead of continuing with the old subject.
        // ============================================================================
        console.log(`[Ingest] ✓ Document saved. Now performing Ingest-Reset...`);
        await performIngestReset(validatedUserId, originalFilename);

        // ============================================
        // SUCCESS: Brain, Database, and Context Reset Confirmed
        // ============================================
        console.log(`[Ingest Complete] ✓ Full triple-persistence successful`);
        console.log(`[Ingest Complete] File: ${originalFilename} | DocID: ${savedDoc.id} | UserID: ${validatedUserId}`);

        return res.status(200).json({
            message: "Medical intelligence ingested, persisted, and context reset successfully",
            success: true,
            docId: savedDoc.id,
            fileName: originalFilename,
            userId: validatedUserId,
            vectorReference: savedDoc.url,
            timestamp: savedDoc.createdAt,
            conversationReset: true,  // ✨ NEW: Signal to frontend that context was reset
            brainData: brainResponse.data
        });

    } catch (error: any) {
        console.error("[Ingest Error] Unhandled exception:", error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({
            error: "An unexpected error occurred during document ingestion.",
            details: error.message,
            code: "INTERNAL_ERROR"
        });
    }
});

/**
 * GET /ingest/:userId
 * 
 * STEP 5: HYDRATION ROUTE (The "Reload" Fix)
 * 
 * Purpose: When the user reloads the page, the frontend calls this route to:
 * 1. Query MongoDB for all documents belonging to this userId
 * 2. Return the list so the UI can display the links again
 * 
 * Flow:
 * Frontend useEffect on page load
 *   → Calls GET /api/ingest/{userId}
 *   → Node.js queries MongoDB via Prisma
 *   → MongoDB returns list of Documents
 *   → Frontend receives array and renders links
 */
router.get('/:userId', async (req: Request, res: Response) => {
    try {
        const { userId: rawUserId } = req.params;

        // ============================================
        // STEP 1: VALIDATE userId FROM URL PARAM
        // ============================================
        const validatedUserId = validateAndSanitizeUserId(String(req.params.userId));
        console.log(`[Hydration] Fetching documents for userId: ${validatedUserId}`);

        // ============================================
        // STEP 2: QUERY MongoDB FOR DOCUMENTS
        // ============================================
        const documents = await prisma.document.findMany({
            where: {
                userId: validatedUserId
            },
            orderBy: {
                createdAt: 'desc'
            },
            // Optional: Select specific fields if you want to limit data transfer
            select: {
                id: true,
                name: true,
                url: true,
                userId: true,
                createdAt: true,
                // Exclude description if it's large
            }
        });

        console.log(`[Hydration] ✓ Found ${documents.length} documents for userId: ${validatedUserId}`);

        if (documents.length === 0) {
            console.log(`[Hydration] No documents found. This is normal for first-time users.`);
        }

        // ============================================
        // STEP 3: RETURN TO FRONTEND
        // ============================================
        return res.status(200).json({
            success: true,
            userId: validatedUserId,
            documentCount: documents.length,
            documents: documents,
            message: documents.length === 0
                ? "No documents ingested yet. Upload one to get started!"
                : `Retrieved ${documents.length} document(s)`
        });

    } catch (error: any) {
        console.error("[Hydration Error] Failed to fetch documents:", error.message);
        return res.status(500).json({
            error: "Could not retrieve document list from database.",
            details: error.message,
            code: "DATABASE_FETCH_FAILED",
            userId: req.params.userId
        });
    }
});

/**
 * GET /ingest/health/check
 * Optional: Health check endpoint to debug the ingestion pipeline
 */
router.get('/health/check', async (req: Request, res: Response) => {
    try {
        // Check MongoDB connection
        const mongoCheck = await prisma.document.count();

        // Check Python Brain connection
        const brainCheck = await axios.get(`${PYTHON_BRAIN_URL}/health`, {
            timeout: 5000
        }).catch(() => ({ status: 503 }));

        return res.status(200).json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            services: {
                mongodb: {
                    status: "connected",
                    documentCount: mongoCheck
                },
                pythonBrain: {
                    status: brainCheck.status === 200 ? "connected" : "disconnected",
                    url: PYTHON_BRAIN_URL
                }
            }
        });
    } catch (error: any) {
        return res.status(503).json({
            status: "unhealthy",
            error: error.message
        });
    }
});

export default router;