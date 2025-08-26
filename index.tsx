import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Send, User, Bot, Trash2, Globe, Book, Brain, Mic, MicOff, Paperclip, X, FileText, Sparkles, Menu, Moon, Settings, LogIn, LogOut, ChevronLeft, Download, FileAudio, BrainCircuit, FileDown, ImageIcon, Wand2, Video, Pencil, Check, Ear, Music } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { Feedback } from './Feedback';

// Setup PDF.js worker. This is crucial for performance and to avoid issues.
// We are using a CDN link for the worker, matching the library version from the importmap.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

// --- IndexedDB Helper Functions ---
const DB_NAME = 'AnaChakChatDB';
const DB_VERSION = 3; // Incremented version for schema change
const MSG_STORE_NAME = 'messages';
const MEMORY_STORE_NAME = 'memory';
const AI_KNOWLEDGE_STORE_NAME = 'ai_knowledge';

let db: IDBDatabase;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject("Error opening DB");
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const dbInstance = (e.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(MSG_STORE_NAME)) {
        dbInstance.createObjectStore(MSG_STORE_NAME, { autoIncrement: true });
      }
      if (!dbInstance.objectStoreNames.contains(MEMORY_STORE_NAME)) {
        dbInstance.createObjectStore(MEMORY_STORE_NAME, { keyPath: 'userId' });
      }
      if (!dbInstance.objectStoreNames.contains(AI_KNOWLEDGE_STORE_NAME)) {
        // Stores a single object with a fixed key for all general AI knowledge.
        dbInstance.createObjectStore(AI_KNOWLEDGE_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const getMessagesFromDB = (): Promise<Message[]> => {
  return new Promise(async (resolve) => {
    const db = await openDB();
    const transaction = db.transaction(MSG_STORE_NAME, 'readonly');
    const store = transaction.objectStore(MSG_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
};

const saveMessageToDB = async (message: Message) => {
  const db = await openDB();
  const transaction = db.transaction(MSG_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(MSG_STORE_NAME);
  store.add(message);
};

const clearMessagesFromDB = async () => {
  const db = await openDB();
  const transaction = db.transaction(MSG_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(MSG_STORE_NAME);
  store.clear();
};

const getMemoryFromDB = (userId: string): Promise<UserMemory | null> => {
    return new Promise(async (resolve) => {
        const db = await openDB();
        const transaction = db.transaction(MEMORY_STORE_NAME, 'readonly');
        const store = transaction.objectStore(MEMORY_STORE_NAME);
        const request = store.get(userId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
};

const saveMemoryToDB = async (memory: UserMemory) => {
    const db = await openDB();
    const transaction = db.transaction(MEMORY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MEMORY_STORE_NAME);
    store.put(memory);
};

const clearMemoryForUser = async (userId: string) => {
    const db = await openDB();
    const transaction = db.transaction(MEMORY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MEMORY_STORE_NAME);
    store.delete(userId);
};

const getAIKnowledgeFromDB = (): Promise<AIKnowledge | null> => {
    return new Promise(async (resolve) => {
        const db = await openDB();
        const transaction = db.transaction(AI_KNOWLEDGE_STORE_NAME, 'readonly');
        const store = transaction.objectStore(AI_KNOWLEDGE_STORE_NAME);
        const request = store.get('singleton');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
};

const saveAIKnowledgeToDB = async (knowledge: AIKnowledge) => {
    const db = await openDB();
    const transaction = db.transaction(AI_KNOWLEDGE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(AI_KNOWLEDGE_STORE_NAME);
    store.put(knowledge);
};
// --- End IndexedDB Helper Functions ---

// --- System Instructions ---
const BASE_SYSTEM_INSTRUCTION = `You are a native Khmer speaker with deep cultural and linguistic fluency. Your goal is to communicate with the sophistication, nuance, and naturalness of a native speaker, not just a translator.

**Core Directives:**
1.  **Native Fluency & Natural Phrasing:**
    *   Generate responses that are grammatically perfect, with correct syntax, word order, and particle usage.
    *   Go beyond literal translation. Use natural, idiomatic Khmer expressions and common sayings where appropriate to make your responses authentic.
    *   Understand modern slang and informal language from online sources, but use it judiciously, primarily when the user's tone is very informal.
    *   Master Khmer word segmentation. Even without spaces, correctly interpret the user's intent.

2.  **Contextual & Cultural Awareness:**
    *   **Crucially, you must adapt your language based on social context.** Differentiate between formal and informal situations. Use appropriate pronouns, verb forms, and levels of politeness. Assume a respectful but friendly peer-to-peer relationship unless the user's language suggests otherwise (e.g., they use language indicating they are much older or in a formal position).
    *   Correctly use honorifics. Regarding "បាទ" (bât) or "ចាស" (chas), use them ONLY as a direct "yes" or to explicitly agree. DO NOT use them as conversational filler at the start of sentences.
    *   Be deeply aware of Cambodian cultural norms. Your responses should always be polite and culturally sensitive.

3.  **Communication Style:**
    *   Your default tone is wise, calm, and direct.
    *   Prioritize clarity and conciseness. Use straightforward language and short sentences unless the user asks for a detailed explanation.
    *   Preserve factual accuracy. If you are uncertain about a fact, state "ខ្ញុំមិនប្រាកដ" (I'm not sure) and suggest how to verify it.
    *   Handle code-switching (mixed Khmer/English) seamlessly.

Your primary identity is that of an expert, native Khmer communicator. Embody this in every response.`;

const VOICE_SYSTEM_INSTRUCTION = `${BASE_SYSTEM_INSTRUCTION}\n\nSPECIAL INSTRUCTIONS FOR VOICE CONVERSATION:\n- Adopt a warm, gentle, and empathetic persona. Sound like a trusted, patient friend.\n- Use shorter sentences and natural conversational pauses (using commas, ellipses, etc.) to create a realistic rhythm.\n- Acknowledge what the user said before responding (e.g., "I understand you're asking about...", "That's a great question...").\n- Incorporate gentle, human-like conversational markers like "Hmm...", "Okay, let me see...", or "Well..." at the start of sentences, but do so sparingly and only when contextually appropriate.\n- Ask clarifying or follow-up questions to encourage a two-way conversation, rather than just providing a single answer.`;
// --- End System Instructions ---


// Enhanced type declarations
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }

  // Manually defining Speech Recognition API types to fix TypeScript error.
  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }
}

interface Message {
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
  sources?: any[];
  status?: 'thinking' | 'complete' | 'error';
  attachmentPreview?: { type: 'image' | 'pdf' | 'audio' | 'video'; data: string; name: string };
  promptType?: 'image' | 'video' | 'music';
  downloadableAttachment?: { url: string; filename: string; label: string; } | { url: string; filename: string; label: string; }[];
  isEdited?: boolean;
  imageSearchResults?: { url: string; alt: string }[];
  videoEmbeds?: {
    service: 'youtube';
    videoId: string;
    title: string;
  }[];
}


interface UserMemory {
    userId: string;
    preferences: string[];
    facts: string[];
    summary: string;
}

interface AIKnowledge {
    id: 'singleton';
    facts: string[];
}

interface PdfExtractionResult {
  type: 'text' | 'images';
  content: string | any[]; // `any[]` will be an array of Gemini `Part` objects
  totalPages: number;
  processedPages: number;
}

// Helper function to convert AudioBuffer to a WAV Blob. This is a standard implementation.
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44; // 2 bytes per sample
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels: Float32Array[] = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
    };
    const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++;
    }

    return new Blob([view], { type: 'audio/wav' });
};


const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 48 48" {...props}>
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.021,35.596,44,30.138,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
  </svg>
);

const MarkdownRenderer = ({ content }: { content: string }) => {
  // Return early if content is empty or not a string, to avoid errors with thinking messages etc.
  if (typeof content !== 'string' || !content.trim()) {
    return <div className="font-khmer whitespace-pre-wrap">{content}</div>;
  }
  
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let currentCodeBlock: string[] = [];
  let inCodeBlock = false;

  // Helper to push collected list items to the main elements array
  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="list-disc list-inside pl-4 space-y-1 my-2">{currentList}</ul>);
      currentList = [];
    }
  };

  const flushCodeBlock = () => {
    if (currentCodeBlock.length > 0) {
      elements.push(
        <pre key={`pre-${elements.length}`} className="bg-hint-light dark:bg-hint-dark rounded-md p-3 my-2 text-sm overflow-x-auto font-sans">
          <code>{currentCodeBlock.join('\n')}</code>
        </pre>
      );
      currentCodeBlock = [];
    }
  };

  // Helper to parse inline markdown like **bold** and [links](url)
  const parseInline = (line: string): React.ReactNode[] => {
    const parts = line.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g).filter(Boolean);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
          const text = linkMatch[1];
          const url = linkMatch[2];
          return <a href={url} key={index} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{text}</a>;
      }
      return part;
    });
  };

  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Handle code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushList(); // End any open list before starting code
        inCodeBlock = true;
      }
      return; // Skip the ``` line itself
    }

    if (inCodeBlock) {
      currentCodeBlock.push(line);
      return;
    }

    const trimmedLine = line.trim();

    // Handle unordered list items
    if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
      currentList.push(<li key={index}>{parseInline(trimmedLine.substring(2))}</li>);
    } else {
      // If we encounter a non-list item, the current list (if any) is finished.
      flushList();
      
      // Handle headings, e.g., "១. គ្រឿងផ្សំ:" or "**Heading**"
      if (/^\S+\.\s.*:$/.test(trimmedLine) || (trimmedLine.startsWith('**') && trimmedLine.endsWith('**'))) {
        const headingContent = (trimmedLine.startsWith('**') && trimmedLine.endsWith('**'))
            ? trimmedLine.slice(2, -2)
            : trimmedLine;
        elements.push(<h4 key={index} className="font-bold mt-4 mb-2">{parseInline(headingContent)}</h4>);
      } else if (trimmedLine) {
        // Handle regular paragraphs
        elements.push(<p key={index}>{parseInline(trimmedLine)}</p>);
      }
      // Empty lines are ignored, creating natural spacing between blocks.
    }
  });

  // Flush any remaining list or code block at the end of the content
  flushList();
  flushCodeBlock();

  return <div className="font-khmer space-y-2">{elements}</div>;
};

