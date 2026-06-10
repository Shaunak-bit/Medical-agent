"use client";

import { useEffect, useRef } from "react";
import { Database, BookOpenCheck, FlaskConical, ChevronRight } from "lucide-react";

const features = [
    {
        icon: Database,
        color: "text-blue-600",
        bg: "bg-blue-50",
        ring: "ring-blue-100",
        title: "Semantic Search",
        description:
            "Search medical literature using advanced semantic understanding to find relevant research papers instantly — not just keyword matches.",
        tag: "Search",
        bullets: ["NLP-powered retrieval", "PubMed + custom corpora", "Sub-second results"],
    },
    {
        icon: BookOpenCheck,
        color: "text-indigo-600",
        bg: "bg-indigo-50",
        ring: "ring-indigo-100",
        title: "Paper Summarization",
        description:
            "Automatically summarize complex research papers into concise, actionable clinical insights — saving hours of reading time.",
        tag: "Summarize",
        bullets: ["Structured abstracts", "Key finding extraction", "Citation-ready output"],
    },
    {
        icon: FlaskConical,
        color: "text-violet-600",
        bg: "bg-violet-50",
        ring: "ring-violet-100",
        title: "Entity Extraction",
        description:
            "Intelligently identify and extract medical entities like drugs, diseases, biomarkers, and clinical outcomes from any document.",
        tag: "Extract",
        bullets: ["Drug & disease NER", "Relation mapping", "UMLS-aligned terms"],
    },
];

export default function Features() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.querySelectorAll(".reveal").forEach((el, i) => {
                            setTimeout(() => el.classList.add("visible"), i * 130);
                        });
                    }
                });
            },
            { threshold: 0.1 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <section ref={ref} id="features" className="py-28 bg-[#f8faff]">
            <div className="max-w-6xl mx-auto px-6">
                {/* Header */}
                <div className="text-center mb-16">
                    <p className="reveal text-xs font-semibold tracking-[0.18em] text-blue-500 uppercase mb-3">
                        Capabilities
                    </p>
                    <h2
                        className="reveal text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight"
                        style={{ fontFamily: "'Sora', sans-serif", letterSpacing: "-0.025em" }}
                    >
                        Key Features
                    </h2>
                    <p className="reveal mt-4 text-slate-500 text-lg max-w-xl mx-auto">
                        Everything you need for advanced medical research — in one intelligent platform.
                    </p>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {features.map(({ icon: Icon, color, bg, ring, title, description, tag, bullets }) => (
                        <div
                            key={title}
                            className={`reveal feature-card bg-white rounded-3xl border border-slate-100 p-8 flex flex-col gap-6 shadow-sm ring-4 ring-transparent hover:ring-2 ${ring} cursor-pointer group`}
                        >
                            {/* Icon + Tag */}
                            <div className="flex items-start justify-between">
                                <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center shadow-sm`}>
                                    <Icon size={22} className={color} />
                                </div>
                                <span
                                    className={`text-xs font-semibold px-3 py-1 rounded-full ${bg} ${color}`}
                                >
                                    {tag}
                                </span>
                            </div>

                            {/* Text */}
                            <div>
                                <h3
                                    className="text-xl font-bold text-slate-900 mb-2"
                                    style={{ fontFamily: "'Sora', sans-serif" }}
                                >
                                    {title}
                                </h3>
                                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
                            </div>

                            {/* Bullets */}
                            <ul className="flex flex-col gap-2 mt-auto">
                                {bullets.map((b) => (
                                    <li key={b} className="flex items-center gap-2 text-sm text-slate-600">
                                        <div className={`w-1.5 h-1.5 rounded-full ${bg} border ${color} border-current`} />
                                        {b}
                                    </li>
                                ))}
                            </ul>

                            
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}