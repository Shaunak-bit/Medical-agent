import express from "express";
import type { Response, Request, NextFunction } from "express";
import { prisma } from "../lib/prisma.js"; // Correct ESM import for your setup
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import middleware from "../middleware/auth.js";
import crypto from "crypto";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
    path: "/",
};

// --- SIGNUP ---
router.post("/signup", async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ message: "All fields required" });

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(400).json({ message: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: { email, name, password: hashedPassword }
        });

        const payload = { id: newUser.id, email: newUser.email, name: newUser.name };
        const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
        const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

        await prisma.user.update({
            where: { id: newUser.id },
            data: { refreshToken }
        });

        res.cookie("token", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

        return res.status(201).json({ message: "User created", user: payload });
    } catch (error: any) {
        console.error("DEBUG SIGNUP ERROR:", error); // <--- Add this line!
        return res.status(500).json({ message: "Internal server error", detail: error.message });
    }
});

// --- SIGNIN ---
router.post("/signin", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const payload = { id: user.id, email: user.email, name: user.name };
        const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
        const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken }
        });

        res.cookie("token", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

        return res.status(200).json({ message: "Logged in", user: payload });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
});

// --- REFRESH TOKEN ---
router.post("/refresh-token", async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.cookies;
        if (!refreshToken) return res.status(401).json({ message: "Unauthorized" });

        const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });

        if (!user || user.refreshToken !== refreshToken) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const newAccessToken = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: "15m" }
        );

        res.cookie("token", newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        return res.json({ message: "Token refreshed" });
    } catch (error) {
        return res.status(403).json({ message: "Invalid refresh token" });
    }
});

// --- LOGOUT ---
router.post("/logout", middleware, async (req: any, res: Response) => {
    try {
        const userId = req.user?.id;
        if (userId) {
            await prisma.user.update({
                where: { id: userId },
                data: { refreshToken: null }
            });
        }
        res.clearCookie("token", cookieOptions);
        res.clearCookie("refreshToken", cookieOptions);
        return res.status(200).json({ message: "Logged out" });
    } catch (error) {
        return res.status(500).json({ message: "Logout failed" });
    }
});

router.get("/profile", middleware, async (req: any, res: Response) => {
    try {
        const userId = req.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true, // Make sure role is selected!
                createdAt: true
            }
        });

        if (!user) return res.status(404).json({ message: "User not found" });
        return res.status(200).json({ data: user });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
});

// --- PATCH PROFILE (THE MISSING LINK) ---
// This is the route your Role Selector calls!
router.patch("/profile", middleware, async (req: any, res: Response) => {
    try {
        const userId = req.user.id;
        const { name, email, role } = req.body;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(name && { name }),
                ...(email && { email }),
                ...(role && { role }) // This saves the 'Medical Student' choice
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true
            }
        });

        return res.status(200).json({
            message: "Profile updated successfully",
            data: updatedUser
        });
    } catch (error: any) {
        console.error("PATCH PROFILE ERROR:", error);
        return res.status(500).json({
            message: "Internal server error",
            detail: error.message
        });
    }
});

export default router;