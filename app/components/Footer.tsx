import { Microscope } from "lucide-react";

const links = {
    Product: ["Features", "Documentation", "Changelog", "Roadmap"],
    Research: ["PubMed Integration", "API Access", "Case Studies", "Benchmarks"],
    Company: ["About", "Blog", "Careers", "Contact"],
};

export default function Footer() {
    return (
        <footer className="bg-slate-950 text-slate-400">
            <div className="max-w-6xl mx-auto px-6 pt-16 pb-10">
                {/* Top row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                    {/* Brand */}
                    <div className="md:col-span-1">
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
                                <Microscope size={16} className="text-white" />
                            </div>
                            <span
                                className="text-white font-bold text-base"
                                style={{ fontFamily: "'Sora', sans-serif" }}
                            >
                                Cura Link
                            </span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-500">
                            Accelerating clinical insights with agentic AI for the modern
                            medical researcher.
                        </p>
                        <p className="mt-4 text-xs text-slate-600 border border-slate-800 rounded-lg px-3 py-2 inline-block">
                            ⚕️ For research purposes only. Not for clinical diagnostics.
                        </p>
                    </div>

                    {/* Link Groups */}
                    {Object.entries(links).map(([group, items]) => (
                        <div key={group}>
                            <h4
                                className="text-white text-sm font-semibold mb-4"
                                style={{ fontFamily: "'Sora', sans-serif" }}
                            >
                                {group}
                            </h4>
                            <ul className="flex flex-col gap-3">
                                {items.map((item) => (
                                    <li key={item}>
                                        <a
                                            href="#"
                                            className="text-sm text-slate-500 hover:text-slate-200 transition-colors duration-200"
                                        >
                                            {item}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom bar */}
                <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-slate-600">
                        © {new Date().getFullYear()} Cura Link. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6">
                        {["Privacy Policy", "Terms of Service", "HIPAA Notice"].map((item) => (
                            <a
                                key={item}
                                href="#"
                                className="text-xs text-slate-600 hover:text-slate-300 transition-colors duration-200"
                            >
                                {item}
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </footer>
    );
}