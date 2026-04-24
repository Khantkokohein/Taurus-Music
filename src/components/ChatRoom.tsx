import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, MessageSquare, X, Users } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: string;
  userId: string;
}

interface ChatRoomProps {
  currentUser: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
  } | null;
  onClose: () => void;
}

export default function ChatRoom({ currentUser, onClose }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on('message', (msg: Message) => {
      setMessages(prev => [...prev, msg].slice(-50));
    });

    newSocket.on('user_count', (count: number) => {
      setConnectedUsers(count);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !socket || !currentUser) return;

    socket.emit('message', {
      user: currentUser.displayName || 'Anonymous',
      text: inputText,
      userId: currentUser.uid
    });
    setInputText('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] bg-zinc-900 border border-zinc-800 rounded-[2rem] shadow-2xl z-[80] flex flex-col overflow-hidden"
    >
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-400">
            <MessageSquare size={20} />
          </div>
          <div>
            <h3 className="font-bold text-sm">Producer Chat</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-black">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {connectedUsers} Listening
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors">
          <X size={20} />
        </button>
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
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.userId === currentUser?.uid ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">
                  {msg.user}
                </span>
                <span className="text-[9px] text-zinc-700">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={`
                px-4 py-2 rounded-2xl text-sm max-w-[85%]
                ${msg.userId === currentUser?.uid 
                  ? 'bg-violet-600 text-white rounded-tr-none' 
                  : 'bg-zinc-800 text-zinc-100 rounded-tl-none'}
              `}>
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={sendMessage} className="p-4 bg-zinc-900 border-t border-zinc-800">
        <div className="relative">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={currentUser ? "Drop a message..." : "Login to chat"}
            disabled={!currentUser}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-3 pl-4 pr-12 text-sm outline-none focus:ring-1 focus:ring-violet-500/50 transition-all placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={!inputText.trim() || !currentUser}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600 transition-all"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </motion.div>
  );
}
