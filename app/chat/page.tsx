"use client";
import React, { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';
import { ConversationMessages } from './Conversationmessages';
import { InputArea } from './Inputarea';
import { Conversation, Message } from '../types';
import { ChatService, getProfile } from '../lib/api'; // Ensure getProfile is imported
import { useRouter } from 'next/navigation';

export default function ResearchConversation() {
    const router = useRouter();

    // --- State Management ---
    const [user, setUser] = useState<{ name: string; email: string } | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

    // --- 1. Load User & History on Mount ---
    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch Profile and History in parallel for speed
                const [profileRes, history] = await Promise.all([
                    getProfile(),
                    ChatService.getHistory()
                ]);

                if (profileRes.success) {
                    setUser(profileRes.data);
                }

                if (history && history.length > 0) {
                    const groups: { [key: string]: { msgs: Message[], customTitle?: string } } = {};
                    history.forEach((msg: any) => {
                        const sid = msg.sessionId || '1';
                        if (!groups[sid]) groups[sid] = { msgs: [], customTitle: msg.customTitle || undefined };
                        groups[sid].msgs.push({
                            id: msg.id,
                            role: msg.role,
                            content: msg.content,
                            timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                            sources: msg.sources,
                        });
                    });

                    const convs: Conversation[] = Object.keys(groups).map((sid) => {
                        const { msgs, customTitle } = groups[sid];
                        // Use custom title if set, otherwise derive from first user message
                        let title = customTitle || (sid === 'legacy-session' ? 'Legacy Chat' : 'New Research Chat');
                        if (!customTitle) {
                            const firstMsg = msgs.find(m => m.role === 'user');
                            if (firstMsg && firstMsg.content) {
                                title = firstMsg.content.substring(0, 30) + (firstMsg.content.length > 30 ? '...' : '');
                            }
                        }

                        return {
                            id: sid,
                            title: title,
                            messages: msgs,
                            createdAt: msgs[0]?.timestamp || new Date(),
                        };
                    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

                    setConversations(convs);
                    if (convs.length > 0) {
                        setCurrentConversationId(convs[0].id);
                    } else {
                        handleNewChat();
                    }
                } else {
                    handleNewChat();
                }
            } catch (err: any) {
                console.error("Failed to load initial data:", err);
                if (err.message?.includes("Session expired")) {
                    router.push('/signin');
                } else {
                    handleNewChat();
                }
            }
        };
        loadData();
    }, [router]);

    // --- 2. Conversation Logic Functions ---
    const handleNewChat = () => {
        const newId = Date.now().toString();
        const newConversation: Conversation = {
            id: newId,
            title: 'New Research Chat',
            messages: [],
            createdAt: new Date(),
        };
        setConversations((prev) => [newConversation, ...prev]);
        setCurrentConversationId(newId);
    };

    const handleDeleteConversation = async (id: string) => {
        // Optimistic update: remove from UI immediately
        const newConversations = conversations.filter((c) => c.id !== id);
        setConversations(newConversations);
        if (currentConversationId === id && newConversations.length > 0) {
            setCurrentConversationId(newConversations[0].id);
        }

        // Persist to backend (skip local-only new chats that have no messages yet)
        try {
            await ChatService.deleteConversation(id);
        } catch (err) {
            console.error('Failed to delete conversation on backend:', err);
            // Non-critical: UI is already updated
        }
    };

    const handleRenameConversation = async (id: string, newTitle: string) => {
        // Optimistic update
        setConversations((prev) =>
            prev.map((conv) =>
                conv.id === id ? { ...conv, title: newTitle } : conv
            )
        );

        // Persist to backend
        try {
            await ChatService.renameConversation(id, newTitle);
        } catch (err) {
            console.error('Failed to rename conversation on backend:', err);
            // Non-critical: UI is already updated
        }
    };

    const handleDeleteCurrentConversation = () => {
        handleDeleteConversation(currentConversationId);
    };

    // --- 3. Send Message Logic ---
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!inputValue.trim() && uploadedFiles.length === 0) || isLoading || !currentConversationId) return;

        const userPrompt = inputValue;
        const filesToUpload = [...uploadedFiles];

        const userMessage: Message = {
            id: Date.now().toString(),
            content: userPrompt || (filesToUpload.length > 0 ? `Uploaded ${filesToUpload.length} file(s)` : ""),
            role: 'user',
            timestamp: new Date(),
        };

        setConversations((prev) =>
            prev.map((conv) =>
                conv.id === currentConversationId
                    ? { ...conv, messages: [...conv.messages, userMessage] }
                    : conv
            )
        );

        setInputValue('');
        setUploadedFiles([]);
        setIsLoading(true);

        try {
            if (filesToUpload.length > 0) {
                for (const file of filesToUpload) {
                    const formData = new FormData();
                    formData.append('file', file);
                    await ChatService.uploadPDF(formData);
                }
            }

            const finalPrompt = userPrompt || "Please analyze the document I just uploaded.";
            const data = await ChatService.sendMessage(finalPrompt, currentConversationId);

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: data.answer,
                role: 'assistant',
                timestamp: new Date(),
                sources: data.sources
            };

            setConversations((prev) =>
                prev.map((conv) =>
                    conv.id === currentConversationId
                        ? { ...conv, messages: [...conv.messages, assistantMessage] }
                        : conv
                )
            );
        } catch (error: any) {
            console.error("Workflow error:", error);
            if (error.message?.includes("Session expired")) {
                router.push('/signin');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const currentConversation = conversations.find((c) => c.id === currentConversationId);
    const isEmpty = !currentConversation || currentConversation.messages.length === 0;

    return (
        <div className="w-full h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex overflow-hidden relative">
            <Sidebar
                user={user} // Passed the user prop
                conversations={conversations}
                currentConversationId={currentConversationId}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                setCurrentConversationId={setCurrentConversationId}
                onNewChat={handleNewChat}
                onDeleteConversation={handleDeleteConversation}
                onRenameConversation={handleRenameConversation}
            />

            <div className="flex-1 flex flex-col overflow-hidden relative w-full">
                <TopBar
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    currentConversation={currentConversation}
                    onDelete={handleDeleteCurrentConversation}
                />

                <div className="flex-1 overflow-y-auto">
                    <ConversationMessages
                        messages={currentConversation?.messages || []}
                        isLoading={isLoading}
                        isEmpty={isEmpty}
                    />
                </div>

                <InputArea
                    inputValue={inputValue}
                    setInputValue={setInputValue}
                    uploadedFiles={uploadedFiles}
                    setUploadedFiles={setUploadedFiles}
                    isLoading={isLoading}
                    onSend={handleSendMessage}
                />
            </div>
        </div>
    );
}