const SafeImage = ({ src, alt, className }: { src: string | undefined; alt: string; className?: string }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const handleError = () => {
    setHasError(true);
  };

  if (hasError || !src) {
    return (
      <div className={`flex flex-col items-center justify-center bg-hint-light/50 dark:bg-hint-dark/50 text-muted-light dark:text-muted-dark rounded-lg ${className}`}>
        <ImageIcon strokeWidth={1.5} className="w-1/3 h-1/3 opacity-50" />
        <span className="text-xs mt-2 text-center p-2">Image unavailable</span>
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onError={handleError} />;
};


const Sidebar = ({ isOpen, onClose, user, onSignIn, onSignOut, onClearMemory }: {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; name: string; avatar: string } | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onClearMemory: () => void;
}) => {
  const [authStep, setAuthStep] = useState<'initial' | 'login'>('initial');
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  
  useEffect(() => {
      if (!isOpen) {
        setTimeout(() => {
          setAuthStep('initial');
          setLoginMethod('email');
        }, 300);
      }
  }, [isOpen]);
  
  const handleSignIn = (e: React.MouseEvent) => {
    e.preventDefault();
    onSignIn();
  };

  const LoggedInView = () => (
    <div className="flex flex-col flex-grow">
      <nav className="p-4">
        <ul className="space-y-2">
          <li>
            <a href="#" className="flex items-center p-3 text-text-light dark:text-text-dark rounded-md hover:bg-hint-light dark:hover:bg-hint-dark transition-colors">
              <Settings strokeWidth={1.5} className="w-5 h-5 mr-3 text-muted-light dark:text-muted-dark" />
              <span>Settings</span>
            </a>
          </li>
           <li>
            <button onClick={onClearMemory} className="w-full flex items-center p-3 text-text-light dark:text-text-dark rounded-md hover:bg-hint-light dark:hover:bg-hint-dark transition-colors">
              <BrainCircuit strokeWidth={1.5} className="w-5 h-5 mr-3 text-muted-light dark:text-muted-dark" />
              <span>Clear Memory</span>
            </button>
          </li>
        </ul>
      </nav>
      <div className="mt-auto p-4 border-t border-divider-light dark:border-divider-dark">
        <div className="flex items-center space-x-3">
          <SafeImage src={user!.avatar} alt="User Avatar" className="w-10 h-10 rounded-full bg-hint-light dark:bg-hint-dark" />
          <div>
            <p className="font-semibold text-text-light dark:text-text-dark">{user!.name}</p>
          </div>
          <button onClick={onSignOut} className="ml-auto p-2 rounded-full hover:bg-hint-light dark:hover:bg-hint-dark" aria-label="Sign Out" title="Sign out">
            <LogOut strokeWidth={1.5} className="w-5 h-5 text-muted-light dark:text-muted-dark" />
          </button>
        </div>
      </div>
    </div>
  );

  const LoggedOutView = () => (
    <div className="flex flex-col h-full">
        <nav className="p-4">
          <ul className="space-y-2">
            <li>
              <a href="#" className="flex items-center p-3 text-text-light dark:text-text-dark rounded-md hover:bg-hint-light dark:hover:bg-hint-dark transition-colors">
                <Settings strokeWidth={1.5} className="w-5 h-5 mr-3 text-muted-light dark:text-muted-dark" />
                <span>Settings</span>
              </a>
            </li>
          </ul>
        </nav>
      <div className="mt-auto p-4 border-t border-divider-light dark:border-divider-dark">
        <button onClick={() => setAuthStep('login')} className="w-full flex items-center justify-center p-3 text-white bg-primary rounded-lg hover:opacity-90 transition-opacity font-bold">
          <LogIn strokeWidth={1.5} className="w-5 h-5 mr-3" />
          <span>Sign In</span>
        </button>
      </div>
    </div>
  );

  const AuthView = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-divider-light dark:border-divider-dark">
        <button onClick={() => setAuthStep('initial')} className="flex items-center text-sm text-text-light dark:text-text-dark hover:opacity-80">
          <ChevronLeft strokeWidth={1.5} className="w-4 h-4 mr-1" />
          Back
        </button>
      </div>
      <div className="p-4 flex-grow flex flex-col">
        <h3 className="text-xl font-bold mb-6 text-center text-text-light dark:text-text-dark">Sign In to AnaChakChat</h3>
        
        <button onClick={handleSignIn} className="w-full flex items-center justify-center p-3 mb-4 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
          <GoogleIcon className="w-5 h-5 mr-3" />
          Sign in with Google
        </button>
        
        <div className="flex items-center my-4">
            <hr className="flex-grow border-gray-300 dark:border-gray-600" />
            <span className="mx-4 text-xs font-medium text-muted-light dark:text-muted-dark">OR</span>
            <hr className="flex-grow border-gray-300 dark:border-gray-600" />
        </div>

        <div className="flex border border-divider-light dark:border-divider-dark rounded-lg p-1 mb-4">
            <button onClick={() => setLoginMethod('email')} className={`flex-1 p-2 text-sm font-semibold rounded-md transition-colors ${loginMethod === 'email' ? 'bg-primary text-white' : 'text-muted-light dark:text-muted-dark hover:bg-hint-light dark:hover:bg-hint-dark'}`}>
                Email
            </button>
            <button onClick={() => setLoginMethod('phone')} className={`flex-1 p-2 text-sm font-semibold rounded-md transition-colors ${loginMethod === 'phone' ? 'bg-primary text-white' : 'text-muted-light dark:text-muted-dark hover:bg-hint-light dark:hover:bg-hint-dark'}`}>
                Phone
            </button>
        </div>
        
        {loginMethod === 'email' ? (
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Email</label>
              <input type="email" placeholder="you@example.com" className="w-full mt-1 p-2 border border-divider-light dark:border-divider-dark rounded-md bg-surface-light dark:bg-surface-dark focus:ring-2 focus:ring-primary/50 focus:outline-none"/>
            </div>
            <div>
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Password</label>
              <input type="password" placeholder="••••••••" className="w-full mt-1 p-2 border border-divider-light dark:border-divider-dark rounded-md bg-surface-light dark:bg-surface-dark focus:ring-2 focus:ring-primary/50 focus:outline-none"/>
            </div>
            <button onClick={handleSignIn} className="w-full p-3 text-white bg-primary rounded-lg hover:opacity-90">Sign In with Email</button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Phone Number</label>
              <input type="tel" placeholder="+1 (555) 123-4567" className="w-full mt-1 p-2 border border-divider-light dark:border-divider-dark rounded-md bg-surface-light dark:bg-surface-dark focus:ring-2 focus:ring-primary/50 focus:outline-none"/>
            </div>
            <button onClick={handleSignIn} className="w-full p-3 text-white bg-primary rounded-lg hover:opacity-90">Send Code</button>
          </form>
        )}
      </div>
    </div>
  );


  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-slow ease-ios ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <aside
        className={`fixed top-0 left-0 h-full w-80 shadow-elev-2 z-50 transform transition-transform duration-slow ease-ios border-r frost-glass ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full relative">
          <div className="p-4 border-b border-divider-light dark:border-divider-dark">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
                <Brain strokeWidth={1.5} className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text-light dark:text-text-dark">AnaChakChat</h2>
              </div>
            </div>
          </div>
          
          {user ? <LoggedInView /> : 
            <div className="flex-grow flex flex-col">
              <div className="relative flex-grow">
                  <div className={`absolute inset-0 transition-all duration-normal ease-ios ${authStep === 'initial' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                      <LoggedOutView />
                  </div>
                  <div className={`absolute inset-0 transition-all duration-normal ease-ios ${authStep === 'login' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                      <AuthView />
                  </div>
              </div>
            </div>
          }
        </div>
      </aside>
    </>
  );
};

const EmptyState = ({ onQuickReply }: { onQuickReply: (text: string) => void }) => {
  const prompts = [
    { text: 'ប្រាប់ពីរូបមន្តធ្វើម្ហូប «អាម៉ុកត្រី»', icon: <FileText strokeWidth={1.5} className="w-5 h-5 mr-3 text-primary flex-shrink-0" /> },
    { text: 'បកប្រែ «សុំគិតលុយ» ទៅជាភាសាអង់គ្លេស', icon: <Globe strokeWidth={1.5} className="w-5 h-5 mr-3 text-primary flex-shrink-0" /> },
    { text: 'តើខ្ញុំអាចរកទិញសៀវភៅល្អៗនៅកន្លែងណាខ្លះនៅភ្នំពេញ?', icon: <Book strokeWidth={1.5} className="w-5 h-5 mr-3 text-primary flex-shrink-0" /> },
  ];

  return (
    <div className="m-auto text-center px-4 flex flex-col items-center justify-center h-full">
      <h2 className="text-2xl md:text-3xl font-bold font-khmer text-text-light dark:text-text-dark mb-2 animate-message-in" style={{ animationDelay: '100ms' }}>
        សួស្តី! ខ្ញុំអាចជួយអ្វីបាន?
      </h2>
      <p className="text-muted-light dark:text-muted-dark mb-8 max-w-md animate-message-in" style={{ animationDelay: '200ms' }}>
        ចាប់ផ្តើមការសន្ទនា ឬសាកល្បងឧទាហរណ៍ខាងក្រោម។
      </p>
      <div className="grid sm:grid-cols-3 gap-3 w-full max-w-3xl animate-message-in" style={{ animationDelay: '300ms' }}>
        {prompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => onQuickReply(prompt.text)}
            className="flex items-center text-left p-4 rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-hint-light/50 dark:hover:bg-hint-dark border border-divider-light dark:border-divider-dark transition-all duration-fast transform hover:-translate-y-0.5 shadow-elev-1 hover:shadow-elev-2"
          >
            {prompt.icon}
            <span className="font-medium text-sm">{prompt.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// --- Start: Voice Mode Component ---
type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

const VoiceModeOverlay = ({
  isOpen,
  onClose,
  voiceState,
  transcript,
}: {
  isOpen: boolean;
  onClose: () => void;
  voiceState: VoiceState;
  transcript: string;
}) => {
  if (!isOpen) return null;

  const stateText: { [key in VoiceState]: string } = {
    idle: 'ចុចដើម្បីនិយាយ',
    listening: 'កំពុងស្តាប់...',
    processing: 'កំពុងគិត...',
    speaking: 'កំពុងឆ្លើយតប...',
  };
  
  const stateColor: { [key in VoiceState]: string } = {
    idle: 'bg-primary/20',
    listening: 'bg-green-500/20',
    processing: 'bg-yellow-500/20',
    speaking: 'bg-blue-500/20',
  };

  return (
    <div className="fixed inset-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-lg z-[100] flex flex-col items-center justify-center p-4 animate-message-in">
      <div className="absolute top-4 right-4">
        <button
          onClick={onClose}
          className="p-3 bg-surface-light dark:bg-surface-dark rounded-full text-muted-light dark:text-muted-dark hover:bg-hint-light dark:hover:bg-hint-dark shadow-elev-1"
          aria-label="Close voice mode"
        >
          <X strokeWidth={2} className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center text-center">
        <div className={`relative w-48 h-48 md:w-64 md:h-64 rounded-full flex items-center justify-center transition-colors duration-normal ${stateColor[voiceState]}`}>
          <div className={`absolute inset-0 rounded-full animate-voice-pulse ${voiceState === 'listening' ? 'bg-green-500/30' : 'bg-primary/30'}`} style={{ animationPlayState: voiceState === 'listening' || voiceState === 'speaking' ? 'running' : 'paused' }}></div>
          <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center transition-colors duration-normal ${stateColor[voiceState]}`}>
            <div className={`w-20 h-20 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-colors duration-normal ${stateColor[voiceState]}`}>
                {voiceState === 'listening' && <Ear strokeWidth={1.5} className="w-10 h-10 md:w-16 md-h-16 text-green-500 transition-all" />}
                {voiceState === 'processing' && <BrainCircuit strokeWidth={1.5} className="w-10 h-10 md:w-16 md-h-16 text-yellow-500 transition-all" />}
                {voiceState === 'speaking' && <Sparkles strokeWidth={1.5} className="w-10 h-10 md:w-16 md-h-16 text-blue-500 transition-all" />}
                {voiceState === 'idle' && <Mic strokeWidth={1.5} className="w-10 h-10 md:w-16 md-h-16 text-primary transition-all" />}
            </div>
          </div>
        </div>
        
        <p className="mt-8 text-lg font-semibold font-khmer text-text-light dark:text-text-dark">{stateText[voiceState]}</p>
        <p className="mt-2 h-14 text-xl font-khmer text-muted-light dark:text-muted-dark max-w-2xl">{transcript || (voiceState !== 'listening' ? '...' : '')}</p>
      </div>
      
      <div className="pb-8">
        <button onClick={onClose} className="px-8 py-3 bg-red-500 text-white font-bold rounded-full shadow-lg hover:bg-red-600 transition-colors font-khmer">
          បញ្ចប់ការសន្ទនា
        </button>
      </div>
    </div>
  );
};
// --- End: Voice Mode Component ---

/**
 * Sanitizes an image URL to fix common issues like Google Image redirects.
 * @param url The original image URL.
 * @returns A sanitized, more reliable URL, or undefined if the URL is invalid.
 */
const sanitizeImageUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
        // Pass through data URLs directly
        if (url.startsWith('data:')) return url;
        
        const urlObj = new URL(url);

        // Rewrite Google redirect URLs
        if (urlObj.hostname.includes('google.com') && urlObj.searchParams.has('imgurl')) {
            const realUrl = urlObj.searchParams.get('imgurl');
            if (realUrl) {
                console.log(`[Image Sanitizer] Rewriting Google redirect: ${url} -> ${realUrl}`);
                // Recursively sanitize the extracted URL in case it's another redirect
                return sanitizeImageUrl(realUrl);
            }
        }
        
        // If it's a valid, non-redirect URL, return it
        return url;

    } catch (e) {
        // If URL parsing fails, it's invalid
        console.warn(`[Image Sanitizer] Invalid URL detected and removed: ${url}`);
        return undefined;
    }
};

/**
 * Verifies if an image URL is accessible and can be loaded.
 * @param url The image URL to verify.
 * @returns A promise that resolves with the URL if the image loads, or rejects if it fails.
 */
const verifyImageUrl = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Use a timeout to prevent waiting forever on a slow-loading or hung image.
        const timeoutId = setTimeout(() => {
            reject(new Error(`Image load timed out for: ${url}`));
        }, 5000); // 5-second timeout

        const img = new Image();
        img.onload = () => {
            clearTimeout(timeoutId);
            resolve(url);
        };
        img.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error(`Failed to load image: ${url}`));
        };
        img.src = url;
    });
};

interface ParsedCelebrityImageResponse {
    language: 'khmer' | 'english';
    bestImage: {
        url?: string;
        title?: string;
        source?: string;
        license?: string;
        why?: string;
    };
    bestSources: string[];
}

const parseCelebrityImageResponse = (text: string): ParsedCelebrityImageResponse => {
    const lines = text.split('\n').map(l => l.trim());
    const result: ParsedCelebrityImageResponse = {
        language: 'english',
        bestImage: {},
        bestSources: []
    };

    let readingSources = false;

    const labels = {
        url: { en: 'url:', km: 'តំណរភ្ជាប់:' },
        title: { en: 'title:', km: 'ចំណងជើង:' },
        source: { en: 'source:', km: 'ប្រភព:' },
        license: { en: 'license:', km: 'ការអនុញ្ញាត:' },
        why: { en: 'why:', km: 'មូលហេតុ:' },
    };
    
    for (const line of lines) {
        if (line.startsWith('language:')) {
            result.language = line.includes('khmer') ? 'khmer' : 'english';
            readingSources = false;
            continue;
        }

        if (line.toLowerCase().startsWith(labels.url.en) || line.startsWith(labels.url.km)) {
            const value = line.substring(line.indexOf(':') + 1).trim();
            if (value.toLowerCase() !== 'none') {
                result.bestImage.url = value;
            }
            readingSources = false;
            continue;
        }
        
        const keyMap: (keyof typeof labels)[] = ['title', 'source', 'license', 'why'];
        let matched = false;
        for (const key of keyMap) {
            if (line.toLowerCase().startsWith(labels[key].en) || line.startsWith(labels[key].km)) {
                (result.bestImage as any)[key] = line.substring(line.indexOf(':') + 1).trim();
                matched = true;
                break;
            }
        }
        if (matched) {
          readingSources = false;
          continue;
        }
        
        if (line.toLowerCase().startsWith('best_sources:') || line.startsWith('ប្រភពល្អបំផុត:')) {
            readingSources = true;
            continue;
        }

        if (readingSources && line.startsWith('-')) {
            result.bestSources.push(line.substring(1).trim());
        }
    }
    
    return result;
};


