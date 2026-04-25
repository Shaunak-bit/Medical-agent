"use client";
import React, { useState } from 'react';
import { Microscope, ArrowRight, Loader2 } from 'lucide-react';
import { loginUsers } from '../lib/api';
import { useRouter } from 'next/navigation';

const SignIn = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const result = await loginUsers(email, password);

        if (result.success) {
            router.push('/roleSelection');
        } else {
            setError(result.message || "Invalid email or password");
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f8faff] p-4 font-sans">
            {/* Logo Section */}
            <div className="flex flex-col items-center mb-8">
                <div className="flex items-center gap-2 mb-2">
                    <Microscope className="w-8 h-8 text-[#1d61ff]" strokeWidth={2.5} />
                    <h1 className="text-3xl font-bold text-[#1d61ff] tracking-tight text-center leading-none">Cura Link</h1>
                </div>
                <p className="text-gray-500 text-lg">Welcome back to your research</p>
            </div>

            {/* Card Container */}
            <div className="w-full max-w-[480px] bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-10">

                {/* Error Message Display */}
                {error && (
                    <div className="mb-6 p-4 text-sm text-red-600 bg-red-50 rounded-xl border border-red-100 text-center">
                        {error}
                    </div>
                )}

                <form className="space-y-6" onSubmit={handleLogin}>
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-800 ml-1">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-300"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-800 ml-1">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-300"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#1d61ff] hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors group mt-4"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span>Sign In</span>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-10 text-center">
                    <p className="text-gray-500">
                        Don't have an account?{' '}
                        <a href="/signup" className="text-[#1d61ff] font-semibold hover:underline">Sign up</a>
                    </p>
                </div>
            </div>

            <footer className="mt-8">
                <p className="text-gray-400 text-sm text-center">
                    For research purposes only. Not for clinical diagnostic use.
                </p>
            </footer>
        </div>
    );
};

export default SignIn;