"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Shield, Clock, Users } from "lucide-react";
import Link from "next/link";

const trust = [
    { icon: Shield, label: "HIPAA-aligned" },
    { icon: Clock, label: "24/7 availability" },
    { icon: Users, label: "Trusted by 10K+ researchers" },
];

export default function CTA() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.querySelectorAll(".reveal").forEach((el, i) => {
                            setTimeout(() => el.classList.add("visible"), i * 120);
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
        <section ref={ref} className="py-28 bg-white px-6">
            <div className="max-w-5xl mx-auto">
                <div className="reveal bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2rem] px-8 sm:px-16 py-16 text-center relative overflow-hidden shadow-2xl shadow-blue-200">
                    {/* Inner glow */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-[2rem]"
                        style={{
                            background:
                                "radial-gradient(ellipse at 50% -20%, rgba(255,255,255,0.15) 0%, transparent 60%)",
                        }}
                    />
                    {/* Dots pattern */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-[0.06] rounded-[2rem]"
                        style={{
                            backgroundImage:
                                "radial-gradient(circle, #fff 1px, transparent 1px)",
                            backgroundSize: "28px 28px",
                        }}
                    />

                    <div className="relative z-10">
                        <h2
                            className="reveal text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight"
                            style={{ fontFamily: "'Sora', sans-serif", letterSpacing: "-0.025em" }}
                        >
                            Ready to Transform
                            <br />
                            Your Research?
                        </h2>

                        <p className="reveal mt-5 text-blue-100 text-lg max-w-xl mx-auto leading-relaxed">
                            Join researchers and clinicians accelerating their medical insights with AI — today.
                        </p>

                        {/* Trust badges */}
                        <div className="reveal flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mt-8">
                            {trust.map(({ icon: Icon, label }) => (
                                <div key={label} className="flex items-center gap-2 text-blue-100 text-sm">
                                    <Icon size={15} className="text-blue-200" />
                                    {label}
                                </div>
                            ))}
                        </div>

                        <div className="reveal mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href="/signup"
                                className="btn-primary inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-white text-blue-700 font-bold text-base shadow-lg"
                            >
                                Get Started Now
                                <ArrowRight size={17} />
                            </Link>
                            <Link
                                href="/documentation"
                                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl border border-white/30 text-white font-semibold text-base hover:bg-white/10 transition-colors duration-200"
                            >
                                View Documentation
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}