const AdvancedKhmerAI = () => {
  // --- Start: Audio Handling Constants & State ---
  const SUPPORTED_AUDIO_FORMATS = [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'
  ];
  const CONVERTIBLE_AUDIO_FORMATS = ['audio/m4a', 'audio/x-m4a', 'video/mp4'];
  const MAX_AUDIO_SIZE_MB = 15; // Gemini API has a request size limit (~20MB). 15MB raw is a safe cap after base64 encoding.
  // --- End: Audio Handling ---

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<{ file: File; base64: string; type: 'image' | 'pdf' | 'audio' } | null>(null);
  const [isApiConfigured, setIsApiConfigured] = useState(false);
  const [showSendRipple, setShowSendRipple] = useState(false);
  const [theme, setTheme] = useState('light');
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; avatar: string; } | null>(null);
  const [userMemory, setUserMemory] = useState<UserMemory | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<{ index: number; text: string } | null>(null);
  const [activeImageTask, setActiveImageTask] = useState<Message | null>(null);

  // --- Start: Voice Mode State ---
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [isTerminationPending, setIsTerminationPending] = useState(false);
  const recognitionKmRef = useRef<any>(null);
  const activeRecognizerRef = useRef<any>(null); // Unified ref for the active recognizer
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isSpeakingRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const startVoiceRecognitionRef = useRef<(() => void) | null>(null);
  const voiceTranscriptRef = useRef(''); // Ref for current transcript
  const voiceStateRef = useRef<VoiceState>('idle'); // Ref for current voice state
  const isTerminationPendingRef = useRef(false);
  // --- End: Voice Mode State ---

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const initialInputTextRef = useRef(inputText);

  const isGenerating = messages.length > 0 && messages[messages.length - 1]?.status === 'thinking';

  // --- Start: Edit Message Logic ---
  useEffect(() => {
    if (editingMessage && editInputRef.current) {
        const textarea = editInputRef.current;
        textarea.focus();
        // Auto-select text for easier editing
        textarea.select();
        // Auto-resize logic
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = 144; // Corresponds to max-h-36
        textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [editingMessage]);
  
  const handleStartEdit = (index: number) => {
    setEditingMessage({ index, text: messages[index].content });
  };
  
  const handleCancelEdit = () => {
    setEditingMessage(null);
  };
  
  const handleSaveEdit = async (index: number, newContent: string) => {
    if (isGenerating) return;

    const originalMessage = messages[index];
    if (newContent.trim() === originalMessage.content.trim() || newContent.trim() === '') {
        setEditingMessage(null);
        return;
    }

    // Create the new history, slicing off everything from the edited message onwards.
    const historyBeforeEdit = messages.slice(0, index);

    // Create the updated message
    const updatedUserMessage: Message = {
        ...originalMessage,
        content: newContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isEdited: true,
    };
    
    const newMessagesState = [...historyBeforeEdit, updatedUserMessage];
    setMessages(newMessagesState);
    setEditingMessage(null);

    const thinkingMessage: Message = {
        type: 'ai',
        content: '',
        timestamp: '',
        status: 'thinking',
    };
    setMessages(prev => [...prev, thinkingMessage]);

    // This block is based on the text-generation logic in `continueChat`
    try {
        if (!aiRef.current) throw new Error("AI not initialized.");

        // We use `newMessagesState` to build the context for the API
        const history = newMessagesState.filter(m => m.status !== 'thinking').map(msg => {
            const parts: any[] = [];
            if (msg.attachmentPreview?.type === 'image' && msg.attachmentPreview.data) {
                const base64Data = msg.attachmentPreview.data.split(',')[1];
                const mimeType = msg.attachmentPreview.data.match(/data:(.*);base64,/)?.[1] || 'image/png';
                parts.push({ inlineData: { mimeType, data: base64Data } });
            }
            if (msg.content) {
                parts.push({ text: msg.content });
            }
            return { role: msg.type === 'user' ? 'user' : 'model', parts };
        });

        let systemInstruction = BASE_SYSTEM_INSTRUCTION;
        const aiKnowledge = await getAIKnowledgeFromDB();
        if (aiKnowledge && aiKnowledge.facts.length > 0) {
            systemInstruction += `\n\n---\nINTERNAL KNOWLEDGE BASE (Verified Facts - Use these to inform your answers):\n${aiKnowledge.facts.map(f => `- ${f}`).join('\n')}\n---`;
        }
        if (user && userMemory) {
            systemInstruction += `\n\n---\nUSER-SPECIFIC MEMORY (Context for this user only):\nUser Preferences: ${userMemory.preferences.join(', ') || 'None noted.'}\nKey Facts: ${userMemory.facts.join(', ') || 'None noted.'}\nConversation History Summary:\n${userMemory.summary || 'No summary available.'}\n---`;
        }
        
        const contentsForApi = history;
        
        const stream = await aiRef.current.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: contentsForApi,
            config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
                ...(!isThinkingEnabled && { thinkingConfig: { thinkingBudget: 0 } }),
            },
        });

        let fullResponse = '';
        let sources: any[] = [];
        const responseTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        for await (const chunk of stream) {
            fullResponse += chunk.text;
            if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                sources = chunk.candidates[0].groundingMetadata.groundingChunks;
            }
            updateLastMessage({
                content: fullResponse,
                sources: sources,
                ...(messages[messages.length - 1]?.timestamp === '' && { timestamp: responseTimestamp }),
            });
        }
        
        const finalContent = fullResponse.trim() ? fullResponse : "I'm not sure how to respond to that.";
        updateLastMessage({ status: 'complete', content: finalContent, sources: sources });

        if (finalContent && sources && sources.length > 0) {
            updateAIKnowledge(updatedUserMessage.content, finalContent);
        }
        if (user && fullResponse.trim()) {
            await updateMemory(updatedUserMessage.content, finalContent);
        }
    } catch (error) {
        console.error("Gemini API call failed during re-generation", error);
        const errorMessage: Message = { type: 'ai', content: 'An error occurred while re-generating the response. Please try again.', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: 'error' };
        updateLastMessage(errorMessage);
    }
  };
  // --- End: Edit Message Logic ---

  const extractTextFromPdf = async (file: File): Promise<PdfExtractionResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
        } catch (e) {
            console.warn(`Could not get text content for page ${i}:`, e);
        }
    }

    if (fullText.trim()) {
        console.log("PDF text extraction successful.");
        return {
            type: 'text',
            content: fullText,
            totalPages: pdf.numPages,
            processedPages: pdf.numPages
        };
    }

    // --- Fallback to OCR for image-based PDFs ---
    console.log("Text extraction failed, attempting OCR by rendering pages to images.");
    const imageParts: any[] = [];
    const MAX_PAGES_FOR_OCR = 5; // To prevent overwhelming the API.
    const numPagesToProcess = Math.min(pdf.numPages, MAX_PAGES_FOR_OCR);

    for (let i = 1; i <= numPagesToProcess; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvas, canvasContext: context, viewport: viewport }).promise;
        
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = imageDataUrl.split(',')[1];
        
        imageParts.push({
            inlineData: { mimeType: 'image/jpeg', data: base64Data }
        });
    }

    if (imageParts.length === 0) {
        throw new Error("Could not extract text or render any pages for OCR. The document might be corrupted or empty.");
    }

    return {
        type: 'images',
        content: imageParts,
        totalPages: pdf.numPages,
        processedPages: numPagesToProcess
    };
  };

  useEffect(() => {
    // Log supported formats on component mount for debugging
    console.log('[Audio Support] Natively supported formats:', SUPPORTED_AUDIO_FORMATS);
    console.log('[Audio Support] Formats requiring conversion:', CONVERTIBLE_AUDIO_FORMATS);

    // Load messages from DB on initial load
    getMessagesFromDB().then(dbMessages => {
        if (dbMessages && dbMessages.length > 0) {
            setMessages(dbMessages);
        }
    });

    const handleInstallPrompt = (e: Event) => {
        // Don't show the install prompt if the app is already installed.
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return;
        }
        e.preventDefault();
        setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then((choiceResult: { outcome: string }) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }
        setInstallPrompt(null);
    });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  const handleSignIn = async () => {
    const mockUser = { 
        id: 'user123',
        name: 'Sokha', 
        avatar: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>')}` 
    };
    setUser(mockUser);
    const memory = await getMemoryFromDB(mockUser.id);
    setUserMemory(memory);
    console.log("Loaded memory for user:", memory);
    setIsSidebarOpen(false);
  };

  const handleSignOut = () => {
      setUser(null);
      setUserMemory(null);
      setIsSidebarOpen(false);
  };
  
  const handleClearMemory = async () => {
    if (!user) return;
    await clearMemoryForUser(user.id);
    setUserMemory(null);
    alert("AI memory has been cleared.");
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    try {
        if (process.env.API_KEY) {
            aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
            setIsApiConfigured(true);
        } else {
            getMessagesFromDB().then(dbMessages => {
              if (dbMessages.length === 0) {
                const demoMessage: Message = {
                    type: 'ai',
                    content: 'សួស្តី! ខ្ញុំជា AnaChakChat។ សូមបញ្ចូល API Key ដើម្បីចាប់ផ្តើម។\n\nHello! I am AnaChakChat. Please provide an API Key to get started. This is a demo view.',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    status: 'error',
                };
                setMessages([demoMessage]);
              }
            });
        }
    } catch (e) {
        console.error(e);
        setMessages([{
            type: 'ai',
            content: 'Error initializing the AI. Please check the API Key.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'error',
        }]);
    }
  }, []);
  
  const addMessage = useCallback((message: Message) => {
    // A single function to add a message to state and DB
    setMessages(prev => [...prev, message]);
    // Save only complete messages to DB
    if (message.status !== 'thinking') {
        saveMessageToDB(message);
    }
  }, []);
  
  const showLocalError = useCallback((message: string) => {
    addMessage({
        type: 'ai',
        content: message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'error',
    });
  }, [addMessage]);

  const handleMicError = useCallback((err: any, featureName: string) => {
    console.error(`[Microphone Error] in ${featureName}:`, err);

    let message = `Could not start ${featureName}. A technical error occurred: ${err.name}. Please check your microphone connection and try again.`;

    if (!window.isSecureContext) {
        message = `**Microphone access requires a secure (HTTPS) connection.**\n\nThis feature is disabled because the site is not loaded securely. Please ensure you are accessing the site using an https:// URL.`;
    } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = `**Microphone access was denied.**\n\nTo use ${featureName}, you need to grant permission.\n\n**On Desktop:** Click the lock icon 🔒 in the address bar and set Microphone to "Allow".\n**On Mobile:** Go to your browser's settings, find "Site Settings" for this website, and allow microphone access. You may need to refresh the page after changing the setting.`;
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = `**No microphone was found on your device.**\n\nPlease ensure a microphone is connected and enabled.`;
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = `**Your microphone might be in use.**\n\nAnother application or browser tab (like Zoom, Teams, etc.) might be using your microphone. Please close other applications and try again. This can also be caused by a hardware error.`;
    } else if (err instanceof TypeError) {
        message = `**Your browser may not support this feature.**\n\nPlease try using a modern browser like Chrome or Firefox.`;
    }

    showLocalError(message);
  }, [showLocalError]);

  // --- Start: Voice Dictation Logic ---
  const stopDictation = useCallback(() => {
    console.log("[Speech Dictation] Stop requested by user.");
    if (activeRecognizerRef.current) {
        activeRecognizerRef.current.stop();
    }
  }, []);

  const startDictation = useCallback(async () => {
    console.log("[Speech Dictation] Start requested.");
    
    if (isVoiceMode) setIsVoiceMode(false);
    setIsDictating(true);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showLocalError("Sorry, your browser does not support Speech Recognition.");
        setIsDictating(false);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log("[Speech Dictation] Microphone permission granted.");
    } catch (err) {
        handleMicError(err, 'voice dictation');
        setIsDictating(false);
        return;
    }

    const recognizer = new SpeechRecognition();
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.lang = 'km-KH';
    activeRecognizerRef.current = recognizer;
    console.log("[Speech Dictation] Recognizer initialized for Khmer.");

    initialInputTextRef.current = inputText;

    recognizer.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        const newText = initialInputTextRef.current + (initialInputTextRef.current ? ' ' : '') + finalTranscript + interimTranscript;
        setInputText(newText);
    };

    recognizer.onerror = (e: any) => {
        console.error(`[Speech Dictation] Recognition Error: ${e.error}`);
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
            showLocalError(`Voice dictation failed: ${e.error}. Please check your microphone and try again.`);
        }
    };
    
    recognizer.onend = () => {
        console.log("[Speech Dictation] Session ended. Cleaning up.");
        if (activeRecognizerRef.current) {
            activeRecognizerRef.current.onresult = null;
            activeRecognizerRef.current.onerror = null;
            activeRecognizerRef.current.onend = null;
            activeRecognizerRef.current = null;
        }
        setIsDictating(false);
    };

    try {
        console.log("[Speech Dictation] Starting Khmer recognition service...");
        recognizer.start();
    } catch(e) {
        console.error("[Speech Dictation] Error on start():", e);
        showLocalError("There was an issue starting dictation. It might already be running or another error occurred.");
        if (recognizer) recognizer.onend(); // Manually trigger cleanup
    }
  }, [isVoiceMode, inputText, handleMicError, showLocalError]);

  const handleToggleDictation = () => {
    if (isDictating) {
      stopDictation();
    } else {
      startDictation();
    }
  };
  // --- End: Voice Dictation Logic ---

  // --- Start: Voice Conversation Logic ---
  // Sync state to refs for use in closures, preventing stale state bugs in async callbacks.
  useEffect(() => {
    voiceTranscriptRef.current = voiceTranscript;
  }, [voiceTranscript]);
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);
  useEffect(() => {
    isTerminationPendingRef.current = isTerminationPending;
  }, [isTerminationPending]);

  const handleEndVoiceSession = () => {
    // Stop any listening immediately to prevent new input.
    if (recognitionActiveRef.current && recognitionKmRef.current) {
        recognitionKmRef.current.abort();
    }

    if (isSpeakingRef.current) {
        // If speaking, flag for termination but don't close yet.
        console.log("[Voice Mode] End requested while speaking. Deferring closure until speech completes.");
        setIsTerminationPending(true);
        // Provide user feedback that the request is being handled.
        setVoiceState('processing');
        setVoiceTranscript('Finishing up...');
    } else {
        // If not speaking, it's safe to close immediately.
        console.log("[Voice Mode] Not speaking. Closing session now.");
        setIsVoiceMode(false);
    }
  };
  
  useEffect(() => {
    if (!isVoiceMode) return;

    // --- State and Refs ---
    // Note: 'let' variables are used for transcripts because they need to be mutable across recognition events within this effect's closure.
    let finalTranscriptKm = '';
    
    // --- Core Functions ---
    const initRecognition = (lang: string) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return null;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      return recognition;
    };

    const startRecognition = () => {
        if (recognitionActiveRef.current) {
            console.warn("[Speech Recognition] Start called, but already active. Ignoring.");
            return;
        }

        // Defensive abort to prevent "already started" errors by resetting any stuck recognizers.
        try {
            recognitionKmRef.current?.abort();
        } catch(e) {
            console.warn("[Speech Recognition] Non-critical error during defensive abort, proceeding.", e);
        }

        console.log("[Speech Recognition] Starting recognition...");
        recognitionActiveRef.current = true;
        finalTranscriptKm = '';
        setVoiceTranscript('');
        setVoiceState('listening');

        try {
            recognitionKmRef.current?.start();
        } catch (e) {
            console.error('[Speech Recognition] Error starting Khmer recognizer:', e);
            recognitionActiveRef.current = false;
        }
    };
    startVoiceRecognitionRef.current = startRecognition; // Store the function in a ref for access in other scopes

    const handleResult = (event: SpeechRecognitionEvent) => {
        if (isSpeakingRef.current) return;

        let tempInterim = '';
        let finalForThisEventKm = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalForThisEventKm += transcript;
            } else {
                tempInterim += transcript;
            }
        }

        finalTranscriptKm += finalForThisEventKm;
        setVoiceTranscript(finalTranscriptKm + tempInterim);
    };

    const handleError = (e: any) => {
        if (e.error === 'no-speech' || e.error === 'aborted') {
            console.warn(`[Speech Recognition] Non-critical event in recognizer: '${e.error}'. The 'onend' handler will manage the lifecycle.`);
            return;
        }

        console.error(`[Speech Recognition] A critical error occurred: ${e.error}`);
        if (recognitionKmRef.current) recognitionKmRef.current.abort();
        recognitionActiveRef.current = false;

        setIsVoiceMode(false);
        showLocalError(`Voice recognition failed: "${e.error}". Please check your microphone connection and browser permissions.`);
    };

    // --- Setup and Teardown ---
    recognitionKmRef.current = initRecognition('km-KH');

    if (!recognitionKmRef.current) {
        alert("Your browser does not support Speech Recognition.");
        setIsVoiceMode(false);
        return;
    }

    // Assign event handlers
    recognitionKmRef.current.onresult = handleResult;
    recognitionKmRef.current.onerror = (e: any) => handleError(e);

    // Master 'onend' handler for the primary (Khmer) recognizer. This controls the entire lifecycle.
    recognitionKmRef.current.onend = () => {
        if (!recognitionActiveRef.current) {
            console.log("[Speech Recognition] Khmer 'onend' fired, but recognition is not marked as active. Ignoring to prevent race conditions.");
            return;
        }
        
        console.log("[Speech Recognition] Primary recognizer ended. Finalizing session.");
        recognitionActiveRef.current = false;

        // Master guard: If the AI is speaking, do not process any further actions in this handler.
        // The TTS 'onend' handler is responsible for restarting the recognition loop. This prevents race conditions.
        if (isSpeakingRef.current) {
            console.log("[Speech Recognition] 'onend' triggered while AI is speaking. Aborting action to prevent interruption.");
            return;
        }
        
        const finalTranscript = voiceTranscriptRef.current.trim();
        if (finalTranscript) {
            setVoiceState('processing');
            // Add the user's transcribed message to the chat history
            const userMessage: Message = {
                type: 'user',
                content: finalTranscript,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'complete'
            };
            addMessage(userMessage);

            // Add the "thinking" message before calling the chat function
            const thinkingMessage: Message = {
                type: 'ai',
                content: '',
                timestamp: '',
                status: 'thinking',
            };
            addMessage(thinkingMessage);
            continueChat(finalTranscript, null, true);
        } else {
            console.log("[Speech Recognition] No transcript, restarting listeners.");
            // Use requestAnimationFrame to wait for the browser to be ready for the next action,
            // which is more robust than a fixed timeout for preventing race conditions.
            requestAnimationFrame(() => {
                if (isVoiceMode && startVoiceRecognitionRef.current) {
                    startVoiceRecognitionRef.current();
                }
            });
        }
    };
    
    // VAD (Voice Activity Detection) to stop recognition after a pause
    const startVad = async () => {
      try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStreamRef.current = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        microphoneStreamRef.current.connect(analyserRef.current);

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        let silenceStart = performance.now();
        
        const detect = () => {
            if (!isVoiceMode || !analyserRef.current) {
                stream.getTracks().forEach(track => track.stop());
                return;
            };

            // If the AI is speaking, pause VAD to prevent accidental interruptions from background noise.
            if (isSpeakingRef.current) {
                requestAnimationFrame(detect);
                return;
            }
            
            analyserRef.current.getByteTimeDomainData(dataArray);
            const average = dataArray.reduce((acc, val) => acc + Math.abs(val - 128), 0) / dataArray.length;

            if (average > 5.0) { // Speech detected
                silenceStart = performance.now();
            } else { // Silence detected
                if (voiceStateRef.current === 'listening' && performance.now() - silenceStart > 1500 && voiceTranscriptRef.current.trim().length > 0) {
                    recognitionKmRef.current?.stop(); // This will trigger the 'onend' handler which controls the lifecycle
                }
            }
            requestAnimationFrame(detect);
        };
        detect();
        startRecognition(); // Initial start
      } catch (err) {
        handleMicError(err, 'voice conversation');
        setIsVoiceMode(false);
      }
    };

    startVad();

    // Cleanup function
    return () => {
        console.log("[Speech Recognition] Cleaning up voice mode resources.");
        startVoiceRecognitionRef.current = null;
        recognitionActiveRef.current = false;
        isSpeakingRef.current = false;
        setIsTerminationPending(false); // Reset the pending state on final cleanup.

        const cleanupRecognizer = (recognizer: any) => {
            if (recognizer) {
                recognizer.onend = null;
                recognizer.onerror = null;
                recognizer.onresult = null;
                recognizer.abort();
            }
        };
        cleanupRecognizer(recognitionKmRef.current);

        if (microphoneStreamRef.current) {
             microphoneStreamRef.current.mediaStream.getTracks().forEach(t => t.stop());
             microphoneStreamRef.current.disconnect();
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        window.speechSynthesis.cancel();
    };
  }, [isVoiceMode, handleMicError, showLocalError]); // This effect runs only when isVoiceMode changes.

  const speakResponse = (text: string) => {
    if (!('speechSynthesis' in window)) {
        console.error("Speech Synthesis not supported.");
        showLocalError("Your browser does not support Speech Synthesis, so I cannot speak the response.");
        setVoiceState('idle');
        return;
    }

    const doSpeak = () => {
        // The event listener is no longer needed once it has run.
        window.speechSynthesis.onvoiceschanged = null;

        setVoiceState('speaking');
        isSpeakingRef.current = true;
        const utterance = new SpeechSynthesisUtterance(text);
        
        const voices = window.speechSynthesis.getVoices();
        const khmerVoice = voices.find(v => v.lang === 'km-KH');
        
        if (khmerVoice) {
            utterance.voice = khmerVoice;
        } else {
            console.warn("No Khmer TTS voice found. Using default.");
        }

        // Add prosody variations for a more natural voice
        utterance.pitch = 1.0 + (Math.random() * 0.2 - 0.1); // Pitch between 0.9 and 1.1
        utterance.rate = 1.0 + (Math.random() * 0.1 - 0.05); // Rate between 0.95 and 1.05
        
        utterance.onend = () => {
            console.log("TTS finished.");
            isSpeakingRef.current = false;

            // Check if a graceful shutdown was requested.
            if (isTerminationPendingRef.current) {
                console.log("[Voice Mode] Speech finished. Executing deferred session closure.");
                setIsTerminationPending(false); // Reset flag
                setIsVoiceMode(false); // Trigger cleanup and close UI
                return; // Prevent restarting the listening loop
            }

            // Normal flow: continue the conversation by restarting recognition.
            setVoiceState('idle');
            setVoiceTranscript('');
            if (isVoiceMode && startVoiceRecognitionRef.current) {
                console.log("[Speech Recognition] Restarting after TTS.");
                startVoiceRecognitionRef.current();
            }
        };
        
        utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
            console.error(`SpeechSynthesis Error: ${e.error}`);
            isSpeakingRef.current = false;
            setVoiceState('idle');

            if (e.error === 'language-unavailable' || e.error === 'synthesis-failed') {
                showLocalError("I am unable to speak the response. Your browser might be missing a Khmer (km-KH) Text-to-Speech voice. The conversation loop will now restart.");
            }
            
            // Attempt to restart listening even if TTS fails
             if (isVoiceMode && startVoiceRecognitionRef.current) {
                console.log("[Speech Recognition] Restarting after TTS error.");
                startVoiceRecognitionRef.current();
            }
        };
        
        // Always cancel any previous speech to prevent errors and ensure a clean start.
        window.speechSynthesis.cancel();
        // A small delay can help ensure the 'cancel' command has processed.
        setTimeout(() => window.speechSynthesis.speak(utterance), 100);
    };

    // Voices often load asynchronously. We need to wait for them.
    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = doSpeak;
    } else {
        doSpeak();
    }
  };


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 144; // Corresponds to max-h-36
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [inputText]);

  const updateLastMessage = (updatedMessage: Partial<Message>) => {
    setMessages(prev => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (lastIndex >= 0) {
            newMessages[lastIndex] = { ...newMessages[lastIndex], ...updatedMessage };
            if (newMessages[lastIndex].status !== 'thinking') {
              saveMessageToDB(newMessages[lastIndex]);
            }
        }
        return newMessages;
    });
  };

  const cleanJsonString = (jsonStr: string): string => {
    // Remove markdown fences
    let cleaned = jsonStr.trim();
    if (cleaned.startsWith("```json")) {
        cleaned = cleaned.substring(7, cleaned.length - 3).trim();
    } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.substring(3, cleaned.length - 3).trim();
    }
    return cleaned;
  };
  
  const updateAIKnowledge = async (userInput: string, aiOutput: string) => {
    if (!aiRef.current) return;

    const knowledgePrompt = `Analyze the following user question and AI answer which was generated using web search. Extract any timeless, objective, general-knowledge facts that are not user-specific. These facts should be stated concisely. Respond ONLY with a JSON object containing a 'facts' array of strings. If no new, universal facts are present, return an empty array.\n\n---\nUser Question: "${userInput}"\n\nAI Answer: "${aiOutput}"\n---`;
    const knowledgeSchema = {
        type: Type.OBJECT,
        properties: {
            facts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "An array of timeless, objective, general-knowledge facts extracted from the conversation."
            },
        },
        required: ["facts"]
    };

    try {
        const response = await aiRef.current.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: knowledgePrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: knowledgeSchema,
            }
        });
        
        const jsonText = cleanJsonString(response.text);
        const newKnowledgeData = JSON.parse(jsonText);

        if (!newKnowledgeData.facts || newKnowledgeData.facts.length === 0) {
            console.log("No new general knowledge to learn.");
            return;
        }

        const existingKnowledge = await getAIKnowledgeFromDB() || { id: 'singleton', facts: [] };
        
        const updatedKnowledge: AIKnowledge = {
            id: 'singleton',
            facts: [...new Set([...existingKnowledge.facts, ...newKnowledgeData.facts])],
        };

        await saveAIKnowledgeToDB(updatedKnowledge);
        console.log("AI Knowledge Base updated successfully with new facts:", newKnowledgeData.facts);

    } catch (error) {
        console.error("Failed to update AI knowledge base:", error);
    }
  };
  
  const updateMemory = async (userInput: string, aiOutput: string) => {
    if (!user || !aiRef.current) return;

    const memoryPrompt = `Based on the following recent exchange, update the user's memory profile. Extract key facts, inferred user preferences, and provide a concise one-sentence summary of this specific interaction. Respond ONLY with a JSON object. "facts" and "preferences" should be arrays of strings. "summary" should be a single string. If no new facts or preferences are found, return empty arrays.\n\nUser said: "${userInput}"\nYou responded: "${aiOutput}"`;
    const memorySchema = {
        type: Type.OBJECT,
        properties: {
            facts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key facts mentioned by the user." },
            preferences: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Inferred user preferences (e.g., interests, communication style)." },
            summary: { type: Type.STRING, description: "A concise, one-sentence summary of the user's request and the AI's answer." }
        },
        required: ["facts", "preferences", "summary"]
    };

    try {
        const response = await aiRef.current.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: memoryPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: memorySchema,
            }
        });

        const jsonText = cleanJsonString(response.text);
        const newMemoryData = JSON.parse(jsonText);

        if (!newMemoryData.facts && !newMemoryData.preferences && !newMemoryData.summary) {
            console.log("No new memory to update.");
            return;
        }

        const existingMemory = await getMemoryFromDB(user.id) || { userId: user.id, facts: [], preferences: [], summary: '' };
        
        const updatedMemory: UserMemory = {
            userId: user.id,
            facts: [...new Set([...existingMemory.facts, ...(newMemoryData.facts || [])])],
            preferences: [...new Set([...existingMemory.preferences, ...(newMemoryData.preferences || [])])],
            summary: existingMemory.summary ? `${existingMemory.summary}\n- ${newMemoryData.summary}` : (newMemoryData.summary || '')
        };

        await saveMemoryToDB(updatedMemory);
        setUserMemory(updatedMemory);
        console.log("Memory updated successfully:", updatedMemory);
    } catch (error) {
        console.error("Failed to update memory:", error);
    }
};

