# Medical Assistant - AI-Powered Healthcare Chat Application

A full-stack medical assistant application featuring real-time chat, role-based access, and intelligent backend processing. Built with Next.js, Node.js/Prisma, and Python AI/ML capabilities.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Features](#features)
- [Development](#development)
- [API Documentation](#api-documentation)

---

## 🎯 Project Overview

Medical Assistant is a comprehensive healthcare chat application that allows users to:
- Sign up and authenticate with role-based access (Patient, Doctor, Admin)
- Engage in real-time conversations with an AI medical assistant
- Access personalized healthcare recommendations
- Manage medical data securely

The application consists of three main components:
1. **Frontend**: Next.js web application with chat interface
2. **Backend**: Node.js API with Prisma ORM for data management
3. **AI Brain**: Python-based AI engine with ChromaDB for knowledge retrieval

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
│         (Chat Interface, Authentication, Pages)            │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend API (Node.js/Prisma)                  │
│   (Auth, Chat Routes, Data Management, DB)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            AI Brain (Python/ChromaDB)                       │
│   (Query Processing, ML Models, Knowledge Base)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 Tech Stack

### Frontend
- **Framework**: Next.js 15+
- **Language**: TypeScript
- **Styling**: CSS/PostCSS
- **HTTP Client**: Built-in API routes

### Backend
- **Runtime**: Node.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: SQLite (development) / PostgreSQL (production)
- **Authentication**: JWT/Session-based

### AI/ML Backend
- **Language**: Python 3.10+
- **Vector DB**: ChromaDB
- **ML Libraries**: (to be specified based on requirements)
- **API Integration**: HTTP REST

---

## 📦 Prerequisites

- **Node.js**: v18+ (for frontend and backend)
- **Python**: 3.10+ (for AI brain)
- **npm** or **yarn**: v8+
- **Git**: for version control

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd medical-assistant
```

### 2. Install Frontend Dependencies

```bash
npm install
# or
yarn install
```

### 3. Install Backend Dependencies

```bash
cd medical-backend
npm install
cd ..
```

### 4. Set Up Python Virtual Environment

```bash
cd medical-brain
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
cd ..
```

---

## 🔧 Configuration

### Frontend Configuration

Create `.env.local` in the root directory:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001

# Authentication
NEXT_PUBLIC_AUTH_ENABLED=true
```

### Backend Configuration

Create `.env` in `medical-backend/`:

```env
# Database
DATABASE_URL="file:./dev.db"
# or for PostgreSQL:
# DATABASE_URL="postgresql://user:password@localhost:5432/medical_db"

# Server
PORT=3001
NODE_ENV=development

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h

# CORS
CORS_ORIGIN=http://localhost:3000
```

### Python Brain Configuration

Create `.env` in `medical-brain/`:

```env
# Python Environment
PYTHONUNBUFFERED=1

# API Configuration
API_PORT=5000
API_HOST=0.0.0.0

# ChromaDB
CHROMA_DB_PATH=./chroma_db

# Backend Connection
BACKEND_URL=http://localhost:3001
```

---

## ▶️ Running the Application

### Development Mode

**Terminal 1 - Frontend** (Port 3000):
```bash
npm run dev
```
Visit: `http://localhost:3000`

**Terminal 2 - Backend** (Port 3001):
```bash
cd medical-backend
npm run dev
```

**Terminal 3 - AI Brain** (Port 5000):
```bash
cd medical-brain
source venv/bin/activate  # or venv\Scripts\activate on Windows
python main.py
```

### Production Build

#### Frontend:
```bash
npm run build
npm start
```

#### Backend:
```bash
cd medical-backend
npm run build
npm start
```

#### Python Brain:
```bash
cd medical-brain
python main.py
```

---

## 📁 Project Structure

```
medical-assistant/
├── app/                          # Next.js frontend
│   ├── components/               # Reusable React components
│   │   ├── CTA.tsx
│   │   ├── Features.tsx
│   │   ├── Footer.tsx
│   │   ├── Hero.tsx
│   │   ├── Navbar.tsx
│   │   └── PoweredBy.tsx
│   ├── chat/                     # Chat page & components
│   │   ├── Conversationmessages.tsx
│   │   ├── Inputarea.tsx
│   │   ├── page.tsx
│   │   ├── sidebar.tsx
│   │   └── topbar.tsx
│   ├── roleSelection/            # Role selection page
│   ├── signin/                   # Sign in page
│   ├── signup/                   # Sign up page
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   ├── types.ts                  # TypeScript types
│   └── globals.css               # Global styles
│
├── medical-backend/              # Node.js backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts          # Authentication routes
│   │   │   ├── chat.ts          # Chat routes
│   │   │   └── ingest.ts        # Data ingestion routes
│   │   ├── middleware/
│   │   │   └── auth.ts          # Auth middleware
│   │   ├── lib/
│   │   │   └── prisma.ts        # Prisma client setup
│   │   └── index.ts             # Server entry point
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema
│   │   └── migrations/          # Database migrations
│   ├── package.json
│   └── tsconfig.json
│
├── medical-brain/                # Python AI/ML backend
│   ├── main.py                  # Entry point
│   ├── query.py                 # Query processing
│   ├── ingest.py                # Data ingestion
│   ├── requirements.txt         # Python dependencies
│   └── chroma_db/               # Vector database
│
├── .gitignore                   # Git ignore rules
├── package.json                 # Frontend dependencies
├── tsconfig.json                # TypeScript config
├── next.config.ts               # Next.js config
├── eslint.config.mjs            # ESLint config
├── postcss.config.mjs           # PostCSS config
└── README.md                    # This file
```

---

## ✨ Features

### Authentication & Authorization
- ✅ User registration and login
- ✅ Role-based access control (Patient, Doctor, Admin)
- ✅ JWT-based authentication
- ✅ Secure session management

### Chat Interface
- ✅ Real-time chat with AI assistant
- ✅ Message history and persistence
- ✅ Conversation management
- ✅ Responsive design

### Backend Services
- ✅ RESTful API endpoints
- ✅ Database management with Prisma
- ✅ User and role management
- ✅ Chat message storage and retrieval

### AI/ML Capabilities
- ✅ Intelligent query processing
- ✅ Knowledge base with ChromaDB
- ✅ Vector-based semantic search
- ✅ Extensible AI models

---

## 👨‍💻 Development

### Code Quality

Run ESLint:
```bash
npm run lint
```

### Database Migrations

Create a new migration:
```bash
cd medical-backend
npx prisma migrate dev --name <migration-name>
```

View database:
```bash
cd medical-backend
npx prisma studio
```

### Debugging

- **Frontend**: Use browser DevTools (F12)
- **Backend**: Use VS Code debugger or `console.log()`
- **Python**: Use `print()` statements or Python debugger

---

## 📡 API Documentation

### Authentication Endpoints

**POST** `/api/auth/signup`
- Register a new user
- Body: `{ email, password, role }`

**POST** `/api/auth/signin`
- User login
- Body: `{ email, password }`

**POST** `/api/auth/logout`
- User logout

### Chat Endpoints

**GET** `/api/chat/messages`
- Fetch chat history
- Query: `?conversationId=xxx`

**POST** `/api/chat/message`
- Send a new message
- Body: `{ content, conversationId }`

**GET** `/api/chat/conversations`
- Fetch user conversations

### Data Ingestion

**POST** `/api/ingest/documents`
- Ingest medical documents
- Body: FormData with file

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and commit: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Submit a pull request

---

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📧 Support

For support, please contact: support@medicalassistant.com

---

## 🔄 Troubleshooting

### Port Already in Use
If a port is already in use, you can specify a different port:
```bash
# Frontend
PORT=3001 npm run dev

# Backend
PORT=3002 npm run dev

# Python
API_PORT=5001 python main.py
```

### Database Connection Issues
```bash
cd medical-backend
rm -rf node_modules/.prisma
npx prisma generate
npx prisma migrate deploy
```

### Python Virtual Environment Issues
```bash
cd medical-brain
rm -rf venv
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

---

**Last Updated**: April 26, 2026
