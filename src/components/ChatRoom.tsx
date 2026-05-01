import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bot, Gift, Loader2, MessageSquare, Music, Send, ShieldAlert, Users, X } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, limit, serverTimestamp, setDoc, doc, deleteDoc, updateDoc, Timestamp, increment, getDocs } from 'firebase/firestore';
import { CHAT_BAN_DURATION_MS, CHAT_BAN_THRESHOLD, db, isOwnerEmail } from '../firebase';

interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: string | number;
  userId: string;
  isAi?: boolean;
  isSongShare?: boolean;
  songId?: string;
  songTitle?: string;
  songUrl?: string;
  songMimeType?: string;
}

interface ActiveUser {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  lastSeen: number;
}

interface GiveawayUser {
  uid: string;
  displayName: string;
}

interface ChatBanState {
  active: boolean;
  until?: number;
  reason?: string;
  violationCount: number;
  knownName?: string;
}

interface ChatRoomProps {
  currentUser: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    email?: string | null;
    getIdToken?: () => Promise<string>;
  } | null;
  isAdmin?: boolean;
  onClose: () => void;
}

const ACTIVE_WINDOW_MS = 60 * 1000;
const FAKE_ONLINE_MIN = 11;
const FAKE_ONLINE_MAX = 38;
const ONLINE_FLUCTUATION_MS = 4500;
const ONLINE_STEP_OPTIONS = [-3, -2, -1, 1, 2, 3];
const VISIBLE_ONLINE_NAMES = 4;
const MAX_MESSAGE_LENGTH = 4000;
const FAKE_ONLINE_NAMES = [
  'Aung Beats',
  'Moe Studio',
  'Nora Mix',
  'Jay Producer',
  'Htet Wave',
  'Zin Melody',
  'Ko Min',
  'May Vocal',
  'Leo Sound',
  'Yuki Keys',
  'Arkar Flow',
  'Sai Pulse',
];
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

const AI_KEYWORDS = [
  '@ai',
  '@taurus',
  'သီချင်းရေးပေး',
  'အချစ်သီချင်းရေးပေး',
  'အချစ်သီချင်း',
  'စာသားရေးပေး',
  'သီချင်းစာသား',
  'တေးရေး',
  'သံစဉ်',
  'ချစ်သီချင်း',
  'subscribe လုပ်ချင်တယ်',
  'subscribe',
  'subscription',
  'premium',
  'prime',
  'pro plan',
  'payment',
  'upgrade',
  'lyrics',
  'write a song',
  'love song',
  'chorus',
  'verse',
  'melody',
  'beat',
  'rap',
  'edm',
  'music prompt',
  'song idea',
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
  return AI_KEYWORDS.some(keyword => normalized.includes(normalizeMessage(keyword)));
};

const containsMyanmar = (value: string) => /[\u1000-\u109f]/.test(value);

const postJson = async <T,>(url: string, body: Record<string, unknown>, token: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  window.clearTimeout(timeout);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed. Please try again.');
  }

  return payload as T;
};

const getInitialFakeOnline = () => (
  FAKE_ONLINE_MIN + Math.floor(Math.random() * (FAKE_ONLINE_MAX - FAKE_ONLINE_MIN + 1))
);

const getNextFakeOnline = (current: number) => {
  const candidates = ONLINE_STEP_OPTIONS
    .map(step => current + step)
    .filter(count => count >= FAKE_ONLINE_MIN && count <= FAKE_ONLINE_MAX && count !== current);

  if (candidates.length === 0) return getInitialFakeOnline();
  return candidates[Math.floor(Math.random() * candidates.length)];
};