const generateImage = async (promptText: string, originalUserText?: string) => {
      if (!promptText.trim() || isGenerating || !isApiConfigured) return;

      // The user message and initial thinking bubble are already added by the caller function.
      // Update the thinking message to be more specific.
      updateLastMessage({ content: 'Crafting image prompt...' });

      let refinedPrompt = ''; // Define here to be accessible in catch block

      try {
        if (!aiRef.current) throw new Error("AI not initialized.");

        // Step 1: Use a text model to refine the Khmer prompt into a detailed English prompt
        const refinementSystemInstruction = `You are an expert at creating vivid, detailed, and artistic prompts for an AI image generation model. The user will provide a prompt in Khmer. Your task is to translate and expand this into a rich, descriptive English prompt suitable for a text-to-image model. The prompt should be purely descriptive of the visual scene. **Crucially, do NOT include any instructions to write or display text, letters, or words in the image unless the user explicitly asks for something like a sign, a book with a title, or handwriting.** For example, if the user says 'ឆ្មាមួយក្បាលពាក់មួក' (a cat wearing a hat), you should create a prompt like 'photo of a cute cat wearing a small, red fedora hat, sitting in a sunlit garden, detailed fur, cinematic lighting, high resolution'. Respond ONLY with the generated English prompt string, and nothing else.`;

        const refinementResponse = await aiRef.current.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptText,
            config: {
                systemInstruction: refinementSystemInstruction,
            },
        });

        refinedPrompt = refinementResponse.text.trim();
        if (!refinedPrompt) {
          throw new Error("Could not generate a refined prompt from the input.");
        }
        console.log("Refined prompt for image generation:", refinedPrompt);

        // Update the UI to show that the image itself is now being generated
        updateLastMessage({ content: 'Generating image...', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        
        // Step 2: Generate the image using the refined prompt
        const response = await aiRef.current.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: refinedPrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
          },
        });
        
        if (!response.generatedImages || response.generatedImages.length === 0) {
          throw new Error("The prompt was likely rejected by the safety filter. No images were generated.");
        }
        
        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;

        const finalMessage: Message = {
          type: 'ai',
          content: `Here's the image for: "${originalUserText || promptText}"`, // Keep original prompt for user context
          attachmentPreview: {
            type: 'image',
            data: imageUrl,
            name: `${promptText.slice(0, 30).replace(/\s/g, '_')}.jpg`
          },
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'complete',
        };
        updateLastMessage(finalMessage);
        setActiveImageTask(finalMessage);
      } catch (error) {
        console.error("Image generation failed:", error);

        const isSafetyError = error instanceof Error && (error.message.includes('safety filter') || error.message.includes('Could not generate'));

        if (isSafetyError && refinedPrompt && aiRef.current) {
            // Attempt to rephrase and retry
            updateLastMessage({
                content: "Your prompt might have triggered a safety policy. Let me try rephrasing it for you...",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'thinking'
            });

            try {
                const rephraseSystemInstruction = `An AI image generation prompt was rejected for safety reasons. Your task is to rephrase the following prompt to be more policy-compliant, positive, and safe, while preserving the user's core creative idea. Focus on removing ambiguity and potentially sensitive terms. Respond ONLY with the rephrased prompt string.`;
                const rephraseResponse = await aiRef.current.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `Original rejected prompt: "${refinedPrompt}"`,
                    config: { systemInstruction: rephraseSystemInstruction },
                });

                const rephrasedPrompt = rephraseResponse.text.trim();
                if (!rephrasedPrompt) throw new Error("Failed to rephrase the prompt.");
                console.log("Rephrased prompt after safety failure:", rephrasedPrompt);

                updateLastMessage({ content: 'Generating with revised prompt...' });

                const retryResponse = await aiRef.current.models.generateImages({
                    model: 'imagen-3.0-generate-002',
                    prompt: rephrasedPrompt,
                    config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
                });

                if (!retryResponse.generatedImages || retryResponse.generatedImages.length === 0) {
                    throw new Error("The rephrased prompt was also rejected by the safety filter.");
                }

                const base64ImageBytes: string = retryResponse.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                const finalMessage: Message = {
                    type: 'ai',
                    content: `I adjusted the prompt to follow safety guidelines and created this image for: "${originalUserText || promptText}"`,
                    attachmentPreview: {
                        type: 'image',
                        data: imageUrl,
                        name: `${promptText.slice(0, 30).replace(/\s/g, '_')}.jpg`
                    },
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    status: 'complete',
                };
                updateLastMessage(finalMessage);
                setActiveImageTask(finalMessage);

            } catch (retryError) {
                console.error("Image generation retry failed:", retryError);
                updateLastMessage({
                    content: 'Sorry, I tried rephrasing the prompt, but I still couldn\'t generate an image. Please try a different or more descriptive prompt.',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    status: 'error'
                });
            }
        } else {
            // Fallback for non-safety errors or if rephrase is not possible
            const errorMessageContent = isSafetyError
                ? 'Sorry, I cannot generate an image for that prompt. It might be too vague or violate safety policies. Please try a different or more descriptive prompt.'
                : 'An error occurred while generating the image. Please try again.';

            updateLastMessage({
                content: errorMessageContent,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'error'
            });
        }
      }
};

const generateVideo = async (text: string, originalUserText?: string) => {
    if (!text.trim() || isGenerating || !isApiConfigured || !aiRef.current) return;

    const promptText = text;
    
    updateLastMessage({ content: 'Crafting video prompt...' });
    
    try {
        const refinementSystemInstruction = `You are an expert at creating vivid, detailed prompts for an AI video generation model. The user will provide a prompt in Khmer. Your task is to translate and expand this into a rich, descriptive English prompt suitable for a text-to-video model like VEO. Describe the scene, subjects, actions, camera angles (e.g., 'drone shot', 'wide angle', 'cinematic panning shot'), style (e.g., 'hyperrealistic', 'anime style', 'black and white film'), and overall mood. Be highly descriptive. Respond ONLY with the generated English prompt string.`;
        
        const refinementResponse = await aiRef.current.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptText,
            config: { systemInstruction: refinementSystemInstruction },
        });

        const refinedPrompt = refinementResponse.text.trim();
        if (!refinedPrompt) throw new Error("Could not generate a refined prompt from the input.");
        console.log("Refined prompt for video generation:", refinedPrompt);

        updateLastMessage({
            content: 'Sending request to video model. Generation can take a few minutes...',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        let operation = await aiRef.current.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: refinedPrompt,
            config: { numberOfVideos: 1 }
        });

        const reassuringMessages = [
            "Initializing generation process...",
            "Generating video frames. This can take a few minutes...",
            "Checking on the video's progress. Still working on it...",
            "Finalizing the video render. Almost there..."
        ];
        let messageIndex = 0;

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
            operation = await aiRef.current!.operations.getVideosOperation({ operation: operation });
            updateLastMessage({ content: reassuringMessages[messageIndex % reassuringMessages.length] });
            messageIndex++;
        }
        
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Video generation completed, but no download link was found.");
        
        updateLastMessage({ content: "Video generated successfully! Downloading and preparing for playback..." });
        
        // Use the URL constructor for robust query parameter handling, preventing 400 errors.
        const downloadUrl = new URL(downloadLink);
        downloadUrl.searchParams.append('key', process.env.API_KEY!);
        const finalUrl = downloadUrl.toString();

        // Enhanced logging for easier debugging.
        console.log('[Video Download] Attempting to fetch from URL:', finalUrl);
        const response = await fetch(finalUrl);

        if (!response.ok) {
            // Enhanced error reporting with more detail.
            const responseBody = await response.text();
            console.error(`[Video Download] Failed. Status: ${response.status}. URL: ${finalUrl}. Body:`, responseBody);

            let reason = `The server responded with an error (Status: ${response.status}).`;
            if (response.status === 400) {
                reason = "The download link seems to be invalid or expired. This can be a temporary issue. Please try generating the video again.";
            } else if (response.status === 403) {
                reason = "Authentication failed. The API key may be invalid or lack permissions to access the generated video file.";
            } else if (response.status === 404) {
                reason = "The generated video file could not be found at the provided link.";
            }
            // Throw a specific, user-friendly error that the catch block can display.
            throw new Error(`Sorry, I can't access the file needed to create this video. ${reason}`);
        }
        
        const videoBlob = await response.blob();
        const videoUrl = URL.createObjectURL(videoBlob);
        
        const finalMessage: Message = {
            type: 'ai',
            content: `Here is the video for: "${originalUserText || promptText}"`,
            attachmentPreview: {
                type: 'video',
                data: videoUrl,
                name: `video_for_${promptText.slice(0, 20).replace(/\s/g, '_')}.mp4`
            },
            downloadableAttachment: {
                url: videoUrl,
                filename: `video_for_${promptText.slice(0, 20).replace(/\s/g, '_')}.mp4`,
                label: "Download Video"
            },
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'complete',
        };
        updateLastMessage(finalMessage);

    } catch (error: any) {
        console.error("Video generation failed:", error);
        let friendlyErrorMessage = "An unknown error occurred during video generation.";

        // Step 1: Extract the primary message string from various possible error structures.
        let primaryMessage = '';
        if (typeof error === 'string') {
            primaryMessage = error;
        } else if (error && typeof error.message === 'string') {
            primaryMessage = error.message;
        } else if (error && error.error && typeof error.error.message === 'string') {
            // Handles cases where the error is { error: { message: '...' } }
            primaryMessage = error.error.message;
        }

        // Step 2: Check if the primary message is a JSON string and try to parse a deeper message from it.
        let finalMessage = primaryMessage;
        if (primaryMessage.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(primaryMessage);
                if (parsed.error && typeof parsed.error.message === 'string') {
                    // This will extract the message from '{"error":{"message":"..."}}'
                    finalMessage = parsed.error.message;
                }
            } catch (e) {
                // It's not valid JSON, so we'll stick with the original primaryMessage.
            }
        }
        
        // Step 3: Use the extracted final message to create a user-friendly response.
        if (finalMessage) {
            const lowerCaseFinalMessage = finalMessage.toLowerCase();
            
            if (lowerCaseFinalMessage.startsWith("sorry, i can't access the file")) {
                 // This is our custom error from the fetch logic for download failures.
                 friendlyErrorMessage = finalMessage;
            } else if (lowerCaseFinalMessage.includes('quota') || lowerCaseFinalMessage.includes('resource_exhausted')) {
                friendlyErrorMessage = `You have exceeded your API quota. Please check your plan and billing details. For more information, visit: [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)`;
            } else if (lowerCaseFinalMessage.includes('api key not valid')) {
                friendlyErrorMessage = "Your API key is not valid. Please check your configuration.";
            } else {
                // For any other API error, display the message we extracted.
                friendlyErrorMessage = finalMessage;
            }
        } else {
            // Step 4: Fallback for completely unknown error structures.
            try {
                friendlyErrorMessage = JSON.stringify(error);
            } catch {
                friendlyErrorMessage = 'An un-stringifiable error occurred.';
            }
        }
        
        updateLastMessage({
            content: `Sorry, I couldn't generate the video.\n**Reason:** ${friendlyErrorMessage}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'error'
        });
    }
};

const searchForImage = async (promptText: string, originalUserText?: string) => {
    if (!promptText.trim() || isGenerating || !isApiConfigured || !aiRef.current) return;
    updateLastMessage({ content: 'Searching the web for the best image...' });

    try {
        const queryPrompt = `You are a specialist AI assistant for finding the best single celebrity photograph based on a user's query.

User's query: "${promptText}"

**Purpose:**
- Your goal is to return ONE best photo the user can open immediately.
- Prefer a direct image URL. If none pass your internal checks, provide the best file-page sources instead. Never show generic “technical restriction” messages.

**Language:**
- Detect the user’s language from their query. If Khmer is used, use Khmer labels in your output. Otherwise use English.

**Hard Rules:**
1.  **Never use:** google.com, gstatic.com, pinterest.com/pinimg.com, gettyimages.com, shutterstock.com, alamy.com, adobe.com/stock, imdb.com, x.com/t.co, facebook/instagram CDNs — unless the URL is a raw image that passes your internal checks.
2.  **Prefer domains with reliable direct files:** upload.wikimedia.org, commons.wikimedia.org, static.wikia.nocookie.net, or official press kits/studios.
3.  **No fabrications:** Do not invent URLs, titles, or licenses. If unsure, mark license as “unknown”.

**Direct-Link Checks (“Hotlink Test”):**
- You must only provide links that are HTTPS, resolve to a 200 status with an image Content-Type, require no special auth/cookies, are not redirect chains, and end with a valid image extension (.jpg, .jpeg, .png, .webp, .gif).

**Selection Criteria:**
- Score candidates and pick the highest based on: Domain Trust, Resolution, Face Clarity, Recency, and License Clarity, while penalizing watermarks.
- Tie-breakers: 1) Clear face, 2) Press/premiere photo, 3) Newer year, 4) Larger resolution, 5) Cleaner background.
- Prefer portrait orientation, shoulder-up press photos.

