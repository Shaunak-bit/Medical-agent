const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

// --- Helper Functions ---

const handleResponse = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || data.error || `Request failed: ${res.status}`);
    }
    return data;
};

/**
 * Custom fetch wrapper that handles 401 Unauthorized by attempting 
 * to refresh the token via HttpOnly cookies.
 */
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    let response = await fetch(url, options);

    if (response.status === 401) {
        // Attempt to refresh the token
        const refreshRes = await fetch(`${BASE_URL}/auth/refresh-token`, {
            method: "POST",
            credentials: "include"
        });

        if (refreshRes.ok) {
            // Retry the original request if refresh succeeded
            response = await fetch(url, options);
        }
    }
    return response;
};

// --- Authentication Exports ---

export const loginUsers = async (email: string, password: string) => {
    try {
        const res = await fetch(`${BASE_URL}/auth/signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password })
        });

        const data = await handleResponse(res);
        return { success: true, data };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

export const signupUsers = async (name: string, email: string, password: string) => {
    try {
        const res = await fetch(`${BASE_URL}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name, email, password })
        });

        const data = await handleResponse(res);
        return { success: true, data };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

export const getProfile = async () => {
    try {
        const res = await fetchWithAuth(`${BASE_URL}/auth/profile`, {
            method: "GET",
            credentials: "include"
        });

        const data = await handleResponse(res);
        return { success: true, data: data.data };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

export const logoutUser = async () => {
    try {
        const res = await fetch(`${BASE_URL}/auth/logout`, {
            method: "POST",
            credentials: "include"
        });

        const data = await handleResponse(res);
        return { success: true, message: data.message };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

// --- Unified Chat Service ---

export const ChatService = {
    /**
     * Sends a new message to the Medical Brain Orchestrator
     */
    async sendMessage(prompt: string, sessionId?: string) {
        try {
            const bodyPayload: any = { prompt };
            if (sessionId) {
                bodyPayload.sessionId = sessionId;
            }

            const response = await fetchWithAuth(`${BASE_URL}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(bodyPayload),
            });

            return await handleResponse(response);
        } catch (error: any) {
            console.error("ChatService.sendMessage error:", error);
            if (error.message?.includes("401")) {
                throw new Error("Session expired. Please login again.");
            }
            throw error;
        }
    },

    /**
     * Retrieves the chat history from Prisma
     */
    async getHistory() {
        try {
            const response = await fetchWithAuth(`${BASE_URL}/chat/history`, {
                method: "GET",
                credentials: "include",
            });

            return await handleResponse(response);
        } catch (error: any) {
            console.error("ChatService.getHistory error:", error);
            if (error.message?.includes("401")) {
                throw new Error("Session expired. Please login again.");
            }
            throw error;
        }
    },

    /**
     * Uploads a PDF for RAG ingestion
     */
    async uploadPDF(formData: FormData) {
        try {
            const response = await fetchWithAuth(`${BASE_URL}/chat/ingest`, {
                method: "POST",
                credentials: "include",
                // Note: We don't set Content-Type header here. 
                // The browser will set it to multipart/form-data with a boundary.
                body: formData,
            });

            return await handleResponse(response);
        } catch (error: any) {
            console.error("ChatService.uploadPDF error:", error);
            throw error;
        }
    },

    /**
     * Deletes all chat messages for a given session from the backend
     */
    async deleteConversation(sessionId: string) {
        try {
            const response = await fetchWithAuth(`${BASE_URL}/chat/${encodeURIComponent(sessionId)}`, {
                method: "DELETE",
                credentials: "include",
            });
            return await handleResponse(response);
        } catch (error: any) {
            console.error("ChatService.deleteConversation error:", error);
            throw error;
        }
    },

    /**
     * Renames a conversation session by persisting a custom title to the backend
     */
    async renameConversation(sessionId: string, title: string) {
        try {
            const response = await fetchWithAuth(`${BASE_URL}/chat/${encodeURIComponent(sessionId)}/title`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ title }),
            });
            return await handleResponse(response);
        } catch (error: any) {
            console.error("ChatService.renameConversation error:", error);
            throw error;
        }
    },
};