export default function ChatRoom({ currentUser, isAdmin = false, onClose }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [banState, setBanState] = useState<ChatBanState>({ active: false, violationCount: 0 });
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [isGivingAway, setIsGivingAway] = useState(false);
  const [fakeOnline, setFakeOnline] = useState(getInitialFakeOnline);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isOwnerUnlimited = isOwnerEmail(currentUser?.email);
  const onlineCount = fakeOnline + activeUsers.length;
  const onlineNames = [
    ...activeUsers.map(user => user.displayName).filter(Boolean),
    ...FAKE_ONLINE_NAMES,
  ].filter((name, index, names) => names.indexOf(name) === index);
  const visibleOnlineNames = onlineNames.slice(0, VISIBLE_ONLINE_NAMES);
  const hiddenOnlineCount = Math.max(onlineCount - visibleOnlineNames.length, 0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFakeOnline(prev => getNextFakeOnline(prev));
    }, ONLINE_FLUCTUATION_MS);

    return () => clearInterval(interval);
  }, []);

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
          isSongShare: data.isSongShare === true,
          songId: data.songId,
          songTitle: data.songTitle,
          songUrl: data.songUrl,
          songMimeType: data.songMimeType,
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
            displayName: data.displayName || data.email?.split('@')[0] || 'Online user',
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
      setBanState({ active: false, violationCount: 0 });
      return;
    }

    const unsubscribeProfile = onSnapshot(doc(db, 'users', currentUser.uid), (snapshot) => {
      const data = snapshot.data();
      const bannedUntil = data?.chatBannedUntil?.toMillis ? data.chatBannedUntil.toMillis() : 0;
      setBanState({
        active: !isOwnerUnlimited && bannedUntil > Date.now(),
        until: bannedUntil || undefined,
        reason: data?.chatBanReason,
        violationCount: data?.chatViolationCount || 0,
        knownName: data?.displayName || getDisplayName(currentUser),
      });
    }, (error) => {
      console.error("Ban State Error:", error);
    });

    return () => unsubscribeProfile();
  }, [currentUser?.uid, isOwnerUnlimited]);

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

  const recordViolation = async (violationText: string) => {
    if (!currentUser) return;
    const nextViolationCount = (banState.violationCount || 0) + 1;
    const shouldBan = nextViolationCount >= CHAT_BAN_THRESHOLD;
    const bannedUntil = Date.now() + CHAT_BAN_DURATION_MS;

    const updates: Record<string, any> = {
      chatViolationCount: nextViolationCount,
      chatLastViolation: violationText.slice(0, 240),
      chatLastViolationAt: serverTimestamp(),
    };

    if (shouldBan) {
      updates.chatBannedUntil = Timestamp.fromDate(new Date(bannedUntil));
      updates.chatBanReason = 'Auto-ban: 3 inappropriate messages';
      updates.chatBannedAt = serverTimestamp();
      updates.chatBanCount = increment(1);
    }

    await updateDoc(doc(db, 'users', currentUser.uid), updates);

    if (shouldBan) {
      setBanState(prev => ({
        ...prev,
        active: true,
        until: bannedUntil,
        reason: 'Auto-ban: 3 inappropriate messages',
        violationCount: nextViolationCount,
      }));
    } else {
      setBanState(prev => ({
        ...prev,
        violationCount: nextViolationCount,
      }));
    }
  };

  const sendAiReply = async (sourceText: string) => {
    if (!currentUser) return;

    setIsAiReplying(true);
    try {
      const token = await currentUser.getIdToken?.();
      if (!token) {
        throw new Error('Login session expired. Please sign in again.');
      }

      const userName = banState.knownName || getDisplayName(currentUser);
      const languageHint = containsMyanmar(sourceText) ? 'Myanmar/Burmese' : 'English';
      const recentContext = messages.slice(-6).map(message => `${message.user}: ${message.text}`).join('\n');
      const response = await postJson<{ reply: string }>('/api/ai-chat', {
        sourceText,
        userName,
        languageHint,
        recentContext,
      }, token);

      const reply = response.reply?.trim();
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
      setChatError("Taurus AI reply failed. Please refresh and try again.");
    } finally {
      setIsAiReplying(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUser || (!isOwnerUnlimited && banState.active) || isSending) return;
    
    const textToSend = inputText.trim().slice(0, MAX_MESSAGE_LENGTH);
    setInputText('');
    setChatError(null);
    
    try {
      setIsSending(true);
      if (!isOwnerUnlimited && containsBlockedTerm(textToSend)) {
        const nextCount = (banState.violationCount || 0) + 1;
        await recordViolation(textToSend);
        setChatError(nextCount >= CHAT_BAN_THRESHOLD
          ? "Message deleted. This account is banned for 1 month after 3 violations."
          : `Message deleted. Warning ${nextCount}/${CHAT_BAN_THRESHOLD}.`);
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

  const runGiveaway = async () => {
    if (!currentUser || !isAdmin || isGivingAway) return;
    setChatError(null);
    setIsGivingAway(true);

    try {
      let candidates: GiveawayUser[] = activeUsers
        .filter(activeUser => activeUser.uid !== currentUser.uid)
        .map(activeUser => ({
          uid: activeUser.uid,
          displayName: activeUser.displayName || 'Online user',
        }));

      if (candidates.length === 0) {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(100)));
        candidates = usersSnap.docs
          .map(userDoc => {
            const data = userDoc.data();
            return {
              uid: data.uid || userDoc.id,
              displayName: data.displayName || data.email?.split('@')[0] || 'Taurus user',
            };
          })
          .filter(userData => userData.uid !== currentUser.uid);
      }

      if (candidates.length === 0) {
        throw new Error("No user account is available for giveaway.");
      }

      const winner = candidates[Math.floor(Math.random() * candidates.length)];
      await updateDoc(doc(db, 'users', winner.uid), {
        points: increment(100),
        totalPointsEarned: increment(100),
      });

      await setDoc(doc(collection(db, 'chatMessages')), {
        user: 'Taurus Admin',
        text: `[Giveaway] ${winner.displayName} won 100 points.`,
        userId: currentUser.uid,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Giveaway Error:", err);
      setChatError("Giveaway failed. Please check admin permission.");
    } finally {
      setIsGivingAway(false);
    }
  };

  const insertAiMention = () => {
    setInputText(prev => prev.startsWith('@ai ') ? prev : `@ai ${prev}`);
  };

  const banLabel = banState.until
    ? `Banned until ${new Date(banState.until).toLocaleDateString()}`
    : 'Chat paused';
  const chatBlocked = !isOwnerUnlimited && banState.active;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] bg-zinc-900 border border-zinc-800 rounded-[2rem] shadow-2xl z-[80] flex flex-col overflow-hidden"
    >
      <div className="p-5 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-400">
                <MessageSquare size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm">Producer Chat</h3>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {onlineCount} Online
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden">
            {isAdmin && (
              <button
                type="button"
                onClick={runGiveaway}
                disabled={isGivingAway}
                title="Run giveaway"
                className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-black text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1"
              >
                {isGivingAway ? <Loader2 size={11} className="animate-spin" /> : <Gift size={11} />}
                GW
              </button>
            )}
            {visibleOnlineNames.map(name => (
              <span
                key={name}
                className="max-w-[74px] truncate rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[9px] font-bold text-zinc-400"
                title={`${name} online`}
              >
                {name}
              </span>
            ))}
            {hiddenOnlineCount > 0 && (
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-400">
                +{hiddenOnlineCount}
              </span>
            )}
          </div>
        </div>
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
                {msg.isSongShare && msg.songUrl ? (
                  <div className="min-w-0 w-56 max-w-full">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-200">
                      <Music size={12} /> Shared Song
                    </div>
                    <p className="mb-3 truncate font-bold">{msg.songTitle || msg.text}</p>
                    <audio controls src={msg.songUrl} className="w-full h-8" />
                  </div>
                ) : (
                  msg.text
                )}
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
        {(chatError || chatBlocked) && (
          <div className="mb-3 flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>{chatBlocked ? banLabel : chatError}</span>
          </div>
        )}
        <div className="relative">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={currentUser ? "Drop a message..." : "Login to chat"}
            disabled={!currentUser || chatBlocked}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-3 pl-4 pr-20 text-sm outline-none focus:ring-1 focus:ring-violet-500/50 transition-all placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={insertAiMention}
            disabled={!currentUser || chatBlocked}
            title="Ask Taurus AI"
            className="absolute right-11 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl text-violet-300 flex items-center justify-center hover:bg-zinc-800 disabled:opacity-50 transition-all"
          >
            <Bot size={14} />
          </button>
          <button 
            type="submit"
            disabled={!inputText.trim() || !currentUser || chatBlocked || isSending}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600 transition-all"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