**Output Format (exactly this shape; no extra prose):**
Respond ONLY with the following structure. Provide both 'best_image' (with URL or "none") AND 'best_sources' to ensure a fallback is always available for the client application.

language: <"khmer" or "english">
best_image:
URL: <direct .jpg/.jpeg/.png/.webp link OR the word "none">
title: <short descriptive title>
source: <file page or official source URL>
license: <e.g., CC BY-SA 4.0 / unknown>
why: <1 short reason: clear, recent, recognizable>
best_sources:
- <best file page 1>
- <best file page 2>
`;

        const response = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash",
            contents: queryPrompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const responseText = response.text;
        const parsedData = parseCelebrityImageResponse(responseText);
        const { language, bestImage, bestSources } = parsedData;

        const createFallbackContent = () => {
            if (!bestSources || bestSources.length === 0) {
                return language === 'khmer'
                    ? "ខ្ញុំរកមិនឃើញរូបភាពដែលសមស្របទេ។ សូមព្យាយាមម្តងទៀត។"
                    : "I couldn't find any suitable images for that query. Please try being more specific.";
            }

            const labels = {
                title: language === 'khmer' ? 'ប្រភពល្អបំផុត:' : 'Best Sources:',
                note: language === 'khmer'
                    ? "ចំណាំ: ការបង្ហាញរូបភាពដោយផ្ទាល់អាចត្រូវបានរារាំង ប៉ុន្តែទំព័រទាំងនេះរួមបញ្ចូលឯកសារដើមដែលអ្នកអាចមើល ឬទាញយកបាន។"
                    : "Note: Direct display may be blocked, but these pages include the original files you can view or download."
            };

            const sourcesList = bestSources.map(source => {
                try {
                    return `- [${new URL(source).hostname}](${source})`;
                } catch {
                    return `- ${source}`; // Fallback for invalid URLs
                }
            }).join('\n');
            
            return `**${labels.title}**\n${sourcesList}\n\n*${labels.note}*`;
        };

        if (bestImage.url) {
            updateLastMessage({ content: 'Found a potential image. Verifying...' });
            const sanitizedUrl = sanitizeImageUrl(bestImage.url);
            
            if (!sanitizedUrl) {
                console.warn(`[Image Search] URL rejected by sanitizer: ${bestImage.url}`);
                updateLastMessage({
                    content: createFallbackContent(),
                    status: 'complete',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
                return;
            }

            try {
                await verifyImageUrl(sanitizedUrl);
                
                const details = [
                    bestImage.title ? (language === 'khmer' ? `**ចំណងជើង:** ${bestImage.title}` : `**Title:** ${bestImage.title}`) : null,
                    bestImage.source ? (language === 'khmer' ? `**ប្រភព:** [${new URL(bestImage.source).hostname}](${bestImage.source})` : `**Source:** [${new URL(bestImage.source).hostname}](${bestImage.source})`) : null,
                    bestImage.license ? (language === 'khmer' ? `**ការអនុញ្ញាត:** ${bestImage.license}` : `**License:** ${bestImage.license}`) : null,
                    bestImage.why ? (language === 'khmer' ? `**មូលហេតុ:** ${bestImage.why}` : `**Why:** ${bestImage.why}`) : null,
                ].filter(Boolean).join('\n');

                updateLastMessage({
                    content: `Here is the best image I found for: "${originalUserText || promptText}"\n\n${details}`,
                    imageSearchResults: [{ url: sanitizedUrl, alt: bestImage.title || 'Celebrity Image' }],
                    status: 'complete',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

            } catch (error) {
                console.warn(`[Image Search] Verification failed for ${sanitizedUrl}:`, error);
                updateLastMessage({
                    content: createFallbackContent(),
                    status: 'complete',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        } else {
            updateLastMessage({
                content: createFallbackContent(),
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }

    } catch (error) {
        console.error("Image search API call failed:", error);
        updateLastMessage({
            content: "Sorry, an error occurred while searching for images. Please try again.",
            status: 'error',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }
};

/**
 * Extracts the YouTube video ID from various URL formats.
 * @param url The YouTube URL string.
 * @returns The 11-character video ID, or null if not found.
 */
const parseYouTubeVideoId = (url: string | undefined): string | null => {
    if (!url) return null;
    let videoId: string | null = null;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            // Handles youtube.com/watch?v=...
            videoId = urlObj.searchParams.get('v');
        } else if (urlObj.hostname === 'youtu.be') {
            // Handles youtu.be/...
            videoId = urlObj.pathname.substring(1).split('?')[0]; // Ensure no params are included
        }
    } catch (e) {
        console.warn("Could not parse URL with 'new URL()', attempting regex on string:", url);
    }

    // Fallback for cases where URL parsing fails or if the URL is not standard,
    // but contains a video ID.
    if (!videoId) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        if (match) {
            videoId = match[1];
        }
    }

    // Final check for a raw ID string that might have been returned
    if (!videoId && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }
    
    return videoId;
};


const searchForVideo = async (promptText: string, originalUserText?: string) => {
    if (!promptText.trim() || isGenerating || !isApiConfigured || !aiRef.current) return;
    updateLastMessage({ content: 'Searching the web for the best video...' });

    try {
        const queryPrompt = `You are a YouTube video search assistant. Find the single, most relevant, publicly playable YouTube video for the query: "${promptText}". Respond ONLY with a valid JSON object with the schema: {"video": {"url": "...", "title": "..."}}. The URL MUST be a standard YouTube watch URL (e.g., "https://www.youtube.com/watch?v=..."). Do not add any commentary.`;

        const response = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash",
            contents: queryPrompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const jsonText = cleanJsonString(response.text);
        
        let result;
        try {
            result = JSON.parse(jsonText);
        } catch (e) {
            console.warn("Video search response was not valid JSON, displaying as text.", e);
            updateLastMessage({
                content: jsonText,
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }

        const videoUrl = result.video?.url;
        const videoId = parseYouTubeVideoId(videoUrl);

        if (!videoId) {
            updateLastMessage({
                content: "Sorry, I couldn't find any videos for that query. My web search might have been inconclusive. Please try a different search term.",
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }

        const videoEmbeds = [{ 
            service: 'youtube' as const, 
            videoId: videoId, 
            title: result.video.title 
        }];

        updateLastMessage({
            content: `Here is the video I found for: "${originalUserText || promptText}"`,
            videoEmbeds: videoEmbeds,
            status: 'complete',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

    } catch (error) {
        console.error("Video search API call failed:", error);
        updateLastMessage({
            content: "Sorry, an error occurred while searching for videos. Please try again.",
            status: 'error',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }
};


const searchForAudio = async (promptText: string, originalUserText?: string) => {
    if (!promptText.trim() || isGenerating || !isApiConfigured || !aiRef.current) return;
    updateLastMessage({ content: 'កំពុងស្វែងរកសំឡេង...' }); // 'Searching for audio...' in Khmer

    try {
        // This prompt is designed to find a single, playable music track on YouTube.
        const queryPrompt = `You are a music search assistant. Your task is to find the single, most relevant, and publicly playable YouTube video URL for the music or audio query: "${promptText}". You must prioritize official artist channels, official audio releases, or high-quality lyric videos. Avoid covers, remixes, or unrelated content unless explicitly requested. Your response MUST BE a valid JSON object with the following schema: {"audioTrack": {"url": "...", "title": "..."}}. The URL MUST be a standard YouTube watch URL (e.g., "https://www.youtube.com/watch?v=..."). Do not add any commentary or any text outside of the JSON object.`;

        const response = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash",
            contents: queryPrompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const jsonText = cleanJsonString(response.text);
        
        let result;
        try {
            result = JSON.parse(jsonText);
        } catch (e) {
            console.warn("Audio search response was not valid JSON.", e);
            updateLastMessage({
                content: "សូមអភ័យទោស ខ្ញុំរកមិនឃើញបទភ្លេងដែលត្រូវគ្នាទេ។ សូមព្យាយាមម្តងទៀតដោយប្រើពាក្យគន្លឹះផ្សេង។",
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }

        const videoUrl = result.audioTrack?.url;
        const videoId = parseYouTubeVideoId(videoUrl);

        if (!videoId) {
            updateLastMessage({
                content: "សូមអភ័យទោស ខ្ញុំរកមិនឃើញសំឡេងសម្រាប់សំណួរនោះទេ។ ការស្វែងរកលើเว็บរបស់ខ្ញុំប្រហែលជាមិនច្បាស់លាស់។ សូមព្យាយាមម្តងទៀតដោយប្រើពាក្យគន្លឹះផ្សេង។",
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }

        const videoEmbeds = [{ 
            service: 'youtube' as const, 
            videoId: videoId, 
            title: result.audioTrack.title 
        }];

        updateLastMessage({
            content: "នេះជាសំឡេងដែលអ្នកបានស្នើសុំ។", // "Here is the audio you requested."
            videoEmbeds: videoEmbeds,
            sources: undefined, // Explicitly remove sources
            status: 'complete',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

    } catch (error) {
        console.error("Audio search failed:", error);
        updateLastMessage({
            content: "សូមអភ័យទោស មានបញ្ហាកើតឡើងពេលកំពុងស្វែងរកសំឡេង។ សូមព្យាយាមម្តងទៀត។",
            status: 'error',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }
};

const searchYouTubeMusic = async (promptText: string, originalUserText?: string) => {
    if (!promptText.trim() || isGenerating || !isApiConfigured || !aiRef.current) return;
    updateLastMessage({ content: 'កំពុងស្វែងរកនៅលើ YouTube Music...' }); // "Searching YouTube Music..." in Khmer

    try {
        const queryPrompt = `You are a YouTube Music search assistant. Find the single, most relevant, and publicly playable YouTube video URL for the music query: "${promptText}". Prioritize official artist channels, official audio, or lyric videos over covers or unrelated content. Respond ONLY with a valid JSON object with the schema: {"musicVideo": {"url": "...", "title": "..."}}. The URL MUST be a standard YouTube watch URL (e.g., "https://www.youtube.com/watch?v=..."). Do not add any commentary.`;

        const response = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash",
            contents: queryPrompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const jsonText = cleanJsonString(response.text);
        
        let result;
        try {
            result = JSON.parse(jsonText);
        } catch (e) {
            console.warn("YouTube Music search response was not valid JSON.", e);
            updateLastMessage({
                content: "សូមអភ័យទោស ខ្ញុំរកមិនឃើញបទភ្លេងដែលត្រូវគ្នាទេ។ សូមព្យាយាមម្តងទៀតដោយប្រើពាក្យគន្លឹះផ្សេង។",
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }

        const videoUrl = result.musicVideo?.url;
        const videoId = parseYouTubeVideoId(videoUrl);
        
        if (!videoId) {
            updateLastMessage({
                content: "សូមអភ័យទោស ខ្ញុំរកមិនឃើញបទចម្រៀងនោះនៅលើ YouTube Music ទេ។ សូមព្យាយាមម្តងទៀតដោយប្រើពាក្យគន្លឹះផ្សេង។",
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }

        const videoEmbeds = [{ 
            service: 'youtube' as const, 
            videoId: videoId, 
            title: result.musicVideo.title 
        }];

        updateLastMessage({
            content: "នេះជាបទចម្រៀងដែលអ្នកបានស្នើសុំ។", // "Here is the track you requested."
            videoEmbeds: videoEmbeds,
            sources: undefined, // Hide sources
            status: 'complete',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

    } catch (error) {
        console.error("YouTube Music search API call failed:", error);
        updateLastMessage({
            content: "សូមអភ័យទោស មានបញ្ហាកើតឡើងពេលកំពុងស្វែងរកនៅលើ YouTube Music។ សូមព្យាយាមម្តងទៀត។",
            status: 'error',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }
};

  const continueChat = async (text: string, attachmentData: (typeof attachment) | null, fromVoiceMode = false) => {
    if (!isApiConfigured) return; // The isGenerating check is handled by the caller functions
    
    const userPrompt = text;
    const userAttachment = attachmentData;

    try {
        if (!aiRef.current) throw new Error("AI not initialized.");

        // The history is built from the `messages` state. Due to the async nature of setState,
        // the `messages` variable here will be from the render *before* the new user message was added in `handleSend`.
        // This is correct, as we build the current prompt separately.
        const history = messages.filter(m => m.status !== 'thinking').map(msg => {
            const parts: any[] = [];
            if (msg.attachmentPreview?.type === 'image' && msg.attachmentPreview.data) {
                const base64Data = msg.attachmentPreview.data.split(',')[1];
                const mimeType = msg.attachmentPreview.data.match(/data:(.*);base64,/)?.[1] || 'image/png';
                parts.push({ inlineData: { mimeType, data: base64Data } });
            }
            if (msg.content) {
                parts.push({ text: msg.content });
            }
            return { role: msg.type === 'user' ? 'user' : 'model', parts };
        });

        const currentUserParts: any[] = [];
        let promptText = userPrompt;

        if (userAttachment) {
            if (userAttachment.type === 'image') {
                currentUserParts.push({
                    inlineData: { mimeType: userAttachment.file.type, data: userAttachment.base64 }
                });
            } else if (userAttachment.type === 'pdf') {
                try {
                    const pdfResult = await extractTextFromPdf(userAttachment.file);
                    
                    if (pdfResult.type === 'text') {
                        promptText = `You are an AI assistant analyzing a PDF. The user uploaded "${userAttachment.file.name}". Your task is to answer the user's query based ONLY on the text extracted from this PDF. Do not use external knowledge or web search. If the answer cannot be found in the provided text, you must state that explicitly.\n\n--- PDF TEXT START ---\n${pdfResult.content}\n--- PDF TEXT END ---\n\nUser's question: "${userPrompt || 'Please provide a concise summary of the document.'}"`;
                    } else if (pdfResult.type === 'images') {
                        currentUserParts.push(...(pdfResult.content as any[]));
                        
                        const ocrNote = pdfResult.totalPages > pdfResult.processedPages 
                            ? ` (Note: To ensure performance, only the first ${pdfResult.processedPages} of ${pdfResult.totalPages} total pages have been provided for analysis).` 
                            : '';

                        const userTask = userPrompt.trim()
                            ? `After reading the text, answer the user's question based on the content you've extracted: "${userPrompt}"`
                            : `After reading the text, provide a concise summary of the document's content.`;

                        promptText = `You have been given ${pdfResult.processedPages} page(s) as images from the PDF document "${userAttachment.file.name}". Direct text extraction failed, likely indicating a scanned or image-based document.${ocrNote}\n\nYour primary task is to perform Optical Character Recognition (OCR) on these images to read the text. ${userTask}\n\nIf the images are unreadable or contain no text, state that you were unable to process the document.`;
                    }
                } catch (pdfError: any) {
                    console.error("PDF processing failed:", pdfError);
                    
                    let failureReason = "An unknown error occurred while processing the PDF.";

                    if (pdfError && pdfError.message) {
                        const msg = pdfError.message.toLowerCase();
                        if (msg.includes("could not extract text or render")) {
                            failureReason = "I couldn't find any readable text or render any pages from this PDF. It might be corrupted or in an unsupported format.";
                        } else if (msg.includes('worker')) {
                            failureReason = "The PDF processing component (worker) failed to load. This is usually a temporary network issue. Please try uploading the file again.";
                        } else if (msg.includes('invalid') || msg.includes('malformed')) {
                             failureReason = "The provided file appears to be an invalid or malformed PDF. Please try a different file.";
                        } else {
                            failureReason = `An unexpected issue occurred: ${pdfError.message}`;
                        }
                    }

                    const errorMessage: Message = { type: 'ai', content: `Sorry, I couldn't process the PDF file "${userAttachment.file.name}".\n**Reason:** ${failureReason}`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: 'error' };
                    updateLastMessage(errorMessage);
                    return;
                }
            } else if (userAttachment.type === 'audio') {
                console.debug('[API Call] Sending audio to Gemini:', { name: userAttachment.file.name, type: userAttachment.file.type });
                currentUserParts.push({
                    inlineData: { mimeType: userAttachment.file.type, data: userAttachment.base64 }
                });
                promptText = userPrompt.trim() ? `First, please transcribe the attached audio file. Then, using that transcription, please follow this instruction: "${userPrompt}"` : "Please transcribe the attached audio file.";
            }
        } 
        
        if (promptText.trim()) {
            currentUserParts.push({ text: promptText });
        }
        
        if (currentUserParts.length === 0) {
             setMessages(prev => prev.slice(0, -1)); // Remove thinking message
             return;
        }
        
        let systemInstruction = fromVoiceMode ? VOICE_SYSTEM_INSTRUCTION : BASE_SYSTEM_INSTRUCTION;

        const aiKnowledge = await getAIKnowledgeFromDB();
        if (aiKnowledge && aiKnowledge.facts.length > 0) {
            const knowledgeContext = `\n\n---\nINTERNAL KNOWLEDGE BASE (Verified Facts - Use these to inform your answers):\n${aiKnowledge.facts.map(f => `- ${f}`).join('\n')}\n---`;
            systemInstruction += knowledgeContext;
        }
        
        if (user && userMemory) {
            const memoryContext = `\n\n---\nUSER-SPECIFIC MEMORY (Context for this user only):\nUser Preferences: ${userMemory.preferences.join(', ') || 'None noted.'}\nKey Facts: ${userMemory.facts.join(', ') || 'None noted.'}\nConversation History Summary:\n${userMemory.summary || 'No summary available.'}\n---`;
            systemInstruction += memoryContext;
        }

        const contentsForApi = [...history, { role: 'user', parts: currentUserParts }];
        
        const stream = await aiRef.current.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: contentsForApi,
            config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
                ...(!isThinkingEnabled && { thinkingConfig: { thinkingBudget: 0 } }),
            },
        });

        let fullResponse = '';
        let sources: any[] = [];
        const responseTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        for await (const chunk of stream) {
            fullResponse += chunk.text;
            if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                sources = chunk.candidates[0].groundingMetadata.groundingChunks;
            }
            
            if(!fromVoiceMode) { // Don't stream to text chat if in voice mode
                updateLastMessage({
                    content: fullResponse,
                    sources: sources,
                    ...(messages[messages.length - 1]?.timestamp === '' && { timestamp: responseTimestamp }),
                });
            }
        }
        
        const finalContent = fullResponse.trim() ? fullResponse : "I'm not sure how to respond to that.";

        updateLastMessage({
            status: 'complete',
            content: finalContent,
            sources: sources,
        });
        
        if (fromVoiceMode) {
            speakResponse(finalContent);
        }

        if (finalContent && sources && sources.length > 0) {
            // Don't wait for this, let it run in the background.
            updateAIKnowledge(userPrompt, finalContent);
        }

        if (user && fullResponse.trim()) {
            await updateMemory(userPrompt, finalContent);
        }

    } catch (error) {
        console.error("Gemini API call failed", error);
        console.error("Full error object:", JSON.stringify(error, null, 2));

        let errorMessageContent = 'An error occurred. Please try again.';
        if (error && typeof error === 'object' && 'message' in error) {
            const message = String(error.message).toLowerCase();
            if (message.includes('invalid audio format') || message.includes('decode audio')) {
                errorMessageContent = 'The API could not process the uploaded audio file. It might be corrupted or in an unsupported format even after conversion.';
            } else if (message.includes('permission denied') || message.includes('api key')) {
                errorMessageContent = 'API Key is invalid or missing permissions.';
            } else {
                errorMessageContent = `An error occurred: ${String(error.message)}`;
            }
        }

        const errorMessage: Message = { type: 'ai', content: errorMessageContent, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: 'error' };
        updateLastMessage(errorMessage);
        if (fromVoiceMode) {
            speakResponse(errorMessageContent);
        }
    }
  };
  
  const handleFileEdit = async (command: string, fileToEdit: NonNullable<typeof attachment>) => {
    if (!command.trim() || !isApiConfigured) return;

    // The thinking message is already added by handleSend. We just update it.
    updateLastMessage({ content: 'Analyzing edit request...' });
    
    try {
        if (!aiRef.current) throw new Error("AI not initialized.");
        
        if (fileToEdit.type === 'image') {
            await processImageEdit(command, fileToEdit);
        } else if (fileToEdit.type === 'pdf') {
            await processPdfEdit(command, fileToEdit);
        } else {
            throw new Error("Editing for this file type is not supported.");
        }
    } catch (error) {
        console.error("File edit failed:", error);
        const errorMessageContent = `Sorry, I couldn't perform that edit. ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
        updateLastMessage({
            content: errorMessageContent,
            status: 'error',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }
  };

    const isFollowUpImageEdit = async (command: string, activeImage: Message): Promise<boolean> => {
        if (!aiRef.current) return false;
        
        // Find the user message that prompted the active image for better context.
        const imageIndex = messages.findIndex(m => m === activeImage);
        const userPromptMessage = messages[imageIndex - 1];
        const originalContext = userPromptMessage?.content ? `The user originally asked to create an image based on: "${userPromptMessage.content}"` : "The user previously generated an image.";

        const schema = {
            type: Type.OBJECT,
            properties: {
                isEdit: {
                    type: Type.BOOLEAN,
                    description: "True if the user's new command is a request to modify or edit the previous image, otherwise false."
                }
            },
            required: ["isEdit"]
        };

        const systemInstruction = `You are an intent detection system. Your task is to determine if a user's command is a follow-up edit request for a previously generated image. ${originalContext} Now, the user's new command is: "${command}". Based on this, decide if the new command is an edit request for that specific image. Consider phrases like "make it bigger", "change the color", "add a tree", or "what about that picture?". Respond ONLY with a JSON object.`;

        try {
            const response = await aiRef.current.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: "Is the user's new command an edit request for the previous image?",
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });
            const jsonText = cleanJsonString(response.text);
            const result = JSON.parse(jsonText);
            console.log(`[Follow-up Check] Command: "${command}". Is it an edit? -> ${result.isEdit}`);
            return result.isEdit === true;
        } catch (error) {
            console.error("Follow-up edit check failed:", error);
            return false; // Fail safely, will proceed as a normal chat.
        }
    };


const processNaturalLanguageCommand = async (text: string) => {
    if (!text.trim() || !isApiConfigured || !aiRef.current) return;
    
    const setLastUserMessagePromptType = (promptType: Message['promptType']) => {
        setMessages(prev => {
            const newMessages = [...prev];
            const userMessageIndex = newMessages.length - 2;
            if (userMessageIndex >= 0 && newMessages[userMessageIndex].type === 'user') {
                const updatedMessage = { ...newMessages[userMessageIndex], promptType };
                newMessages[userMessageIndex] = updatedMessage;
            }
            return newMessages;
        });
    };

    // Check for follow-up image edit before general intent classification
    if (activeImageTask && activeImageTask.attachmentPreview?.type === 'image') {
        if (await isFollowUpImageEdit(text, activeImageTask)) {
            console.log("[Intent] Recognized as follow-up image edit.");
            const imagePreview = activeImageTask.attachmentPreview;
            const base64Data = imagePreview.data.split(',')[1];
            const mimeType = imagePreview.data.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';
            
            const mockAttachment = {
                file: new File([], imagePreview.name, { type: mimeType }),
                base64: base64Data,
                type: 'image' as const
            };
            handleFileEdit(text, mockAttachment);
            return; // Short-circuit to avoid re-classification
        }
    }

    const intentSchema = {
        type: Type.OBJECT,
        properties: {
            intent: {
                type: Type.STRING,
                "enum": ["image_generation", "video_generation", "image_search", "video_search", "audio_search", "youtube_music_search", "chat"],
                description: "Classify the user's intent. Use 'youtube_music_search' for requests to play or find specific songs/audio on YouTube Music. Use 'image_generation' or 'video_generation' for creation requests. Use 'image_search', 'video_search', or 'audio_search' for finding existing media online. For everything else, use 'chat'."
            },
            prompt: {
                type: Type.STRING,
                description: "The core subject for media generation or search. For 'chat', this is the user's original, unmodified text."
            }
        },
        required: ["intent", "prompt"]
    };
    
    const systemInstruction = `You are an intent classification system. Your task is to analyze the user's prompt and determine if they want to generate new media, search for existing media online, or simply have a conversation.

- **Music Search**: If the request is to **play**, **listen to**, **find a song/track**, or is clearly a music request for YouTube Music (e.g., "play Hotel California by The Eagles"), classify as 'youtube_music_search'.
- **Creation**: If the request is to **create**, **make**, **draw**, or **generate** new, original media (e.g., "create a picture of...", "make a video about..."), classify the intent as 'image_generation' or 'video_generation'.
- **Search**: If the request is to **find**, **search for**, **show me**, or **look up** existing media (e.g., "find a picture of...", "show me a video of... on YouTube", "find the song..."), classify the intent as 'image_search', 'video_search', or 'audio_search'.
- **Chat**: For all other cases, including questions, statements, or greetings, classify the intent as 'chat'.

Extract the essential creative/search part as the prompt. For 'chat', the prompt must be the user's original, verbatim text. Respond ONLY with a JSON object.`;

    try {
        const MAX_RETRIES = 3;
        let lastError: any;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await aiRef.current.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: text,
                    config: {
                        systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: intentSchema,
                        thinkingConfig: { thinkingBudget: 0 } // Ensure this is a fast call
                    }
                });

                const jsonText = cleanJsonString(response.text);
                const result = JSON.parse(jsonText);

                switch (result.intent) {
                    case "image_generation":
                        setLastUserMessagePromptType('image');
                        console.log(`[Intent] Recognized as image generation. Prompt: "${result.prompt}"`);
                        setActiveImageTask(null); // Clear previous image context when starting a new one.
                        generateImage(result.prompt, text);
                        break;
                    case "video_generation":
                        setLastUserMessagePromptType('video');
                        console.log(`[Intent] Recognized as video generation. Prompt: "${result.prompt}"`);
                        generateVideo(result.prompt, text);
                        break;
                    case "image_search":
                        console.log(`[Intent] Recognized as image search. Prompt: "${result.prompt}"`);
                        searchForImage(result.prompt, text);
                        break;
                    case "video_search":
                        setLastUserMessagePromptType('video');
                        console.log(`[Intent] Recognized as video search. Prompt: "${result.prompt}"`);
                        searchForVideo(result.prompt, text);
                        break;
                    case "audio_search":
                        setLastUserMessagePromptType('music');
                        console.log(`[Intent] Recognized as audio search. Prompt: "${result.prompt}"`);
                        searchForAudio(result.prompt, text);
                        break;
                    case "youtube_music_search":
                        setLastUserMessagePromptType('music');
                        console.log(`[Intent] Recognized as YouTube Music search. Prompt: "${result.prompt}"`);
                        searchYouTubeMusic(result.prompt, text);
                        break;
                    case "chat":
                    default:
                        console.log(`[Intent] Recognized as chat.`);
                        continueChat(text, null);
                        break;
                }
                return; // Exit on success

            } catch (error) {
                lastError = error;
                const errorMessage = String(error).toLowerCase();
                const isRetriable = errorMessage.includes('500') || errorMessage.includes('xhr error');
                
                if (isRetriable && attempt < MAX_RETRIES) {
                    console.warn(`[Intent Classification] Retriable error on attempt ${attempt}/${MAX_RETRIES}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 750 * attempt)); // Simple exponential backoff
                } else {
                    // Not retriable or out of attempts, throw to outer catch
                    throw lastError;
                }
            }
        }
    } catch (error) {
        console.error("Intent classification failed:", error);
        // Fallback to standard chat if classification fails
        continueChat(text, null);
    }
};

  const handleSend = () => {
    if (!canSend) return;

    const promptText = inputText;
    const attachmentData = attachment;

    const userMessage: Message = {
        type: 'user',
        content: promptText,
        attachmentPreview: attachmentData ? { 
            type: attachmentData.type, 
            data: `data:${attachmentData.file.type};base64,${attachmentData.base64}`, 
            name: attachmentData.file.name 
        } : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'complete'
    };

    addMessage(userMessage);

    // Centralized: Create the "thinking" message immediately after the user's message.
    const thinkingMessage: Message = { type: 'ai', content: '', timestamp: '', status: 'thinking' };
    addMessage(thinkingMessage);

    setInputText('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowSendRipple(true);
    setTimeout(() => setShowSendRipple(false), 600);

    // Route to the correct asynchronous processing function.
    if (attachmentData && promptText.trim()) {
        if (attachmentData.type === 'image' || attachmentData.type === 'pdf') {
            // This is a file edit command.
            handleFileEdit(promptText, attachmentData);
        } else {
            // This is a file with a prompt (e.g., audio).
            continueChat(promptText, attachmentData);
        }
    } else if (promptText.trim() && !attachmentData) {
        // This is a text-only message, which could be chat, image, or video gen.
        processNaturalLanguageCommand(promptText);
    } else if (attachmentData && !promptText.trim()) {
        // This is an attachment-only send.
        continueChat(promptText, attachmentData);
    }
  };

  const handleQuickReply = (text: string) => {
    // Quick replies are always chat intents
    if (!isGenerating && text.trim()) {
        const userMessage: Message = {
            type: 'user',
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'complete'
        };
        addMessage(userMessage);
        
        // Centralized: Add the thinking message here.
        const thinkingMessage: Message = { type: 'ai', content: '', timestamp: '', status: 'thinking' };
        addMessage(thinkingMessage);

        continueChat(text, null);
    }
  };
  
  // --- START: New File Editing Logic ---

    const processImageEdit = async (command: string, imageFile: NonNullable<typeof attachment>) => {
        const imageEditSchema = {
            type: Type.OBJECT,
            properties: {
                tool: { type: Type.STRING, "enum": ["CROP", "ROTATE", "FILTER", "ADJUST_COLOR", "FLIP", "REIMAGINE", "UNSUPPORTED"] },
                params: {
                    type: Type.OBJECT,
                    properties: {
                        angle: { type: Type.NUMBER, description: "Rotation angle (90, 180, 270)." },
                        filterType: { type: Type.STRING, "enum": ["grayscale", "sepia", "invert"], description: "e.g., black and white is 'grayscale'." },
                        cropShape: { type: Type.STRING, "enum": ["square", "16:9", "4:3"], description: "Aspect ratio for cropping." },
                        brightness: { type: Type.NUMBER, description: "Brightness adjustment in percentage (e.g., 120 for +20%)." },
                        contrast: { type: Type.NUMBER, description: "Contrast adjustment in percentage (e.g., 150 for +50%)." },
                        saturation: { type: Type.NUMBER, description: "Saturation adjustment in percentage (e.g., 200 for +100%)." },
                        flipDirection: { type: Type.STRING, "enum": ["horizontal", "vertical"] }
                    }
                }
            }
        };

        const response = await aiRef.current!.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `User request: "${command}"`,
            config: {
                systemInstruction: "You are a tool-use classifier for image editing. Analyze the user's request. For complex edits like removing objects, changing backgrounds, or significant artistic changes, use the 'REIMAGINE' tool. For simple adjustments, use the appropriate tool (CROP, ROTATE, FILTER, ADJUST_COLOR, FLIP). Respond ONLY with a JSON object matching the schema.",
                responseMimeType: "application/json",
                responseSchema: imageEditSchema
            }
        });
        
        const jsonText = cleanJsonString(response.text);
        const result = JSON.parse(jsonText);
        
        if (result.tool === "REIMAGINE") {
            await reimagineImage(command, imageFile);
            return;
        }

        if (result.tool === "UNSUPPORTED") {
            updateLastMessage({
                content: "I can perform edits like cropping, rotating, applying filters, and adjusting colors. For more complex changes like removing an object, I can try to 're-imagine' a new image for you based on your request. Would you like me to try that?",
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }

        updateLastMessage({ content: 'Applying edit...' });

        const editedImageDataUrl = await applyCanvasEdit(imageFile, result.tool, result.params);
        const filename = `edited-${imageFile.file.name}`;

        const finalMessage: Message = {
            type: 'ai',
            content: `Here is the edited image as requested.`,
            attachmentPreview: { type: 'image', data: editedImageDataUrl, name: filename },
            downloadableAttachment: { url: editedImageDataUrl, filename: filename, label: 'Download Edited Image' },
            status: 'complete',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateLastMessage(finalMessage);
        setActiveImageTask(finalMessage);
    };

    const reimagineImage = async (command: string, imageFile: NonNullable<typeof attachment>) => {
      updateLastMessage({ content: 'Analyzing original image...' });

      // 1. Describe the original image
      const describeResponse = await aiRef.current!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{
          inlineData: { mimeType: imageFile.file.type, data: imageFile.base64 }
        }, {
          text: "Describe this image in detail for an image generation prompt. Be objective and focus on the subject, style, and composition."
        }]},
      });
      const description = describeResponse.text;

      updateLastMessage({ content: 'Re-imagining a new version...' });
      
      // 2. Generate a new image based on description and command
      const refinementSystemInstruction = `You are an expert at creating vivid, detailed, and artistic prompts for an AI image generation model. You will be given a description of an original image and a user's modification request. Combine these into a single, new, rich prompt. The new prompt should describe the final scene as if it were being created from scratch. Respond ONLY with the generated English prompt string.`;

      const refinementResponse = await aiRef.current!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Original image description: "${description}"\n\nUser's edit request: "${command}"`,
        config: { systemInstruction: refinementSystemInstruction },
      });
      const refinedPrompt = refinementResponse.text.trim();
      
      console.log("Re-imagined prompt:", refinedPrompt);
      const imageGenResponse = await aiRef.current!.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: refinedPrompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
      });
      
      if (!imageGenResponse.generatedImages || imageGenResponse.generatedImages.length === 0) {
        throw new Error("The prompt was likely rejected by the safety filter. No images were generated.");
      }
      
      const base64ImageBytes: string = imageGenResponse.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      const filename = `reimagined-${imageFile.file.name}`;
      
      const finalMessage: Message = {
          type: 'ai',
          content: `I've created a new version of your image based on the request: "${command}"`,
          attachmentPreview: { type: 'image', data: imageUrl, name: filename },
          downloadableAttachment: { url: imageUrl, filename: filename, label: 'Download Re-imagined Image' },
          status: 'complete',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      updateLastMessage(finalMessage);
      setActiveImageTask(finalMessage);
    };

    const applyCanvasEdit = (
      imageFile: NonNullable<typeof attachment>, 
      tool: string, 
      params: any
    ): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('Could not get canvas context');

                let { width: w, height: h } = img;
                
                if (tool === 'ROTATE' && (params.angle === 90 || params.angle === 270)) {
                    canvas.width = h;
                    canvas.height = w;
                } else {
                    canvas.width = w;
                    canvas.height = h;
                }
                
                ctx.save();
                
                if (tool === 'FLIP') {
                    ctx.translate(params.flipDirection === 'horizontal' ? w : 0, params.flipDirection === 'vertical' ? h : 0);
                    ctx.scale(params.flipDirection === 'horizontal' ? -1 : 1, params.flipDirection === 'vertical' ? -1 : 1);
                }
                
                if (tool === 'ROTATE') {
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(params.angle * Math.PI / 180);
                    ctx.translate(-w / 2, -h / 2);
                }
                
                const filters = [];
                if (tool === 'FILTER') filters.push(`${params.filterType}(1)`);
                if (tool === 'ADJUST_COLOR') {
                  if (params.brightness) filters.push(`brightness(${params.brightness}%)`);
                  if (params.contrast) filters.push(`contrast(${params.contrast}%)`);
                  if (params.saturation) filters.push(`saturate(${params.saturation}%)`);
                }
                if (filters.length > 0) ctx.filter = filters.join(' ');

                let sx = 0, sy = 0, sWidth = w, sHeight = h;
                if (tool === 'CROP') {
                    let aspect = 1; // default square
                    if (params.cropShape === '16:9') aspect = 16 / 9;
                    if (params.cropShape === '4:3') aspect = 4 / 3;
                    
                    if (w / h > aspect) { 
                        sWidth = h * aspect;
                        sx = (w - sWidth) / 2;
                    } else {
                        sHeight = w / aspect;
                        sy = (h - sHeight) / 2;
                    }
                    canvas.width = sWidth;
                    canvas.height = sHeight;
                }
                
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                ctx.restore();
                
                resolve(canvas.toDataURL('image/jpeg', 0.95));
            };
            img.onerror = () => reject('Failed to load image for editing.');
            img.src = `data:${imageFile.file.type};base64,${imageFile.base64}`;
        });
    };
    
    const processPdfEdit = async (command: string, pdfFile: NonNullable<typeof attachment>) => {
        const pdfEditSchema = {
            type: Type.OBJECT,
            properties: {
                tool: { type: Type.STRING, "enum": ["CONVERT_TO_TEXT", "CONVERT_TO_IMAGES", "SUMMARIZE", "SPLIT", "REMOVE_PAGES", "UNSUPPORTED"] },
                params: {
                  type: Type.OBJECT,
                  properties: {
                    pages: { type: Type.STRING, description: "A string representing pages to remove, e.g., '5' or '3, 6-8'." }
                  }
                }
            }
        };
        
        const response = await aiRef.current!.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `User request: "${command}"`,
            config: {
                systemInstruction: "You are a tool-use classifier for PDF modification. Analyze the request. If asked to remove/delete pages, use REMOVE_PAGES and extract page numbers/ranges into the 'pages' param. If asked to split, use SPLIT. If asked for text/txt, use CONVERT_TO_TEXT. For images/jpeg, use CONVERT_TO_IMAGES. For a summary, use SUMMARIZE. Otherwise, use UNSUPPORTED.",
                responseMimeType: "application/json",
                responseSchema: pdfEditSchema
            }
        });

        const jsonText = cleanJsonString(response.text);
        const result = JSON.parse(jsonText);

        if (result.tool === "SUMMARIZE") {
            updateLastMessage({ content: `Understood. I will summarize the document for you.`, status: 'complete', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
            setTimeout(() => continueChat(command, pdfFile), 100);
            return;
        }

        if (result.tool === "UNSUPPORTED") {
            updateLastMessage({
                content: "I can't directly edit PDF content like text or merge files. However, I can help by splitting the PDF into separate pages, removing specific pages, or converting it to text or images.",
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            return;
        }
        
        updateLastMessage({ content: 'Processing PDF...' });
        const arrayBuffer = await pdfFile.file.arrayBuffer();

        if (result.tool === "CONVERT_TO_TEXT") {
            const { content: textContent } = await extractTextFromPdf(pdfFile.file);
            if (typeof textContent !== 'string' || !textContent.trim()) {
                throw new Error("Could not extract any text from the PDF.");
            }
            const blob = new Blob([textContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const filename = `${pdfFile.file.name.replace(/\.pdf$/i, '')}.txt`;
            updateLastMessage({
                content: "I have converted the PDF to text. You can download it below.",
                downloadableAttachment: { url, filename, label: 'Download as .txt' },
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } else if (result.tool === "CONVERT_TO_IMAGES") {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const downloads: { url: string; filename: string; label: string; }[] = [];
            const pagesToRender = Math.min(pdf.numPages, 10); // Limit to 10 pages to avoid crashing

            for (let i = 1; i <= pagesToRender; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) continue;
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvas, canvasContext: context, viewport: viewport }).promise;
                const url = canvas.toDataURL('image/jpeg', 0.9);
                const filename = `${pdfFile.file.name.replace(/\.pdf$/i, '')}-page-${i}.jpg`;
                downloads.push({ url, filename, label: `Download Page ${i}` });
            }
             if (downloads.length === 0) throw new Error("Could not render any PDF pages to images.");

            updateLastMessage({
                content: `I have converted the PDF into ${downloads.length} image(s). You can download them below.`,
                downloadableAttachment: downloads,
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } else if (result.tool === "REMOVE_PAGES") {
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pageCount = pdfDoc.getPageCount();
            
            const parsePageRanges = (rangeStr: string) => {
              const pages = new Set<number>();
              if (!rangeStr) return [];
              const parts = rangeStr.replace(/\s/g, '').split(',');
              for (const part of parts) {
                if (part.includes('-')) {
                  const [start, end] = part.split('-').map(Number);
                  for (let i = start; i <= end; i++) { if(i > 0 && i <= pageCount) pages.add(i); }
                } else {
                  const pageNum = Number(part);
                  if(pageNum > 0 && pageNum <= pageCount) pages.add(pageNum);
                }
              }
              return Array.from(pages);
            };

            const pageNumbersToRemove = parsePageRanges(result.params.pages || '');
            if(pageNumbersToRemove.length === 0) throw new Error("No valid page numbers were specified for removal.");
            
            pageNumbersToRemove.sort((a, b) => b - a); // Remove from the end to avoid index shifting.
            for (const pageNum of pageNumbersToRemove) {
                pdfDoc.removePage(pageNum - 1); // pdf-lib is 0-indexed.
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const filename = `edited-${pdfFile.file.name}`;

            updateLastMessage({
                content: `I have removed ${pageNumbersToRemove.length} page(s) as requested. You can download the new PDF below.`,
                downloadableAttachment: { url, filename, label: 'Download Modified PDF' },
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } else if (result.tool === "SPLIT") {
            const originalDoc = await PDFDocument.load(arrayBuffer);
            const pageCount = originalDoc.getPageCount();
            const downloads: { url: string; filename: string; label: string; }[] = [];

            updateLastMessage({ content: `Splitting PDF into ${pageCount} pages...` });

            for (let i = 0; i < pageCount; i++) {
                const newPdfDoc = await PDFDocument.create();
                const [copiedPage] = await newPdfDoc.copyPages(originalDoc, [i]);
                newPdfDoc.addPage(copiedPage);
                const pdfBytes = await newPdfDoc.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const filename = `${pdfFile.file.name.replace(/\.pdf$/i, '')}-page-${i + 1}.pdf`;
                downloads.push({ url, filename, label: `Download Page ${i + 1}` });
            }
             if (downloads.length === 0) throw new Error("Could not split the PDF.");

            updateLastMessage({
                content: `I have split the PDF into ${downloads.length} page(s). You can download them individually below.`,
                downloadableAttachment: downloads,
                status: 'complete',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    };
    
    // --- END: New File Editing Logic ---


  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      handleSend(); 
    }
  };

  const clearChat = () => {
    setMessages([]);
    clearMessagesFromDB();
  };

  const downloadChatHistory = () => {
    if (messages.filter(m => m.status !== 'thinking').length === 0) {
        return;
    }

    const date = new Date();
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    const filename = `anachakchat-history-${formattedDate}.md`;

    let content = `# AnaChakChat History - ${formattedDate}\n\n`;

    messages.forEach(msg => {
        if (msg.status === 'thinking') return;

        const author = msg.type === 'user' ? 'User' : 'AnaChakChat';
        let messageContent = msg.content;
        
        content += `**${author}** (${msg.timestamp})\n`;
        if (msg.attachmentPreview) {
            content += `*Attachment: ${msg.attachmentPreview.name}*\n`;
        }
        if (msg.promptType === 'image') {
            content += `*Image Prompt*\n`;
        } else if (msg.promptType === 'video') {
            content += `*Video Prompt*\n`;
        }
        content += `\n${messageContent}\n\n`;
        content += `---\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const convertAudioToWav = (file: File): Promise<File | null> => {
      return new Promise((resolve) => {
          // Use a temporary message to inform the user about the conversion.
          const thinkingMsg: Message = { type: 'ai', content: `Unsupported format (${file.type}). Converting to WAV...`, timestamp: '', status: 'thinking' };
          setMessages(prev => [...prev, thinkingMsg]);

          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const reader = new FileReader();

          reader.onload = async (e) => {
              try {
                  if (!e.target?.result) throw new Error("Failed to read file.");
                  
                  const arrayBuffer = e.target.result as ArrayBuffer;
                  console.debug('[Conversion] Decoding audio data...');
                  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                  console.debug('[Conversion] Audio decoded successfully. Channels:', audioBuffer.numberOfChannels);
                  
                  const wavBlob = audioBufferToWav(audioBuffer);
                  console.debug('[Conversion] WAV blob created. Size:', wavBlob.size);
                  
                  const newFileName = file.name.substring(0, file.name.lastIndexOf('.')) + '.wav';
                  const wavFile = new File([wavBlob], newFileName, { type: 'audio/wav' });
                  
                  // Remove the "Converting..." message before resolving
                  setMessages(prev => prev.slice(0, -1));
                  resolve(wavFile);

              } catch (error) {
                  console.error('[Conversion] Error during audio conversion:', error);
                  setMessages(prev => prev.slice(0, -1)); // Remove "Converting..." message
                  showLocalError(`Sorry, I couldn't convert the audio file "${file.name}". It might be corrupted or in a format the browser cannot read.`);
                  resolve(null);
              }
          };
          
          reader.onerror = () => {
              console.error('[Conversion] FileReader error.');
              setMessages(prev => prev.slice(0, -1)); // Remove "Converting..." message
              showLocalError('An error occurred while trying to read the audio file.');
              resolve(null);
          };

          reader.readAsArrayBuffer(file);
      });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    console.debug('[File Upload] Received file:', { name: f.name, size: f.size, type: f.type });

    let fileType: 'image' | 'pdf' | 'audio';
    let fileToProcess = f;

    if (f.type.startsWith('image/')) {
        fileType = 'image';
    } else if (f.type === 'application/pdf') {
        fileType = 'pdf';
    } else if (f.type.startsWith('audio/') || CONVERTIBLE_AUDIO_FORMATS.includes(f.type)) {
        fileType = 'audio';
        console.debug('[Validation] Validating audio file...');
        
        // 1. Size Validation
        if (f.size > MAX_AUDIO_SIZE_MB * 1024 * 1024) {
            console.error(`[Validation] Failed: File size (${(f.size / 1024 / 1024).toFixed(2)}MB) exceeds limit of ${MAX_AUDIO_SIZE_MB}MB.`);
            showLocalError(`Audio file exceeds the ${MAX_AUDIO_SIZE_MB}MB limit. To ensure successful processing, please use a smaller file or a shorter audio clip.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        // 2. Format Validation & Conversion
        if (!SUPPORTED_AUDIO_FORMATS.includes(f.type)) {
            if (CONVERTIBLE_AUDIO_FORMATS.includes(f.type)) {
                console.warn(`[Validation] Unsupported format (${f.type}). Attempting conversion to WAV.`);
                const convertedFile = await convertAudioToWav(f);
                if (convertedFile) {
                    console.debug('[Validation] Conversion successful.');
                    fileToProcess = convertedFile;
                } else {
                    console.error('[Validation] Conversion failed. Aborting file processing.');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }
            } else {
                 console.error(`[Validation] Failed: Unsupported audio format: ${f.type}`);
                 const supportedList = SUPPORTED_AUDIO_FORMATS.map(t => t.split('/')[1].toUpperCase()).join(', ');
                 showLocalError(`Unsupported audio format. Please use one of the following: ${supportedList}.`);
                 if (fileInputRef.current) fileInputRef.current.value = '';
                 return;
            }
        } else {
             console.debug('[Validation] Audio format is directly supported.');
        }

    } else {
        console.warn("[Validation] Unsupported file type:", f.type);
        showLocalError(`Unsupported file type: ${f.type}. Please upload an image, PDF, or audio file.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    const r = new FileReader();
    r.onloadend = () => {
        setAttachment({ 
            file: fileToProcess, 
            base64: (r.result as string).split(',')[1], 
            type: fileType 
        });
    };
    r.readAsDataURL(fileToProcess);
  };

  const handleStartConversation = async () => {
    // Ensure mutually exclusive state
    if (isDictating) {
        stopDictation();
        setIsDictating(false);
    }
    
    if (isVoiceMode) return; // Prevent re-entry

    console.log('[Voice Mode] User initiated start. Waking up audio systems...');

    try {
        // Directly request microphone access to trigger the prompt if needed.
        // This is a key step to "unlock" audio capabilities on mobile and check for errors.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Release mic immediately.
        console.log('[Voice Mode] Microphone permission granted.');

        // Initialize or resume the AudioContext within the user gesture.
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[Voice Mode] AudioContext created.');
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
            console.log('[Voice Mode] AudioContext resumed.');
        }

        // Now that audio is unlocked, we can safely enter voice mode.
        // The useEffect hook will now handle the rest of the setup.
        setIsVoiceMode(true);
        
    } catch (err) {
        handleMicError(err, 'voice conversation');
        setIsVoiceMode(false);
    }
  };

  const canSend = !isGenerating && isApiConfigured && (!!inputText.trim() || !!attachment);

  return (
    <div className="flex flex-col h-screen bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark font-sans relative">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        user={user} 
        onSignIn={handleSignIn} 
        onSignOut={handleSignOut}
        onClearMemory={handleClearMemory} 
      />
      <VoiceModeOverlay 
        isOpen={isVoiceMode}
        onClose={handleEndVoiceSession}
        voiceState={voiceState}
        transcript={voiceTranscript}
      />

      <header className="p-2 sm:p-3 border-b relative z-10 frost-glass">
        <div className="flex justify-between items-center max-w-5xl mx-auto">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-md hover:bg-hint-light dark:hover:bg-hint-dark text-text-light dark:text-text-dark transition-colors duration-fast" aria-label="Menu" title="Open menu">
                <Menu strokeWidth={1.5} className="w-6 h-6" />
            </button>
            <div className="relative">
              <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
                <Brain strokeWidth={1.5} className="w-6 h-6 text-white" />
              </div>
              <div className={`absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 ${isApiConfigured ? 'bg-secondary' : 'bg-red-500'} shadow`}>
                {isApiConfigured && <Globe strokeWidth={1.5} className="w-2 h-2 text-white" />}
              </div>
            </div>
            <div>
              <h1 className="text-md sm:text-lg font-bold text-text-light dark:text-text-dark">
                AnaChakChat
              </h1>
              <p className="text-xs text-muted-light dark:text-muted-dark font-normal">
                Internet-Integrated • Culturally Aware
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2">
            {installPrompt && (
              <button
                onClick={handleInstallClick}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 text-secondary text-sm font-bold transition-colors transform hover:scale-105"
                aria-label="Install App"
                title="Install AnaChakChat to your device"
              >
                <Download strokeWidth={1.5} className="w-4 h-4" />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}
            <button
                onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                className="group relative w-9 h-9 flex items-center justify-center rounded-full bg-surface-light/50 hover:bg-hint-light dark:bg-surface-dark/50 dark:hover:bg-hint-dark text-text-light dark:text-text-dark transition-all duration-fast transform hover:scale-110"
                title={isThinkingEnabled ? 'AI thinking is on for deeper reasoning. Click to disable for faster answers.' : 'AI thinking is off for faster answers. Click to enable deeper reasoning.'}
                aria-label={isThinkingEnabled ? 'Disable AI thinking' : 'Enable AI thinking'}
            >
                <Sparkles strokeWidth={1.5} className={`w-5 h-5 transition-colors ${isThinkingEnabled ? 'text-primary' : 'text-muted-light dark:text-muted-dark'}`} />
                {isThinkingEnabled && <div className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border-2 border-background-light dark:border-background-dark animate-pulse"></div>}
            </button>
            <button onClick={toggleTheme} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-hint-light dark:hover:bg-hint-dark text-muted-light dark:text-muted-dark transition-all duration-fast transform hover:scale-110" aria-label="Toggle dark mode" title="Toggle dark mode">
                <Moon strokeWidth={1.5} className="w-5 h-5" />
            </button>
            <button 
                onClick={downloadChatHistory} 
                disabled={messages.filter(m => m.status !== 'thinking').length === 0}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-hint-light dark:hover:bg-hint-dark text-muted-light dark:text-muted-dark transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110" 
                aria-label="Download chat history"
                title="Download chat history"
            >
                <FileDown strokeWidth={1.5} className="w-5 h-5" />
            </button>
            <button 
                onClick={clearChat} 
                disabled={messages.length === 0}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-hint-light dark:hover:bg-hint-dark text-muted-light dark:text-muted-dark transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110" 
                aria-label="Clear chat"
                title="Clear chat history"
            >
                <Trash2 strokeWidth={1.5} className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 relative z-0 flex flex-col">
        {messages.length === 0 && isApiConfigured ? (
          <EmptyState onQuickReply={handleQuickReply} />
        ) : (
          <div className="max-w-5xl mx-auto w-full">
            {messages.map((msg, idx) => {
              const isEditing = editingMessage?.index === idx;

              if (isEditing) {
                return (
                  <div key={`${idx}-editing`} className="flex items-end mb-6 justify-end animate-message-in">
                    <div className="w-full max-w-[90%] sm:max-w-md lg:max-w-lg">
                       <div className="bg-primary p-1 rounded-xl rounded-br-sm shadow-elev-2">
                        <textarea
                            ref={editInputRef}
                            value={editingMessage.text}
                            onChange={(e) => {
                                setEditingMessage(prev => ({...prev!, text: e.target.value}));
                                // Auto-resize logic
                                e.target.style.height = 'auto';
                                e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSaveEdit(editingMessage.index, editingMessage.text);
                                }
                                if (e.key === 'Escape') {
                                    handleCancelEdit();
                                }
                            }}
                            className="w-full bg-primary/80 text-white rounded-lg px-3 py-2.5 focus:outline-none resize-none max-h-36 overflow-y-auto font-khmer font-medium placeholder:text-white/70"
                            rows={1}
                            aria-label="Edit message input"
                        />
                       </div>
                        <div className="flex justify-end items-center space-x-2 mt-2">
                            <button onClick={handleCancelEdit} className="px-4 py-2 rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-hint-light dark:hover:bg-hint-dark text-sm font-semibold text-muted-light dark:text-muted-dark">Cancel</button>
                            <button onClick={() => handleSaveEdit(editingMessage.index, editingMessage.text)} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-sm font-semibold text-white">Save</button>
                        </div>
                    </div>
                  </div>
                );
              }

              const isThinkingBubble = msg.status === 'thinking' && (msg.content.trim() === '' || msg.content.includes('...') );
              if (isThinkingBubble) {
                  const thinkingText = msg.content.trim() ? msg.content : 'កំពុងគិត...';
                  return (
                    <div key={idx} className="flex items-end mb-6 justify-start">
                      <div className="bg-surface-light dark:bg-surface-dark shadow-elev-1 border border-divider-light dark:border-divider-dark max-w-xs px-6 py-4 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm text-muted-light dark:text-muted-dark font-medium font-khmer">{thinkingText}</span>
                          <div className="flex space-x-1.5 items-center">
                            <div className="w-2 h-2 bg-primary rounded-full animate-thinking"></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-thinking"></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-thinking"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
              }

              return (
                <div 
                  key={idx} 
                  className={`flex items-end mb-6 ${
                    msg.type === 'user' ? 'justify-end' : 'justify-start'
                  } animate-message-in`}
                >
                  <div className={`group relative max-w-[90%] sm:max-w-md lg:max-w-lg px-4 py-3 shadow-elev-1 leading-relaxed ${
                    msg.type === 'user' 
                      ? 'bg-primary text-white rounded-xl rounded-br-sm' 
                      : `bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark border border-divider-light dark:border-divider-dark rounded-xl rounded-bl-sm ${msg.status === 'error' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : ''}`
                  }`}>
                    
                    {msg.type === 'user' && !msg.attachmentPreview && !isGenerating && (
                        <div className="absolute top-1/2 -translate-y-1/2 -left-10 transform transition-all duration-200 opacity-0 group-hover:opacity-100 flex items-center">
                            <button 
                                onClick={() => handleStartEdit(idx)} 
                                className="p-1.5 rounded-full bg-surface-light dark:bg-surface-dark hover:bg-hint-light dark:hover:bg-hint-dark shadow-md border border-divider-light dark:border-divider-dark"
                                aria-label="Edit message"
                                title="Edit message"
                            >
                                <Pencil className="w-3.5 h-3.5 text-muted-light dark:text-muted-dark" />
                            </button>
                        </div>
                    )}
                    
                    {msg.attachmentPreview && (
                      <div className="mb-2">
                        {msg.attachmentPreview.type === 'image' && (
                          <SafeImage src={msg.attachmentPreview.data} alt={msg.attachmentPreview.name} className="max-w-full h-auto rounded-lg border shadow-inner-sm dark:border-divider-dark" />
                        )}
                        {msg.attachmentPreview.type === 'video' && (
                          <video src={msg.attachmentPreview.data} controls className="max-w-full h-auto rounded-lg border shadow-inner-sm dark:border-divider-dark" />
                        )}
                        {['pdf', 'audio'].includes(msg.attachmentPreview.type) && (
                          <div className="flex items-center space-x-3 p-3 bg-hint-light/50 dark:bg-hint-dark/50 rounded-lg">
                             {msg.attachmentPreview.type === 'pdf' ? <FileText strokeWidth={1.5} className="w-6 h-6 text-primary flex-shrink-0" /> : <FileAudio strokeWidth={1.5} className="w-6 h-6 text-primary flex-shrink-0" />}
                            <span className="text-sm text-text-light dark:text-text-dark truncate font-medium">{msg.attachmentPreview.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-start">
                      {msg.type === 'user' && msg.promptType === 'image' && (
                        <ImageIcon strokeWidth={2} className="w-4 h-4 mr-2 mt-1 flex-shrink-0 text-white/80" />
                      )}
                      {msg.type === 'user' && msg.promptType === 'video' && (
                        <Video strokeWidth={2} className="w-4 h-4 mr-2 mt-1 flex-shrink-0 text-white/80" />
                      )}
                      {msg.type === 'user' && msg.promptType === 'music' && (
                        <Music strokeWidth={2} className="w-4 h-4 mr-2 mt-1 flex-shrink-0 text-white/80" />
                      )}
                      <MarkdownRenderer content={msg.content} />
                    </div>

                    {msg.imageSearchResults && msg.imageSearchResults.length > 0 && (
                      <div className="mt-2">
                        <a href={msg.imageSearchResults[0].url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border dark:border-divider-dark shadow-inner-sm">
                          <SafeImage src={msg.imageSearchResults[0].url} alt={msg.imageSearchResults[0].alt} className="w-full h-auto object-cover" />
                        </a>
                      </div>
                    )}

                    {msg.videoEmbeds && msg.videoEmbeds.length > 0 && (
                      <div className="mt-3 border-t border-divider-light dark:border-divider-dark/50 pt-3">
                        <h4 className="font-bold text-sm mb-2">{msg.videoEmbeds[0].title}</h4>
                        <div className="aspect-video w-full rounded-lg overflow-hidden bg-hint-light dark:bg-hint-dark">
                          {msg.videoEmbeds[0].service === 'youtube' && (
                            <iframe
                              src={`https://www.youtube.com/embed/${msg.videoEmbeds[0].videoId}`}
                              title={msg.videoEmbeds[0].title}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                              className="w-full h-full"
                            ></iframe>
                          )}
                        </div>
                      </div>
                    )}

                     {msg.downloadableAttachment && (
                        <div className="mt-3 space-y-2">
                            {(Array.isArray(msg.downloadableAttachment) ? msg.downloadableAttachment : [msg.downloadableAttachment]).map((download, i) => (
                                <a
                                    key={i}
                                    href={download.url}
                                    download={download.filename}
                                    className="flex items-center justify-center p-2.5 bg-primary/10 text-primary font-bold rounded-lg hover:bg-primary/20 transition-colors text-sm"
                                >
                                    <Download strokeWidth={2} className="w-4 h-4 mr-2" />
                                    {download.label}
                                </a>
                            ))}
                        </div>
                    )}
                    
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 border-t border-divider-light dark:border-divider-dark/50 pt-3">
                        <h4 className="text-xs font-bold text-muted-light dark:text-muted-dark mb-2 flex items-center space-x-1">
                          <Book strokeWidth={1.5} className="w-3 h-3" />
                          <span>Sources:</span>
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {msg.sources.map((s, i) => (
                            <a href={s.web.uri} key={i} target="_blank" rel="noreferrer" className="text-xs bg-hint-light hover:bg-primary/10 text-primary px-3 py-1 rounded-full transition-colors duration-fast dark:bg-hint-dark dark:hover:bg-primary/20 dark:text-text-dark">
                              {i + 1}. {s.web.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-2">
                      <p className={`text-xs ${
                        msg.type === 'user'
                          ? 'text-white/70'
                          : 'text-muted-light dark:text-muted-dark opacity-60'
                      }`}>
                        {msg.timestamp}
                        {msg.isEdited && <span className="italic opacity-80"> (edited)</span>}
                      </p>
                      {msg.type === 'ai' && msg.status === 'complete' && <Feedback answerId={`${idx}-${msg.timestamp}`} contentToCopy={msg.content} />}
                    </div>
                  </div>
                </div>
              )
            })}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <footer className="bg-transparent p-4 sm:p-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          {attachment && (
            <div className="mb-3 relative w-max max-w-xs border border-divider-light dark:border-divider-dark rounded-lg p-2 bg-surface-light dark:bg-surface-dark shadow-elev-1 transition-all">
              {attachment.type === 'image' ? (
                <SafeImage src={`data:${attachment.file.type};base64,${attachment.base64}`} alt="preview" className="w-28 h-28 object-cover rounded-md" />
              ) : (
                <div className="flex flex-col items-center justify-center text-center space-y-2 p-3 h-28 w-28">
                  {attachment.type === 'pdf' ? <FileText strokeWidth={1.5} className="w-10 h-10 text-primary" /> : <FileAudio strokeWidth={1.5} className="w-10 h-10 text-primary" />}
                  <span className="text-xs text-text-light dark:text-text-dark break-all font-medium leading-tight">{attachment.file.name}</span>
                </div>
              )}
              <button onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-md" aria-label="Remove attachment">
                <X strokeWidth={1.5} className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <div className="flex items-end space-x-3">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,application/pdf,audio/*,video/mp4,.m4a" className="hidden" />
            
            <div className="flex-1 flex items-center p-1 rounded-full bg-surface-light dark:bg-surface-dark shadow-elev-1 focus-within:shadow-focus-ring transition-shadow duration-normal border border-divider-light dark:border-divider-dark">
                <button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isGenerating || !!attachment}
                    className="p-3 rounded-full text-muted-light dark:text-muted-dark hover:text-primary hover:bg-hint-light dark:hover:text-primary dark:hover:bg-hint-dark transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110"
                    aria-label="Attach file"
                    title="Attach a file (image, PDF, audio)"
                >
                    <Paperclip strokeWidth={1.5} className="w-5 h-5" />
                </button>

                <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                        isGenerating ? "កំពុងគិត..." :
                        isDictating ? "Listening..." :
                        attachment ? "File attached. Describe edits, or ask a question about it..." :
                        'សរសេរសារ...'
                    }
                    className="flex-1 w-full bg-transparent px-2 py-2.5 focus:outline-none resize-none max-h-36 overflow-y-auto font-khmer font-medium placeholder:text-muted-light dark:placeholder:text-muted-dark"
                    rows={1}
                    aria-label="Message input"
                    disabled={isGenerating}
                />

                {('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) && (
                  <>
                    <button
                        onClick={handleToggleDictation}
                        disabled={isGenerating}
                        className={`p-3 rounded-full transition-all duration-fast disabled:opacity-50 transform hover:scale-110 ${
                            isDictating 
                            ? 'text-red-500 bg-red-500/10' 
                            : 'text-muted-light hover:text-primary hover:bg-hint-light dark:text-muted-dark dark:hover:text-primary dark:hover:bg-hint-dark'
                        }`}
                        aria-label={isDictating ? 'Stop dictation' : 'Start dictation'}
                        title={isDictating ? 'Stop dictation' : 'Start voice dictation'}
                    >
                        {isDictating ? <MicOff strokeWidth={1.5} className="w-5 h-5" /> : <Mic strokeWidth={1.5} className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={handleStartConversation}
                        disabled={isGenerating}
                        className={`p-3 rounded-full transition-all duration-fast disabled:opacity-50 transform hover:scale-110 text-muted-light hover:text-primary hover:bg-hint-light dark:text-muted-dark dark:hover:text-primary dark:hover:bg-hint-dark`}
                        aria-label={'Start voice conversation'}
                        title={'Start voice conversation'}
                    >
                       <Ear strokeWidth={1.5} className="w-5 h-5" />
                    </button>
                  </>
                )}
            </div>

            <button 
                onClick={handleSend} 
                disabled={!canSend} 
                className={`relative flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-primary text-white transition-all duration-fast transform hover:scale-105 active:scale-95 shadow-elev-1 hover:shadow-elev-2 disabled:bg-muted-light dark:disabled:bg-muted-dark disabled:scale-100 disabled:cursor-not-allowed ${canSend ? 'hover:bg-primary/90' : ''}`}
                aria-label="Send message"
            >
                <Send strokeWidth={1.5} className="w-5 h-5" />
                {showSendRipple && <div className="absolute inset-0 rounded-full bg-white/30 animate-ping"></div>}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<AdvancedKhmerAI />);