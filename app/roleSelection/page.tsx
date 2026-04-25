"use client";
import React, { useState } from 'react';
import { Microscope, Activity, Stethoscope, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const CuraRoleSelector = () => {
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const roles = [
        {
            id: 'Medical Student',
            title: 'Medical Student',
            description: 'Learning and exploring medical research',
            icon: Activity,
            iconColor: 'text-sky-500',
        },
        {
            id: 'Clinical Researcher',
            title: 'Clinical Researcher',
            description: 'Conducting active research studies',
            icon: Microscope,
            iconColor: 'text-indigo-600',
        },
        {
            id: 'Practicing Physician',
            title: 'Practicing Physician',
            description: 'Clinical practice and patient care',
            icon: Stethoscope,
            iconColor: 'text-amber-500',
        },
    ];

    const handleContinue = async () => {
        if (!selectedRole) return;

        setIsLoading(true);
        try {
            // Updated to use the deployment-ready BASE_URL logic
            const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

            const response = await fetch(`${BASE_URL}/auth/profile`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ role: selectedRole })
            });

            if (response.ok) {
                // Redirect to your conversation page
                router.push('/chat');
            } else {
                console.error("Failed to save role");
                alert("Could not save your professional role. Please try again.");
            }
        } catch (error) {
            console.error("Role selection error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f8faff] p-4 font-sans relative overflow-hidden">
            {/* Subtle background texture/gradients */}
            <div className="absolute top-0 right-0 w-[50vw] h-[50vh] bg-blue-100 rounded-full blur-3xl opacity-30 pointer-events-none -translate-y-1/3 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-[50vw] h-[50vh] bg-sky-100 rounded-full blur-3xl opacity-30 pointer-events-none translate-y-1/3 -translate-x-1/3"></div>

            {/* Logo and Greeting */}
            <div className="flex flex-col items-center mb-10 text-center animate-fadeInDown">
                <div className="flex items-center gap-2 mb-3">
                    <Microscope className="w-9 h-9 text-[#1d61ff]" strokeWidth={2.5} />
                    <h1 className="text-3xl font-bold text-[#1d61ff] tracking-tight leading-none">Cura Link</h1>
                </div>
                <p className="text-gray-900 text-xl font-medium mb-1">Tell us about your role</p>
                <p className="text-gray-500 text-md max-w-sm">
                    This helps us customize your research experience
                </p>
            </div>

            {/* Role Selection Options */}
            <div className="w-full max-w-[500px] flex flex-col gap-5 animate-fadeInUp delay-100">
                {roles.map((role, index) => {
                    const IconComponent = role.icon;
                    const isSelected = selectedRole === role.id;

                    return (
                        <button
                            key={role.id}
                            disabled={isLoading}
                            onClick={() => setSelectedRole(role.id)}
                            className={`group flex items-center gap-5 p-6 rounded-3xl border-2 transition-all duration-300 ease-out 
                text-left w-full
                ${isSelected
                                    ? 'bg-white border-[#1d61ff] shadow-lg ring-4 ring-[#1d61ff]/10'
                                    : 'bg-white/80 border-white hover:border-[#1d61ff]/30 hover:shadow-md hover:bg-white'
                                }
              `}
                            style={{ animationDelay: `${200 + index * 100}ms` }}
                        >
                            <div className={`flex items-center justify-center p-3 rounded-xl ${isSelected ? 'bg-[#1d61ff]/5' : 'bg-gray-100 group-hover:bg-gray-200'} transition-colors`}>
                                <IconComponent className={`w-8 h-8 ${role.iconColor}`} strokeWidth={1.5} />
                            </div>
                            <div className="flex-grow">
                                <p className={`text-lg font-semibold ${isSelected ? 'text-[#1d61ff]' : 'text-gray-900'} leading-tight`}>
                                    {role.title}
                                </p>
                                <p className="text-gray-500 text-sm mt-0.5">
                                    {role.description}
                                </p>
                            </div>

                            {isSelected ? (
                                <div className="w-6 h-6 rounded-full bg-[#1d61ff] flex items-center justify-center animate-scaleIn">
                                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M10.6667 1L3.83333 8.33333L1 5.33333" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            ) : (
                                <ArrowRight className="w-6 h-6 text-gray-300 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Primary Action Button */}
            {selectedRole && (
                <div className="w-full max-w-[500px] mt-10 animate-scaleIn">
                    <button
                        type="button"
                        onClick={handleContinue}
                        disabled={isLoading}
                        className="w-full bg-[#1d61ff] hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-colors group shadow-lg shadow-[#1d61ff]/20"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span>Continue as {roles.find(r => r.id === selectedRole)?.title}</span>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                            </>
                        )}
                    </button>
                </div>
            )}

            <footer className="mt-auto pt-16 pb-8 w-full flex justify-center animate-fadeInUp delay-500">
                <p className="text-gray-400 text-xs text-center max-w-lg px-4">
                    For research purposes only. Not for clinical diagnostic use.
                </p>
            </footer>
        </div>
    );
};

export default CuraRoleSelector;