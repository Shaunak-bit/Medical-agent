import React from 'react';
import { Trash2, PanelLeft, PanelLeftClose } from 'lucide-react';
import { Conversation } from '../types';

interface TopBarProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    currentConversation: Conversation | undefined;
    onDelete: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    sidebarOpen,
    setSidebarOpen,
    currentConversation,
    onDelete,
}) => {
    return (
        <div className="border-b border-slate-200/60 bg-white/40 backdrop-blur-sm sticky top-0 z-10">
            <style>{`
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slideInDown {
          animation: slideInDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>

            <div className="flex items-center justify-between px-4 md:px-6 py-4">
                {/* Left Section with Sidebar Toggle */}
                <div className="flex items-center gap-3 flex-1">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2.5 hover:bg-blue-100 text-slate-700 hover:text-blue-600 rounded-lg transition-all duration-200 flex-shrink-0 animate-slideInDown"
                        title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                    >
                        {sidebarOpen ? (
                            <PanelLeftClose className="w-5 h-5" />
                        ) : (
                            <PanelLeft className="w-5 h-5" />
                        )}
                    </button>

                    {/* Divider */}
                    <div className="w-px h-6 bg-slate-200 hidden md:block" />

                    {/* Title Section */}
                    <div className="min-w-0">
                        <h1 className="text-lg md:text-xl font-light tracking-tight text-slate-900 truncate">
                            Medical Research Assistant
                        </h1>
                        <p className="text-xs md:text-sm text-slate-500 truncate">
                            {currentConversation?.title}
                        </p>
                    </div>
                </div>

                {/* Right Section with Delete Button */}
                {currentConversation && currentConversation.messages.length > 0 && (
                    <button
                        onClick={onDelete}
                        className="p-2.5 ml-4 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-all duration-200 flex-shrink-0 hover:scale-110"
                        title="Delete conversation"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
    );
};