"use client";
import React, { useRef, useEffect } from 'react';
import { Message, Source } from '../types';
import { FileText, ExternalLink, BookOpen } from 'lucide-react';

interface ConversationMessagesProps {
    messages: Message[];
    isLoading: boolean;
    isEmpty: boolean;
}

export const ConversationMessages: React.FC<ConversationMessagesProps> = ({
    messages,
    isLoading,
    isEmpty,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const formatTime = (timestamp: any) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '--:--';
        }
    };

    const isLocalLink = (link: string) => {
        return !link || link.startsWith('local://');
    };

    if (isEmpty) {
        return (
            <div className="h-full flex flex-col items-center justify-center px-6 py-12">
                <div className="w-24 h-24 mx-auto mb-6 bg-blue-50 rounded-full flex items-center justify-center">
                    <span className="text-4xl animate-pulse">🔬</span>
                </div>
                <h2 className="text-3xl font-light text-slate-900 mb-3 text-center">Cura Link Medical Intelligence</h2>
                {/* Existing grid... */}
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
            {messages.map((message, index) => (
                <div
                    key={message.id || index}
                    className={`animate-fadeInUp flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                    <div className={`max-w-xl group flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {/* Message Bubble */}
                        <div
                            className={`transition-all duration-300 ${message.role === 'user'
                                ? 'bg-[#1d61ff] text-white rounded-2xl rounded-tr-sm shadow-md px-5 py-3'
                                : 'bg-white border border-slate-200 text-slate-900 rounded-2xl rounded-tl-sm shadow-sm px-5 py-3'
                                }`}
                        >
                            <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                                {message.content}
                            </p>

                            <div className="flex items-center gap-2 mt-2">
                                {message.role === 'assistant' && (
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                                        Medical AI
                                    </span>
                                )}
                                <p className={`text-[10px] ${message.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                                    {formatTime(message.createdAt || message.timestamp)}
                                </p>
                            </div>
                        </div>

                        {/* SOURCE SUMMARY & BADGES */}
                        {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                            <div className="mt-3 flex flex-col gap-2 w-full animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                                <div className="flex items-center gap-1.5 px-1">
                                    <BookOpen className="w-3 h-3 text-slate-400" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        Source Evidence ({message.sources.length})
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {message.sources.map((source: Source, sIdx: number) => (
                                        <a
                                            key={sIdx}
                                            href={isLocalLink(source.link) ? undefined : source.link}
                                            target={isLocalLink(source.link) ? undefined : "_blank"}
                                            rel="noopener noreferrer"
                                            onClick={isLocalLink(source.link) ? (e) => e.preventDefault() : undefined}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg transition-all group/badge ${
                                                isLocalLink(source.link)
                                                    ? 'cursor-default'
                                                    : 'hover:bg-white hover:border-blue-300 cursor-pointer'
                                            }`}
                                        >
                                            <FileText className="w-3 h-3 text-slate-400 group-hover/badge:text-blue-500" />
                                            <span className="text-[11px] font-medium text-slate-600 group-hover/badge:text-blue-700 truncate max-w-[150px]">
                                                {source.file}
                                            </span>
                                            <span className="text-[10px] bg-slate-200 group-hover/badge:bg-blue-100 text-slate-500 group-hover/badge:text-blue-600 px-1 rounded font-bold">
                                                {source.page && source.page !== 'Not specified'
                                                    ? `p.${source.page}`
                                                    : source.data_type || source.file}
                                            </span>
                                            {/* Only show external link icon for non-local sources */}
                                            {!isLocalLink(source.link) && (
                                                <ExternalLink className="w-2.5 h-2.5 text-slate-300 group-hover/badge:text-blue-400" />
                                            )}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {isLoading && (
                <div className="flex justify-start animate-fadeInUp">
                    <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm shadow-sm px-5 py-4 flex items-center gap-3">
                        <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                        </div>
                        <span className="text-xs font-medium text-slate-400 tracking-wide uppercase">Processing medical data...</span>
                    </div>
                </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
        </div>
    );
};