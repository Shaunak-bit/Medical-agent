"use client";
import React, { useRef, useEffect, useState } from 'react';
import { Plus, MoreVertical, Trash2, Edit2, Check, Menu, X, Settings, LogOut, User } from 'lucide-react';
import { Conversation } from '../types';
import { logoutUser } from '../lib/api'; // Ensure this is imported
import { useRouter } from 'next/navigation';

interface SidebarProps {
    user: { name: string; email: string } | null;
    conversations: Conversation[];
    currentConversationId: string;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    setCurrentConversationId: (id: string) => void;
    onNewChat: () => void;
    onDeleteConversation: (id: string) => void;
    onRenameConversation: (id: string, newTitle: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    user,
    conversations,
    currentConversationId,
    sidebarOpen,
    setSidebarOpen,
    setCurrentConversationId,
    onNewChat,
    onDeleteConversation,
    onRenameConversation,
}) => {
    const router = useRouter();
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    // --- LOGOUT LOGIC ---
    const handleLogout = async () => {
        try {
            const res = await logoutUser();
            if (res.success) {
                // Clear state and redirect to sign-in
                setProfileMenuOpen(false);
                router.push('/signin');
            } else {
                console.error("Logout failed:", res.message);
            }
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus rename input when entering rename mode
    useEffect(() => {
        if (renamingId) {
            setTimeout(() => renameInputRef.current?.focus(), 0);
        }
    }, [renamingId]);

    const handleStartRename = (conv: Conversation) => {
        setRenamingId(conv.id);
        setRenameValue(conv.title);
        setOpenMenuId(null);
    };

    const handleSaveRename = (id: string) => {
        if (renameValue.trim()) {
            onRenameConversation(id, renameValue.trim());
        }
        setRenamingId(null);
        setRenameValue('');
    };

    const handleCancelRename = () => {
        setRenamingId(null);
        setRenameValue('');
    };

    return (
        <>
            {/* Left Sidebar */}
            <div
                className={`fixed md:relative top-0 left-0 h-screen bg-white border-r border-slate-200/60 flex flex-col transition-all duration-300 z-20 overflow-hidden ${sidebarOpen ? 'w-64' : '-translate-x-full md:w-0'
                    }`}
            >
                {/* New Chat Button */}
                <div className="p-4 border-b border-slate-200/60">
                    <button
                        onClick={onNewChat}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg px-4 py-2.5 font-medium hover:from-blue-700 hover:to-blue-800 transition-all duration-200 hover:shadow-lg hover:shadow-blue-600/30 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        New Chat
                    </button>
                </div>

                {/* Conversation History */}
                <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-2">
                    {conversations.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">
                            No conversations yet
                        </p>
                    ) : (
                        conversations.map((conv, index) => (
                            <div
                                key={conv.id}
                                className="group animate-slideInLeft"
                                style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                {renamingId === conv.id ? (
                                    <div className="flex items-center gap-2 px-2 py-2">
                                        <input
                                            ref={renameInputRef}
                                            type="text"
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveRename(conv.id);
                                                if (e.key === 'Escape') handleCancelRename();
                                            }}
                                            className="flex-1 px-2 py-1.5 text-sm bg-white border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                        />
                                        <button
                                            onClick={() => handleSaveRename(conv.id)}
                                            className="p-1.5 hover:bg-green-100 text-green-600 rounded transition-colors"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className={`relative ${openMenuId === conv.id ? 'z-50' : 'z-10'}`}>
                                        <button
                                            onClick={() => {
                                                setCurrentConversationId(conv.id);
                                                if (window.innerWidth < 768) setSidebarOpen(false);
                                            }}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex-1 ${currentConversationId === conv.id
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-slate-600 hover:bg-slate-50'
                                                }`}
                                        >
                                            <p className="text-sm font-medium truncate">{conv.title}</p>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {new Date(conv.createdAt).toLocaleDateString()}
                                            </p>
                                        </button>

                                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(openMenuId === conv.id ? null : conv.id);
                                                }}
                                                className="p-1 hover:bg-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                            >
                                                <MoreVertical className="w-4 h-4 text-slate-400" />
                                            </button>

                                            {openMenuId === conv.id && (
                                                <div
                                                    ref={menuRef}
                                                    className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-30"
                                                >
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleStartRename(conv); }}
                                                        className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-colors border-b border-slate-100"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                        <span className="text-xs font-medium">Rename</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                                                        className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        <span className="text-xs font-medium">Delete</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Profile Section */}
                <div className="border-t border-slate-200/60 p-3 relative">
                    <div ref={profileMenuRef} className="relative">
                        <button
                            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 rounded-lg transition-colors duration-200"
                        >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm">
                                {user?.name ? user.name.charAt(0).toUpperCase() : 'R'}
                            </div>

                            <div className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-semibold text-slate-800 truncate">
                                    {user?.name || 'Shaunak Satyan...'}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                    {user?.email || 'shaunakkundu4@gmail.com'}
                                </p>
                            </div>

                            <Settings className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        </button>

                        {/* Profile Dropdown Menu */}
                        {profileMenuOpen && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-1.5 animate-fadeInUp">
                                <button
                                    onClick={() => setProfileMenuOpen(false)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-3 rounded-lg transition-colors"
                                >
                                    <User className="w-4 h-4" />
                                    <span className="text-sm font-medium">My Profile</span>
                                </button>
                                <button
                                    onClick={() => setProfileMenuOpen(false)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-3 rounded-lg transition-colors"
                                >
                                    <Settings className="w-4 h-4" />
                                    <span className="text-sm font-medium">Settings</span>
                                </button>
                                <div className="h-px bg-slate-100 my-1 mx-2" />
                                <button
                                    onClick={handleLogout}
                                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-3 rounded-lg transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span className="text-sm font-medium">Sign Out</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <p className="text-[10px] text-slate-300 text-center mt-3 pt-3 border-t border-slate-50">
                        Research Assistant v1.0
                    </p>
                </div>
            </div>

            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/20 md:hidden z-10 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}
        </>
    );
};