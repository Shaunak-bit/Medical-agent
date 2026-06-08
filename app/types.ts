export interface Source {
    file: string;
    page: string; 
    link: string;
    data_type?: string; 
}

export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    createdAt?: string | Date;
    timestamp: Date;
    // The '?' makes it optional so 'user' messages don't require it
    sources?: Source[];
}

export interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    createdAt: Date;
}