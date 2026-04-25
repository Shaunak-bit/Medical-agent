"use client";

import { useEffect, useRef } from "react";
import { Zap, Triangle, Brain } from "lucide-react";

const techs = [
    {
        icon: <Zap size={20} className="text-orange-500" />,
        label: "Groq",
        bg: "bg-orange-50",
        border: "border-orange-100",
        desc: "Inference at speed",
    },
    {
        icon: <Triangle size={20} className="text-slate-800" />,
        label: "Next.js",
        bg: "bg-slate-50",
        border: "border-slate-200",
        desc: "React framework",
    },
    {
        icon: <Brain size={20} className="text-pink-500" />,
        label: "Custom LLM",
        bg: "bg-pink-50",
        border: "border-pink-100",
        desc: "Domain-tuned model",
    },
];

export default function PoweredBy() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.querySelectorAll(".reveal").forEach((el, i) => {
                            setTimeout(() => el.classList.add("visible"), i * 100);
                        });
                    }
                });
            },
            { threshold: 0.2 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <section ref={ref} className="py-20 bg-white border-y border-slate-100">
            <div className="max-w-4xl mx-auto px-6 text-center">
                <p className="reveal text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase mb-8">
                    Powered by
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    {techs.map(({ icon, label, bg, border, desc }) => (
                        <div
                            key={label}
                            className={`reveal tech-badge flex items-center gap-3 px-6 py-4 rounded-2xl border ${bg} ${border} shadow-sm cursor-default min-w-[170px]`}
                        >
                            <div
                                className={`w-9 h-9 rounded-xl ${bg} border ${border} flex items-center justify-center shadow-xs`}
                            >
                                {icon}
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-semibold text-slate-800">{label}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}