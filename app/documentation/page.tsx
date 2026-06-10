"use client";

import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  FileText,
  Sparkles,
  GitBranch,
  Shield,
  FileSearch,
  Globe,
  Users,
  Lock,
  History,
  MessageCircle,
  Upload,
  Search,
  FileX,
  Database,
  Key,
  EyeOff,
  BookOpen,
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const bullets = [
  {
    icon: <FileSearch size={16} className="text-blue-500 mt-0.5 shrink-0" />,
    text: "RAG from your own PDFs — upload any medical document and query it instantly alongside live research sources.",
  },
  {
    icon: <Globe size={16} className="text-blue-500 mt-0.5 shrink-0" />,
    text: "Live research retrieval — answers augmented with real-time data from PubMed, ClinicalTrials.gov, Semantic Scholar, CrossRef, and OpenAlex.",
  },
  {
    icon: <Users size={16} className="text-blue-500 mt-0.5 shrink-0" />,
    text: "Role-based chat — Patient, Doctor, and Admin roles each get scoped permissions and tailored response modes.",
  },
  {
    icon: <Lock size={16} className="text-blue-500 mt-0.5 shrink-0" />,
    text: "Context locking — pin a subject mid-conversation so follow-up questions stay focused without repeating yourself.",
  },
  {
    icon: <History size={16} className="text-blue-500 mt-0.5 shrink-0" />,
    text: "Conversation history — every session is saved and searchable, with full traceability back to source documents.",
  },
];

const workflows = [
  {
    icon: <MessageCircle size={15} className="text-blue-600 shrink-0" />,
    title: "Chat with AI",
    steps: ["Open chat", "Type your question", "AI retrieves context", "Answer with citations"],
  },
  {
    icon: <Upload size={15} className="text-blue-600 shrink-0" />,
    title: "Upload & ingest PDF",
    steps: ["Click Upload PDF", "Select file", "Brain chunks & embeds", "Stored in ChromaDB", "Queryable instantly"],
  },
  {
    icon: <Search size={15} className="text-blue-600 shrink-0" />,
    title: "Search & cite live research",
    steps: ["Ask a clinical question", "Brain queries PubMed + others", "Results ranked & merged", "Answer with source links"],
  },
];

const secCards = [
  {
    icon: <FileX size={22} className="text-blue-600" />,
    title: "File handling",
    desc: "Uploaded PDFs are processed in memory, chunked, and discarded. Only vector embeddings persist in ChromaDB — raw files are never stored long-term.",
  },
  {
    icon: <Database size={22} className="text-blue-600" />,
    title: "Storage",
    desc: "Vector data lives in a local ChromaDB instance. Conversation history and user records are stored in a Prisma-managed database with no third-party data sharing.",
  },
  {
    icon: <Key size={22} className="text-blue-600" />,
    title: "Authentication",
    desc: "JWT-based auth with role scoping. Each token is short-lived and tied to a single role — Patient, Doctor, or Admin — with no privilege escalation.",
  },
  {
    icon: <EyeOff size={22} className="text-blue-600" />,
    title: "Data isolation",
    desc: "Conversations and documents are scoped per user. No cross-user data leakage is possible at the query or retrieval layer.",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
        <span className="text-blue-600">{icon}</span>
      </div>
      <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
    </div>
  );
}

function StepPill({ label }: { label: string }) {
  return (
    <span className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 whitespace-nowrap">
      {label}
    </span>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function DocumentationPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">

      {/* ── Top Nav Bar ── */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors duration-200 group"
          >
            <ChevronLeft
              size={17}
              className="group-hover:-translate-x-0.5 transition-transform duration-200"
            />
            Back
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-sm font-semibold text-slate-700">Documentation</span>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <div className="inline-flex items-center gap-2 text-blue-200 text-xs font-semibold uppercase tracking-widest mb-4">
            <BookOpen size={13} />
            Documentation
          </div>
          <h1
            className="text-4xl font-extrabold leading-tight mb-3"
            style={{ letterSpacing: "-0.025em" }}
          >
            CuraLink — Documentation
          </h1>
          <p className="text-blue-100 text-base max-w-xl leading-relaxed">
            Everything you need to understand, integrate, and build with the CuraLink platform.
          </p>

          {/* Quick stat pills */}
          <div className="flex flex-wrap gap-3 mt-8">
            {["50K+ Research Papers", "3 sec Avg. Summarization", "98% Entity Accuracy"].map((s) => (
              <span
                key={s}
                className="text-xs font-semibold text-blue-100 bg-white/10 border border-white/20 rounded-full px-4 py-1.5"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-6 py-14 space-y-14">

        {/* Overview */}
        <section>
          <SectionHeading icon={<FileText size={17} />} title="Overview" />
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-7">
            <p className="text-sm text-slate-600 leading-relaxed">
              CuraLink is a full-stack AI-powered medical assistant designed for{" "}
              <span className="font-semibold text-slate-800">researchers, clinicians, and medical students</span>.
              It lets users chat with an intelligent agent backed by their own uploaded PDFs and live
              biomedical databases. The platform combines a{" "}
              <span className="font-medium text-slate-700">Next.js frontend</span>, a{" "}
              <span className="font-medium text-slate-700">Node/Prisma backend</span>, and a{" "}
              <span className="font-medium text-slate-700">Python AI Brain</span> running a
              retrieval-augmented generation (RAG) pipeline — so every answer is grounded in real
              evidence, not just model memory.
            </p>
          </div>
        </section>

        {/* How It Helps */}
        <section>
          <SectionHeading icon={<Sparkles size={17} />} title="How it helps" />
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-3 px-7 py-4">
                {b.icon}
                <p className="text-sm text-slate-600 leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Main Workflows */}
        <section>
          <SectionHeading icon={<GitBranch size={17} />} title="Main workflows" />
          <div className="flex flex-col gap-4">
            {workflows.map((w, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm px-7 py-5"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
                  {w.icon}
                  {w.title}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {w.steps.map((step, j) => (
                    <span key={j} className="flex items-center gap-2">
                      <StepPill label={step} />
                      {j < w.steps.length - 1 && (
                        <span className="text-slate-300 text-xs font-medium">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Security & Privacy */}
        <section>
          <SectionHeading icon={<Shield size={17} />} title="Security & privacy" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {secCards.map((card, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm px-7 py-6"
              >
                <div className="mb-3">{card.icon}</div>
                <p className="text-sm font-bold text-slate-800 mb-1.5">{card.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer note */}
        <p className="text-center text-sm text-slate-400 pb-4">
          Need help?{" "}
          <a href="#" className="text-blue-600 font-semibold hover:underline">
            Open a GitHub issue →
          </a>
        </p>
      </div>
    </div>
  );
}