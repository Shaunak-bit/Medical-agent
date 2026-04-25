// src/middleware/auth.ts
import type { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

// Load environment variables specifically for this module
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

interface UserPayload {
    id: string;
    email: string;
    name: string;
}

export interface AuthRequest extends Request {
    user?: UserPayload;
}

const middleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies.token;

        // Logging cookies helps during development, but avoid logging full tokens in production
        if (process.env.NODE_ENV !== 'production') {
            console.log("Cookies received by server:", req.cookies);
        }

        if (!token) {
            return res.status(401).json({ message: "Unauthorized: No token provided" });
        }

        // --- CRITICAL CHANGE ---
        // Check if secret exists to avoid the "secret or public key must be provided" error
        if (!JWT_SECRET) {
            console.error("CRITICAL: JWT_SECRET is missing from .env file!");
            return res.status(500).json({ message: "Server configuration error" });
        }

        const verified = jwt.verify(token, JWT_SECRET) as UserPayload;

        // Attach the verified user to the request object
        req.user = verified;

        next();
    } catch (error: any) {
        console.error("JWT Verification Error:", error.message);

        // Handle specific expired token error for better frontend feedback
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Session expired. Please login again." });
        }

        return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};

export default middleware;