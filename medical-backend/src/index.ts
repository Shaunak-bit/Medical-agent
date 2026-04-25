import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import chatRouter from './routes/chat.js';
import ingestRouter from './routes/ingest.js';
import authRouter from './routes/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware setup ---
app.use(helmet());
app.use(morgan('dev'));
app.use(cookieParser());

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// --- Routes ---
// This mounts everything in chatRouter under /api/chat
app.use('/api/chat', chatRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/auth', authRouter);

// Health Check
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: "Orchestrator is healthy" });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Global Error Handler:", err.stack);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
});

app.listen(PORT, () => {
    console.log(`🚀 Orchestrator live at http://localhost:${PORT}`);
});