"use client";

import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import Link from "next/link";

export default function Hero() {
    return (
        <section className="relative min-h-screen mesh-bg flex flex-col items-center justify-center text-center px-6 pt-24 pb-20 overflow-hidden">
            {/* Decorative blobs */}
            <div
                aria-hidden
                className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-30"
                style={{
                    background:
                        "radial-gradient(ellipse at center, rgba(59,130,246,0.25) 0%, transparent 70%)",
                    filter: "blur(48px)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-20"
                style={{
                    background: "rgba(99,102,241,0.3)",
                    filter: "blur(80px)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute top-32 right-0 w-56 h-56 rounded-full opacity-20"
                style={{
                    background: "rgba(29,78,216,0.3)",
                    filter: "blur(64px)",
                }}
            />

            {/* Floating grid dots */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.035]"
                style={{
                    backgroundImage:
                        "radial-gradient(circle, #1d4ed8 1px, transparent 1px)",
                    backgroundSize: "36px 36px",
                }}
            />

            {/* Badge */}
            <div className="animate-fade-up mb-6">
                <span className="badge-pill">
                    <Sparkles size={13} className="text-blue-600" />
                    AI-Powered Medical Research
                </span>
            </div>

            {/* Headline */}
            <h1
                className="animate-fade-up delay-100 text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight text-slate-900 max-w-4xl"
                style={{ fontFamily: "'Sora', sans-serif", letterSpacing: "-0.03em" }}
            >
                Accelerating{" "}
                <span className="gradient-text">Clinical Insights</span>
                <br className="hidden sm:block" /> with Agentic AI
            </h1>

            {/* Subheadline */}
            <p className="animate-fade-up delay-200 mt-7 text-lg sm:text-xl text-slate-500 max-w-2xl leading-relaxed font-light">
                Transform your medical research workflow with intelligent semantic
                search, automated summarization, and entity extraction powered by
                advanced LLMs — designed for{" "}
                <span className="text-slate-700 font-medium">
                    researchers, clinicians, and medical students.
                </span>
            </p>

            {/* CTAs */}
            <div className="animate-fade-up delay-300 mt-10 flex flex-col sm:flex-row items-center gap-4">
                <Link
                    href="/signin"
                    className="btn-primary inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-blue-700 text-white font-semibold text-base shadow-lg shadow-blue-200"
                >
                    Researcher Login
                    <ArrowRight size={17} />
                </Link>
                <a
                    href="/documentation"
                    className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl border border-blue-200 bg-white text-blue-700 font-semibold text-base hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 shadow-sm"
                >
                    <BookOpen size={16} />
                    View Documentation
                </a>
            </div>

            {/* Social proof strip */}
            <div className="animate-fade-up delay-500 mt-14 flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                {[
                    { number: "50K+", label: "Research Papers" },
                    { number: "3 sec", label: "Avg. Summarization" },
                    { number: "98%", label: "Entity Accuracy" },
                ].map(({ number, label }) => (
                    <div key={label} className="text-center">
                        <p
                            className="text-2xl font-bold text-blue-700"
                            style={{ fontFamily: "'Sora', sans-serif" }}
                        >
                            {number}
                        </p>
                        <p className="text-sm text-slate-400 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Scroll hint */}
            <div className="animate-float absolute bottom-8 left-1/2 -translate-x-1/2">
                <div className="w-6 h-10 rounded-full border-2 border-slate-300 flex items-start justify-center pt-1.5">
                    <div className="w-1 h-2.5 rounded-full bg-slate-400 animate-bounce" />
                </div>
            </div>
        </section>
    );
}