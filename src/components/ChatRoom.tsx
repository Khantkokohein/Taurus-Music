import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bot, Loader2, MessageSquare, Send, ShieldAlert, User, Users, X } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { collection, query, orderBy, onSnapshot, limit, serverTimestamp, setDoc, doc, deleteDoc, updateDoc, Timestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';

interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: string | number;
  userId: string;
  isAi?: boolean;
}

interface ActiveUser {
  uid: string;
  name: string;
  photoURL?: string | null;
  lastSeen: number;
}

interface ChatBanState {
  active: boolean;
  until?: number;
  reason?: string;
}

interface ChatRoomProps {
  currentUser: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    email?: string | null;
  } | null;
  onClose: () => void;
}

const CHAT_BAN_DURATION_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;
const BLOCKED_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'motherfucker',
  'cunt',
  'လီး',
  'စောက်',
  'မအေ',
  'လိုး',
  'ဖာ',
  'ဖင်',
];

const getDisplayName = (currentUser: ChatRoomProps['currentUser']) => (
  currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous'
);

const normalizeMessage = (value: string) => (
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const containsBlockedTerm = (value: string) => {
  const normalized = normalizeMessage(value);
  return BLOCKED_TERMS.some(term => normalized.includes(term));
};

const shouldAskAi = (value: string) => {
  const normalized = normalizeMessage(value);
  return normalized.includes('@ai') || normalized.includes('@taurus');
};

export default function ChatRoom({ currentUser, onClose }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [banState, setBanState] = useState<ChatBanState>({ active: false });
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isAiReplying, setIsAiReplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const connectedUsers = activeUsers.length;

  useEffect(() => {
    if (!currentUser) {
      setMessages([]);
      setActiveUsers([]);
      return;
    }

    const q = query(collection(db, 'chatMessages'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          user: data.user,
          text: data.text,
          timestamp: data.timestamp ? data.timestamp.toMillis() : Date.now(),
          userId: data.userId,
          isAi: data.isAi === true,
        } as Message;
      }).reverse(); // Reverse to show oldest first at the top
      setMessages(msgs);
      setChatError(null);
    }, (error) => {
      console.error("Messages Error:", error);
      setChatError("Chat connection failed. Please sign in again or check Firestore rules.");
    });

    const pQ = query(collection(db, 'presence'));
    const unsubscribePresence = onSnapshot(pQ, (snapshot) => {
      const now = Date.now();
      const users: ActiveUser[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const lastSeenTime = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : 0;
        if (lastSeenTime && now - lastSeenTime < ACTIVE_WINDOW_MS) {
          users.push({
            uid: data.userId || doc.id,
            name: data.displayName || data.email?.split('@')[0] || 'Anonymous',
            photoURL: data.photoURL || null,
            lastSeen: lastSeenTime,
          });
        }
      });
      setActiveUsers(users.sort((a, b) => b.lastSeen - a.lastSeen));
    }, (error) => {
      console.error("Presence Error:", error);
    });

    return () => {
      unsubscribeMessages();
      unsubscribePresence();
    };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser) {
      setBanState({ active: false });
      return;
    }

    const unsubscribeProfile = onSnapshot(doc(db, 'users', currentUser.uid), (snapshot) => {
      const data = snapshot.data();
      const bannedUntil = data?.chatBannedUntil?.toMillis ? data.chatBannedUntil.toMillis() : 0;
      setBanState({
        active: bannedUntil > Date.now(),
        until: bannedUntil || undefined,
        reason: data?.chatBanReason,
      });
    }, (error) => {
      console.error("Ban State Error:", error);
    });

    return () => unsubscribeProfile();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser) return;
    
    const presenceRef = doc(db, 'presence', currentUser.uid);
    const writePresence = () => setDoc(presenceRef, {
      userId: currentUser.uid,
      displayName: getDisplayName(currentUser),
      email: currentUser.email || null,
      photoURL: currentUser.photoURL || null,
      lastSeen: serverTimestamp(),
    }, { merge: true }).catch(console.error);

    writePresence();
    
    const interval = setInterval(writePresence, 15000);
    
    return () => {
      clearInterval(interval);
      deleteDoc(presenceRef).catch(console.error);
    };
  }, [currentUser?.uid, currentUser?.displayName, currentUser?.email, currentUser?.photoURL]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const applyAutoBan = async (violationText: string) => {
    if (!currentUser) return;
    const bannedUntil = Date.now() + CHAT_BAN_DURATION_MS;
    await updateDoc(doc(db, 'users', currentUser.uid), {
      chatBannedUntil: Timestamp.fromDate(new Date(bannedUntil)),
      chatBanReason: 'Auto-ban: inappropriate language',
      chatBannedAt: serverTimestamp(),
      chatLastViolation: violationText.slice(0, 240),
      chatBanCount: increment(1),
    });
    setBanState({
      active: true,
      until: bannedUntil,
      reason: 'Auto-ban: inappropriate language',
    });
  };

  const sendAiReply = async (sourceText: string) => {
    if (!currentUser || !process.env.GEMINI_API_KEY) return;

    setIsAiReplying(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are Taurus AI, a concise music producer assistant inside a live chat. Reply in 1-2 short sentences. Give helpful production, lyrics, melody, or arrangement advice. Do not use abusive language.",
        },
        contents: sourceText.replace(/@ai|@taurus/gi, '').trim(),
      });

      const reply = response.text?.trim();
      if (!reply) return;

      await setDoc(doc(collection(db, 'chatMessages')), {
        user: 'Taurus AI',
        text: reply.slice(0, MAX_MESSAGE_LENGTH),
        userId: 'taurus-ai',
        isAi: true,
        createdBy: currentUser.uid,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("AI Reply Error:", err);
    } finally {
      setIsAiReplying(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUser || banState.active || isSending) return;
    
    const textToSend = inputText.trim().slice(0, MAX_MESSAGE_LENGTH);
    setInputText('');
    setChatError(null);
    
    try {
      setIsSending(true);
      if (containsBlockedTerm(textToSend)) {
        await applyAutoBan(textToSend);
        setChatError("Message blocked. This account is paused from chat for 24 hours.");
        return;
      }

      const newDocRef = doc(collection(db, 'chatMessages'));
      await setDoc(newDocRef, {
        user: getDisplayName(currentUser),
        text: textToSend,
        userId: currentUser.uid,
        timestamp: serverTimestamp()
      });

      if (shouldAskAi(textToSend)) {
        await sendAiReply(textToSend);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setChatError("Message failed to send. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const insertAiMention = () => {
    setInputText(prev => prev.startsWith('@ai ') ? prev : `@ai ${prev}`);
  };

  const banLabel = banState.until
    ? `Chat paused until ${new Date(banState.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Chat paused';

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] bg-zinc-900 border border-zinc-800 rounded-[2rem] shadow-2xl z-[80] flex flex-col overflow-hidden"
    >
      <div className="p-5 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-400">
              <MessageSquare size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Producer Chat</h3>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {connectedUsers || 0} Active
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors">
            <X size={20} />
          </button>
        </div>
        {activeUsers.length > 0 && (
          <div className="mt-4 flex items-center gap-2 overflow-hidden">
            {activeUsers.slice(0, 5).map(activeUser => (
              <div key={activeUser.uid} className="flex items-center gap-1.5 min-w-0 rounded-full bg-zinc-950/70 border border-zinc-800 px-2 py-1">
                <div className="w-5 h-5 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-500 shrink-0">
                  {activeUser.photoURL ? (
                    <img src={activeUser.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={12} />
                  )}
                </div>
                <span className="text-[10px] text-zinc-400 font-bold truncate max-w-16">{activeUser.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-20 text-zinc-500">
            <Users size={48} className="mb-4" />
            <p className="text-sm font-medium">No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => (
            (() => {
              const isAi = msg.isAi || msg.userId === 'taurus-ai';
              const isOwn = msg.userId === currentUser?.uid && !isAi;
              return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-tighter ${isAi ? 'text-violet-300' : 'text-zinc-500'}`}>
                  {msg.user}
                </span>
                <span className="text-[9px] text-zinc-700">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={`
                px-4 py-2 rounded-2xl text-sm max-w-[85%]
                ${isOwn 
                  ? 'bg-violet-600 text-white rounded-tr-none'
                  : isAi
                    ? 'bg-violet-500/10 text-violet-50 border border-violet-500/20 rounded-tl-none'
                    : 'bg-zinc-800 text-zinc-100 rounded-tl-none'}
              `}>
                {msg.text}
              </div>
            </div>
              );
            })()
          ))
        )}
        {isAiReplying && (
          <div className="flex items-center gap-2 text-xs text-violet-300">
            <Loader2 size={14} className="animate-spin" />
            <span>Taurus AI is replying</span>
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="p-4 bg-zinc-900 border-t border-zinc-800">
        {(chatError || banState.active) && (
          <div className="mb-3 flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>{banState.active ? banLabel : chatError}</span>
          </div>
        )}
        <div className="relative">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={currentUser ? "Drop a message..." : "Login to chat"}
            disabled={!currentUser || banState.active}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-3 pl-4 pr-20 text-sm outline-none focus:ring-1 focus:ring-violet-500/50 transition-all placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={insertAiMention}
            disabled={!currentUser || banState.active}
            title="Ask Taurus AI"
            className="absolute right-11 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl text-violet-300 flex items-center justify-center hover:bg-zinc-800 disabled:opacity-50 transition-all"
          >
            <Bot size={14} />
          </button>
          <button 
            type="submit"
            disabled={!inputText.trim() || !currentUser || banState.active || isSending}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600 transition-all"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
