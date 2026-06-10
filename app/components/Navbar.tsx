"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Microscope, Menu, X } from "lucide-react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Research", href: "#research" },
  { label: "Documentation", href: "/documentation" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "navbar-blur shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 animate-slide-left group">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md group-hover:shadow-blue-300 transition-shadow duration-300">
            <Microscope className="w-4.5 h-4.5 text-white" size={18} />
          </div>
          <span
            style={{ fontFamily: "'Sora', sans-serif" }}
            className="text-[1.05rem] font-700 text-blue-700 tracking-tight font-bold"
          >
            Cura Link
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8 animate-fade-in delay-200">
          {navLinks.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-sm font-medium text-slate-600 hover:text-blue-700 transition-colors duration-200 relative group"
            >
              {label}
              <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-blue-600 transition-all duration-300 group-hover:w-full" />
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3 animate-slide-right">
          <Link
            href="/signin"
            className="text-sm font-medium text-slate-600 hover:text-blue-700 transition-colors px-4 py-2"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold shadow-md"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          mobileOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        } navbar-blur border-t border-slate-100`}
      >
        <div className="px-6 py-4 flex flex-col gap-4">
          {navLinks.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-sm font-medium text-slate-600 hover:text-blue-700 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/signup"
            className="btn-primary inline-flex justify-center items-center px-5 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold shadow-md mt-1"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}