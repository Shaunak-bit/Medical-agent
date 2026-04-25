import React, { useRef } from 'react';
import { Send, Loader2, X } from 'lucide-react';

interface InputAreaProps {
    inputValue: string;
    setInputValue: (value: string) => void;
    uploadedFiles: File[];
    setUploadedFiles: (files: File[]) => void;
    isLoading: boolean;
    onSend: (e: React.FormEvent) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
    inputValue,
    setInputValue,
    uploadedFiles,
    setUploadedFiles,
    isLoading,
    onSend,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const pdfFiles = Array.from(files).filter(
                (file) => file.type === 'application/pdf'
            );
            if (pdfFiles.length > 0) {
                setUploadedFiles([...uploadedFiles, ...pdfFiles]);
            } else {
                alert('Please select only PDF files');
            }
        }
        // Reset input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveFile = (index: number) => {
        setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
    };

    const handleSendWithFiles = async (e: React.FormEvent) => {
        e.preventDefault();
        onSend(e);
    };

    return (
        <div className="border-t border-slate-200/60 bg-white/40 backdrop-blur-sm sticky bottom-0">
            <form onSubmit={handleSendWithFiles} className="max-w-4xl mx-auto w-full px-6 py-4">
                {/* Uploaded Files Display */}
                {uploadedFiles.length > 0 && (
                    <div className="mb-4 animate-fadeInUp">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {uploadedFiles.map((file, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg px-3 py-2.5 animate-slideInLeft"
                                    style={{ animationDelay: `${index * 0.05}s` }}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="text-red-500 font-bold flex-shrink-0">
                                            📄
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-700 truncate">
                                                {file.name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {(file.size / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveFile(index)}
                                        className="ml-2 p-1 hover:bg-red-100 text-red-600 rounded transition-colors flex-shrink-0"
                                        aria-label="Remove file"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} selected
                        </p>
                    </div>
                )}

                {/* Input Section */}
                <div className="relative flex gap-3">
                    {/* Hidden File Input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                        aria-label="Upload PDF files"
                    />

                    {/* Upload Button */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        className="px-3 py-2.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 hover:shadow-md"
                        title="Upload PDF files"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        <span className="text-sm font-medium hidden sm:inline">
                            Upload PDF
                        </span>
                    </button>

                    {/* Text Input */}
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendWithFiles(e as any);
                            }
                        }}
                        placeholder="Ask about medical research, upload PDFs, or explore clinical insights..."
                        disabled={isLoading}
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    />

                    {/* Send Button */}
                    <button
                        type="submit"
                        disabled={isLoading || (!inputValue.trim() && uploadedFiles.length === 0)}
                        className="px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>

                <p className="text-xs text-slate-400 mt-2 text-center">
                    Press Enter to send • Upload PDFs for analysis • Your research assistant
                </p>
            </form>

            <style>{`
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slideInLeft {
          animation: slideInLeft 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-fadeInUp {
          animation: fadeInUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
        </div>
    );
};