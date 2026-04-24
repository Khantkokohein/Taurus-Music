import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Music, 
  Sparkles, 
  Play, 
  Pause, 
  Download, 
  RotateCcw, 
  Mic2, 
  Volume2,
  ChevronRight,
  Plus,
  History,
  Trash2,
  AlertCircle,
  Key,
  LogOut,
  User as UserIcon,
  Quote,
  ShieldCheck,
  CreditCard,
  Wallet,
  CheckCircle2,
  Settings,
  Users,
  MessageSquare
} from 'lucide-react';
import ChatRoom from './components/ChatRoom';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  getUserProfile, 
  createUserProfile, 
  checkAndUpdateUsage, 
  requestManualPayment,
  approvePayment,
  manualUpdateUser,
  saveSong,
  UserProfile,
  Song as FirebaseSong
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, limit, where } from 'firebase/firestore';

interface Song {
  id: string;
  idea: string;
  prompt: string;
  audioUrl: string;
  lyrics: string;
  createdAt: number;
}

const TIERS = [
  { id: 'pro', name: 'Pro', price: '$15', credits: '20', color: 'blue' },
  { id: 'prime', name: 'Prime', price: '$40', credits: '50', color: 'violet' },
  { id: 'premium', name: 'Premium', price: '$200', credits: '200 songs/week', color: 'fuchsia' },
];

const GENRES = ['Neon Pulse', 'Golden Vibes', 'Pop Essence', 'Urban Flow', 'Rock Legacy'];

const VOICES = {
  male: ['Male Edge', 'Male Deep', 'Male High', 'Male Soul', 'Male Smooth'],
  female: ['Female Eager', 'Female Soft', 'Female Power', 'Female Soul', 'Female Pop'],
  other: ['Duet/Pair']
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [idea, setIdea] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('Pop Essence');
  const [selectedVoice, setSelectedVoice] = useState('Female Power');
  const [optimizedPrompt, setOptimizedPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [history, setHistory] = useState<Song[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio] = useState(new Audio());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newCredits, setNewCredits] = useState<number>(0);

  useEffect(() => {
    if (!profile || profile.role !== 'admin' || !showAdmin) return;
    const q = query(collection(db, 'users'), where('pendingPayment', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });
    return () => unsubscribe();
  }, [profile, showAdmin]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        let userProfile = await getUserProfile(authUser.uid);
        if (!userProfile) {
          userProfile = await createUserProfile(authUser.uid, authUser.email || '');
        }
        setProfile(userProfile);
        
        // Auto-open admin if path is /admin and user is admin
        if (window.location.pathname === '/admin' && userProfile.role === 'admin') {
          setShowAdmin(true);
        }
      } else {
        setProfile(null);
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'songs'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          idea: data.idea,
          prompt: data.prompt,
          audioUrl: data.audioUrl,
          lyrics: data.lyrics,
          createdAt: data.createdAt?.toMillis() || Date.now()
        } as Song;
      });
      setHistory(songs);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, [audio]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!currentSong) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.src = currentSong.audioUrl;
      audio.play().catch(err => {
        console.error("Playback error:", err);
        setError("Audio playback failed. Please try again.");
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleOptimize = async () => {
    if (!idea.trim()) return;
    setIsOptimizing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are a professional music producer. Expand music ideas into detailed prompts. Keep it under 200 chars. Return ONLY the enhanced prompt text.",
        },
        contents: idea
      });
      
      if (response.text) {
        setOptimizedPrompt(response.text.replace(/^["']|["']$/g, ''));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to enhance prompt');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!user) {
      setError("Please login with Gmail to generate music.");
      return;
    }

    const finalPrompt = optimizedPrompt || idea;
    if (!finalPrompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    try {
      // 1. Weekly/Daily Usage limit check
      const usage = await checkAndUpdateUsage(user.uid);
      if (!usage.allowed) {
        setShowUpgrade(true);
        throw new Error(profile?.tier === 'free' ? "Daily limit reached (2 songs). Subscribe for more!" : "Weekly limit reached. Refills every 7 days!");
      }

      // 2. Initialize AI (Must be new instance for each call to pick up environment/selected keys)
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const genreMapping: Record<string, string> = {
        'Neon Pulse': 'Modern high-energy Electronic/EDM with synth-wave elements',
        'Golden Vibes': 'Acoustic, warm, and uplifting soulful atmosphere',
        'Pop Essence': 'Polished modern top-40 Pop with commercial appeal',
        'Urban Flow': 'Cloud Rap/Hip-hop with modern trap influence and deep bass',
        'Rock Legacy': 'High-fidelity Alternative/Arena Rock with powerful guitars'
      };

      const genreDescription = genreMapping[selectedGenre] || selectedGenre;
      const fullPrompt = `Generate a professional high-quality ${genreDescription} song in .MP3 format. Style: ${selectedVoice}. Theme: ${finalPrompt}. Voice instructions: Use a professional ${selectedVoice} singer.`;

      const result = await ai.models.generateContent({
        model: "lyria-3-pro-preview",
        contents: fullPrompt,
        config: {
          responseModalities: [Modality.AUDIO],
        }
      });

      let audioBase64 = "";
      let lyrics = "";
      let mimeType = "audio/mp3";

      const parts = result.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            audioBase64 = part.inlineData.data;
            if (part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
          }
          if (part.text) {
            lyrics = part.text;
          }
        }
      }

      if (!audioBase64) {
        throw new Error("The AI model did not return any audio data. Please ensure your API key has Lyria permissions.");
      }

      // Collect audio into blob
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const audioUrl = URL.createObjectURL(blob);

      const newSong = {
        id: Math.random().toString(36).substr(2, 9),
        idea,
        prompt: finalPrompt,
        audioUrl,
        lyrics: lyrics || "Lyrics not generated for this track.",
      };
      
      // Usage update locally
      setProfile(prev => prev ? (
        usage.mode === 'free' 
          ? { ...prev, dailyGenerationCount: (prev.dailyGenerationCount || 0) + 1 }
          : { ...prev, songsUsedThisWeek: (prev.songsUsedThisWeek || 0) + 1 }
      ) : null);

      await saveSong(user.uid, newSong);
      setCurrentSong({
        ...newSong,
        createdAt: Date.now()
      });
      setShowLyrics(true);
    } catch (err: any) {
      console.error("Music Engine Error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        await (window as any).aistudio?.openSelectKey?.();
        setError("API Key reset. Please try generating again.");
      } else {
        setError(err.message || 'Failed to generate music');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleManualPayment = async () => {
    if(!user) return;
    await requestManualPayment(user.uid);
    setShowPayment(false);
    setProfile(prev => prev ? { ...prev, pendingPayment: true } : null);
    alert("Payment request sent! Please wait for manual approval.");
  };

  const handleApprove = async (userId: string, tier: string) => {
    await approvePayment(userId, tier);
    alert("User upgraded successfully!");
  };

  const handleManualUpdate = async () => {
    if (!editingUser) return;
    try {
      await manualUpdateUser(editingUser.uid, { songsUsedThisWeek: newCredits });
      alert("Weekly usage updated!");
      setEditingUser(prev => prev ? { ...prev, songsUsedThisWeek: newCredits } : null);
      if (user?.uid === editingUser.uid) {
        setProfile(prev => prev ? { ...prev, songsUsedThisWeek: newCredits } : null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to update usage");
    }
  };

  const handleSearchUser = async () => {
    if (!searchEmail.trim()) return;
    const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim()), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data() as UserProfile;
        setEditingUser(userData);
        setNewCredits(userData.songsUsedThisWeek || 0);
      } else {
        setError("User not found");
        setEditingUser(null);
      }
    });
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      {/* Chat Room */}
      <AnimatePresence>
        {showChat && (
          <ChatRoom 
            currentUser={user} 
            onClose={() => setShowChat(false)} 
          />
        )}
      </AnimatePresence>

      {/* Floating Chat Toggle */}
      {!showChat && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-violet-600 rounded-full shadow-2xl z-[80] flex items-center justify-center text-white hover:bg-violet-500 transition-all border border-violet-400/20"
        >
          <MessageSquare size={24} />
          {/* Unread indicator mockup */}
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-zinc-950" />
        </motion.button>
      )}

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl backdrop-blur-md shadow-2xl flex items-center gap-3"
          >
            <AlertCircle size={16} />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:text-white transition-colors">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade Modal */}
      <AnimatePresence>
        {showUpgrade && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-10 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8">
                <button onClick={() => setShowUpgrade(false)} className="text-zinc-500 hover:text-white text-xl">×</button>
              </div>

              <div className="text-center mb-12">
                <h2 className="text-4xl font-display font-bold mb-4 tracking-tight">Unlock Taurus Prime</h2>
                <p className="text-zinc-500 max-w-lg mx-auto">Get more songs with 100% weekly refill limits. Choose your plan to start creates.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {TIERS.map(tier => (
                  <div key={tier.id} className={`p-8 rounded-3xl border border-zinc-800 bg-zinc-900/30 flex flex-col items-center group hover:border-${tier.color}-500/50 transition-all`}>
                    <h3 className={`text-xl font-bold mb-2 group-hover:text-${tier.color}-400 transition-colors`}>{tier.name}</h3>
                    <div className="text-4xl font-display font-black mb-6">{tier.price}</div>
                    <div className="space-y-3 mb-8 w-full text-sm text-zinc-400">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500" />
                        <span>{tier.credits} Songs / Week</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RotateCcw size={16} className="text-violet-400" />
                        <span>Weekly Refill</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowPayment(true)}
                      className={`mt-auto w-full py-3 rounded-2xl bg-zinc-100 text-black font-bold hover:bg-white transition-all`}
                    >
                      Choose Plan
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="mt-10 pt-10 border-t border-zinc-800 flex justify-center gap-12 text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                <div className="flex items-center gap-2"><Wallet size={14} /> USDT (BEP20)</div>
                <div className="flex items-center gap-2"><CreditCard size={14} /> Myanmar Banks</div>
                <div className="flex items-center gap-2"><ShieldCheck size={14} /> 24/7 Support</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPayment && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-md w-full">
              <h3 className="text-2xl font-bold mb-6">Manual Payment</h3>
              <div className="space-y-6 text-sm">
                <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                  <p className="text-zinc-400 mb-1">USDT Address (BEP20)</p>
                  <p className="font-mono text-white select-all break-all">0x71C7656EC7ab88b098defB751B7401B5f6d8976F</p>
                </div>
                <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                  <p className="text-zinc-400 mb-1">KPay / Wave Money</p>
                  <p className="font-bold text-white">09989807081 (U Khant Ko Ko Hein)</p>
                </div>
                <div className="bg-violet-600/10 p-4 rounded-2xl border border-violet-500/20 text-violet-400">
                  <p>Send your payment then click the button below. We will verify your transaction within 1-2 hours.</p>
                </div>
              </div>
              <div className="mt-8 flex gap-4">
                <button 
                  onClick={() => setShowPayment(false)}
                  className="flex-1 py-3 rounded-xl border border-zinc-700 font-bold hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleManualPayment}
                  className="flex-1 py-3 rounded-xl bg-violet-600 font-bold hover:bg-violet-500"
                >
                  Report Paid
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Dashboard */}
      <AnimatePresence>
        {showAdmin && profile?.role === 'admin' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-5xl h-[90vh] flex flex-col p-10">
              <div className="flex items-center justify-between mb-8">
                <div>
                   <h2 className="text-3xl font-display font-bold">Admin Central</h2>
                   <p className="text-zinc-500">Manage payments and direct user credit overrides.</p>
                </div>
                <button onClick={() => { setShowAdmin(false); setEditingUser(null); }} className="text-zinc-500 hover:text-white text-2xl">×</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 overflow-hidden">
                {/* Left Side: Pending Payments */}
                <div className="flex flex-col min-h-0 bg-zinc-800/20 rounded-3xl p-6 border border-zinc-800">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <CreditCard size={14} /> Pending Approvals
                  </h3>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {pendingUsers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-600 opacity-40">
                        <CheckCircle2 size={48} className="mb-4" />
                        <p>No pending requests.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingUsers.map(u => (
                          <div key={u.uid} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
                            <div className="mb-4">
                              <p className="font-bold text-sm text-white">{u.email}</p>
                              <p className="text-[10px] text-zinc-500">UID: {u.uid}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => handleApprove(u.uid, 'pro')} className="flex-1 px-3 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/10 rounded-lg text-xs hover:bg-blue-600 hover:text-white transition-all">Pro</button>
                              <button onClick={() => handleApprove(u.uid, 'prime')} className="flex-1 px-3 py-2 bg-violet-600/10 text-violet-400 border border-violet-500/10 rounded-lg text-xs hover:bg-violet-600 hover:text-white transition-all">Prime</button>
                              <button onClick={() => handleApprove(u.uid, 'premium')} className="flex-1 px-3 py-2 bg-fuchsia-600/10 text-fuchsia-400 border border-fuchsia-500/10 rounded-lg text-xs hover:bg-fuchsia-600 hover:text-white transition-all">Premium</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Credit Management */}
                <div className="flex flex-col min-h-0 bg-zinc-800/20 rounded-3xl p-6 border border-zinc-800">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <Users size={14} /> Manual Credit Override
                  </h3>
                  
                  <div className="space-y-6">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                        placeholder="Search by User Email..."
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                      <button 
                        onClick={handleSearchUser}
                        className="px-6 py-3 bg-zinc-100 text-black rounded-xl text-sm font-bold hover:bg-white transition-all"
                      >
                        Search
                      </button>
                    </div>

                    {editingUser && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-6"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center text-violet-400 font-bold">
                            {editingUser.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white">{editingUser.email}</p>
                            <p className="text-xs text-zinc-500 capitalize">{editingUser.tier} Plan</p>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-black text-zinc-500 tracking-widest mb-2 block">Weekly Songs Used</label>
                          <div className="flex gap-3">
                            <input 
                              type="number"
                              value={newCredits}
                              onChange={(e) => setNewCredits(parseInt(e.target.value) || 0)}
                              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-lg font-mono font-bold text-amber-400 outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <button 
                              onClick={handleManualUpdate}
                              className="px-8 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-500 transition-all shadow-lg shadow-amber-600/20"
                            >
                              Reset/Set
                            </button>
                          </div>
                          <p className="text-[9px] text-zinc-600 mt-2 italic">Set to 0 to give full songs for the week.</p>
                        </div>

                        <div className="pt-4 flex gap-2">
                          <button onClick={() => setNewCredits(0)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors">Reset Week</button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-[70] w-72 border-r border-zinc-800 bg-zinc-900 flex flex-col shrink-0 transition-transform duration-300 lg:relative lg:translate-x-0 lg:bg-zinc-900/30
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Music className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
              Taurus Music
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4 px-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Generation History ({history.length})</p>
              </div>
              <div className="space-y-1 overflow-y-auto h-[calc(100vh-420px)] custom-scrollbar pr-1">
                {!user ? (
                  <div className="px-3 py-10 text-center">
                    <UserIcon size={24} className="mx-auto mb-2 text-zinc-800" />
                    <p className="text-xs text-zinc-600">Login to see history</p>
                  </div>
                ) : history.length === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <History size={24} className="mx-auto mb-2 text-zinc-800" />
                    <p className="text-xs text-zinc-600">No tracks synthesized yet</p>
                  </div>
                ) : (
                  history.map((song, idx) => (
                    <button 
                      key={song.id}
                      onClick={() => setCurrentSong(song)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 ${currentSong?.id === song.id ? 'bg-zinc-800/80 border border-zinc-700/50' : 'hover:bg-zinc-800/30'}`}
                    >
                      <div className="w-8 h-8 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-mono">
                        {(idx + 1).toString().padStart(2, '0')}
                      </div>
                      <div className="overflow-hidden">
                        <p className={`text-sm font-medium truncate ${currentSong?.id === song.id ? 'text-white' : 'text-zinc-400'}`}>
                          {song.idea || 'Untitled Track'}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {new Date(song.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-zinc-800 space-y-4">
          {user ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-zinc-700" alt="Avatar" />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate w-24">{user.displayName}</p>
                    <p className={`text-[10px] font-black uppercase tracking-tighter ${profile?.tier !== 'free' ? 'text-violet-400' : 'text-zinc-500'}`}>
                      {profile?.tier || 'free'} plan
                    </p>
                  </div>
                </div>
                <button onClick={() => logout()} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-red-400 transition-colors">
                  <LogOut size={16} />
                </button>
              </div>

              {profile?.role === 'admin' && (
                <button 
                  onClick={() => setShowAdmin(true)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck size={14} /> Admin Dashboard
                </button>
              )}

              <div className="bg-zinc-800/30 rounded-xl p-3 border border-zinc-700/30">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Daily Free</span>
                  <span className="text-[10px] font-bold text-violet-400">{profile?.dailyGenerationCount || 0} / 2</span>
                </div>
                <div className="w-full bg-zinc-950 h-1 rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ width: `${Math.min(((profile?.dailyGenerationCount || 0) / 2) * 100, 100)}%` }}
                    className="bg-violet-500 h-full shadow-[0_0_10px_rgba(139,92,246,0.5)]" 
                  />
                </div>
              </div>

              {profile?.tier !== 'free' && (
                <div className="bg-amber-500/5 rounded-xl p-3 border border-amber-500/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-amber-500/70 uppercase font-black tracking-widest">Songs This Week</span>
                    <span className="text-[10px] font-mono font-bold text-amber-500">
                      {Math.max(0, (profile?.weeklyLimit || (profile?.tier === 'premium' ? 200 : profile?.tier === 'prime' ? 50 : 20)) - (profile?.songsUsedThisWeek || 0))} / {profile?.weeklyLimit || (profile?.tier === 'premium' ? 200 : profile?.tier === 'prime' ? 50 : 20)}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-950 h-1 rounded-full overflow-hidden">
                    {(() => {
                      const limit = profile?.weeklyLimit || (profile?.tier === 'premium' ? 200 : profile?.tier === 'prime' ? 50 : 20);
                      const usage = profile?.songsUsedThisWeek || 0;
                      const width = Math.min((usage / limit) * 100, 100);
                      return (
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${width}%` }}
                          className="bg-amber-500 h-full shadow-[0_0_8px_rgba(245,158,11,0.3)]" 
                        />
                      );
                    })()}
                  </div>
                  <p className="text-[8px] text-zinc-600 mt-2 uppercase font-bold tracking-tighter">Automatic refill in 7 days</p>
                </div>
              )}

              {profile?.pendingPayment && (
                <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20 text-[10px] text-amber-500 font-bold flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Transaction Verifying...
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => signInWithGoogle()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-all shadow-xl"
            >
              Sign in with Gmail
            </button>
          )}

          <button 
            onClick={() => setShowUpgrade(true)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-black uppercase tracking-widest hover:brightness-110 shadow-lg shadow-violet-600/20"
          >
            Go Premium
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col relative overflow-y-auto bg-zinc-950">
        <header className="h-16 shrink-0 border-b border-zinc-800 flex items-center justify-between px-4 lg:px-8 bg-zinc-950/50 backdrop-blur-sm z-10 sticky top-0">
          <div className="flex items-center gap-4 text-sm text-zinc-400 font-medium">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-white"
            >
              <History size={20} />
            </button>
            <span className="hidden sm:inline hover:text-white cursor-pointer transition-colors">Taurus Studio</span>
            <span className="hidden sm:inline text-zinc-700">/</span>
            <span className="text-white truncate max-w-[120px] sm:max-w-none">AI Instrumentalist</span>
          </div>
          <div className="flex gap-2 sm:gap-4">
             {profile?.role === 'admin' && (
                <div className="hidden md:block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-500">
                  ADMIN OVERRIDE ACTIVE
                </div>
             )}
             <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-500">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="hidden xs:inline">SERVER KEY ACTIVE</span>
                <span className="xs:hidden">ACTIVE</span>
             </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-between lg:justify-center p-4 lg:p-12 min-h-0 relative overflow-hidden">
          <div className="max-w-2xl w-full text-center mb-1 lg:mb-12 relative z-10 shrink-0">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl lg:text-7xl font-display font-black mb-0.5 lg:mb-4 tracking-tighter"
            >
              Beyond the <span className="text-violet-500">Silence</span>
            </motion.h2>
            <p className="text-zinc-500 max-w-md mx-auto text-[10px] lg:text-lg hidden sm:block">
              Describe your mood, Taurus synthesizes the master.
            </p>

            <div className="flex flex-wrap justify-center gap-1 lg:gap-2 mt-1.5 lg:mt-8">
              {GENRES.map(g => (
                <button 
                  key={g} 
                  onClick={() => setSelectedGenre(g)}
                  className={`px-3 lg:px-6 py-1.5 lg:py-2 rounded-full text-[8.5px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${selectedGenre === g ? 'bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]' : 'bg-zinc-900 text-zinc-500 hover:text-white border border-zinc-800'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl lg:rounded-[2.5rem] p-1 lg:p-3 shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative z-10 flex flex-col min-h-0 mb-2 lg:mb-0">
            <div className="flex flex-col min-h-0">
              <div className="px-4 lg:px-10 pt-1.5 lg:pt-8 flex gap-3 lg:gap-6 shrink-0">
                <div className="flex-1">
                  <p className="text-[8px] lg:text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-0.5 lg:mb-3">Artist Gender/Style</p>
                  <select 
                    value={selectedVoice} 
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg lg:rounded-2xl p-1 lg:p-3 text-[9px] lg:text-xs text-white focus:ring-1 focus:ring-violet-500 outline-none"
                  >
                    <optgroup label="Male Voices" className="bg-zinc-900">
                      {VOICES.male.map(v => <option key={v} value={v}>{v}</option>)}
                    </optgroup>
                    <optgroup label="Female Voices" className="bg-zinc-900">
                      {VOICES.female.map(v => <option key={v} value={v}>{v}</option>)}
                    </optgroup>
                    <optgroup label="Collaborations" className="bg-zinc-900">
                      {VOICES.other.map(v => <option key={v} value={v}>{v}</option>)}
                    </optgroup>
                  </select>
                </div>
              </div>
              <textarea 
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="w-full bg-transparent p-4 lg:p-10 text-lg lg:text-3xl text-white placeholder-zinc-800 focus:outline-none resize-none h-24 lg:h-60 custom-scrollbar font-display leading-tight flex-1"
                placeholder="Ex. A power ballad with emotional female vocals about heartbreak..."
              ></textarea>
              
              <AnimatePresence>
                {optimizedPrompt && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mx-4 lg:mx-10 mb-4 lg:mb-6 p-4 lg:p-6 bg-violet-600/5 border border-violet-500/20 rounded-2xl lg:rounded-[2rem] group relative"
                  >
                    <div className="flex items-center justify-between mb-2 lg:mb-3">
                       <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-400">
                          <ShieldCheck size={12} /> Production Engineering
                       </div>
                       <button onClick={() => setOptimizedPrompt('')} className="text-zinc-600 hover:text-white transition-colors">×</button>
                    </div>
                    <p className="text-xs lg:text-sm text-zinc-400 leading-relaxed italic">"{optimizedPrompt}"</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col sm:flex-row items-center justify-between p-2 lg:p-8 border-t border-zinc-800/50 gap-4">
                <div className="flex gap-2 lg:gap-4 w-full sm:w-auto">
                  <button 
                    onClick={handleOptimize}
                    disabled={isOptimizing || !idea}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-2 lg:py-3 rounded-xl lg:rounded-2xl bg-zinc-900 group border border-zinc-800 text-[10px] lg:text-xs font-bold text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                  >
                    <Mic2 size={14} className="group-hover:text-violet-400 transition-colors" />
                    <span className="hidden xs:inline">{isOptimizing ? 'Analyzing...' : 'Gemini Auto-Enhance'}</span>
                    <span className="xs:hidden">Enhance</span>
                  </button>
                </div>
                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !idea}
                  className="w-full sm:w-auto px-6 lg:px-14 py-3 lg:py-5 rounded-xl lg:rounded-[2rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm lg:text-lg flex items-center justify-center gap-3 lg:gap-4 shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  <span>{isGenerating ? 'Synthesizing...' : 'Generate Symphony'}</span>
                  {isGenerating ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                       <RotateCcw size={18} />
                    </motion.div>
                  ) : <Sparkles size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Player Bar */}
      <AnimatePresence>
        {currentSong && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="fixed bottom-0 left-0 right-0 h-24 lg:h-32 bg-zinc-950/90 border-t border-zinc-800 flex items-center px-4 lg:px-12 z-[80] shadow-[0_-30px_60px_rgba(0,0,0,1)] backdrop-blur-3xl"
          >
            <div className="w-1/4 lg:w-1/3 flex items-center gap-3 lg:gap-6">
              <div className="w-12 h-12 lg:w-20 lg:h-20 bg-gradient-to-br from-indigo-600 to-fuchsia-900 rounded-xl lg:rounded-[1.5rem] shadow-2xl flex items-center justify-center shrink-0 border border-white/10 group overflow-hidden">
                <Music className="w-6 h-6 lg:w-10 lg:h-10 text-white/20 group-hover:scale-110 transition-transform" />
              </div>
              <div className="hidden sm:block overflow-hidden">
                <p className="text-sm lg:text-lg font-bold text-white truncate max-w-[150px] lg:max-w-[250px]">{currentSong.idea || 'Legacy Symphony'}</p>
                <div className="flex items-center gap-2 text-[10px] lg:text-xs text-zinc-500 font-medium">
                   <div className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-violet-500" />
                   Lyria Engine
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center max-w-xl">
              <div className="flex items-center gap-4 lg:gap-10 mb-2 lg:mb-4">
                <button 
                  onClick={() => setShowLyrics(!showLyrics)}
                  className={`p-2 lg:p-3 rounded-full transition-all ${showLyrics ? 'bg-violet-600 text-white shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
                >
                  <Quote size={16} />
                </button>
                <button 
                  onClick={togglePlay}
                  className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-2xl shadow-white/20"
                >
                  {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} className="pl-1" fill="currentColor" />}
                </button>
                <button 
                  onClick={() => { audio.currentTime = 0; }}
                  className="hidden xs:block p-2 lg:p-3 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                   <RotateCcw size={16} />
                </button>
              </div>
              
              <div className="w-full flex items-center gap-3 lg:gap-6">
                <span className="hidden xs:inline text-[10px] text-zinc-500 font-mono w-8 text-right opacity-60">
                  {formatTime(currentTime)}
                </span>
                <input 
                  type="range"
                  min="0"
                  max={duration || 60}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 lg:h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-violet-500"
                  style={{
                    background: `linear-gradient(to right, #8b5cf6 ${(currentTime / (duration || 60)) * 100}%, #27272a ${(currentTime / (duration || 60)) * 100}%)`
                  }}
                />
                <span className="hidden xs:inline text-[10px] text-zinc-500 font-mono w-8 opacity-60">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            <div className="w-1/4 lg:w-1/3 flex justify-end items-center gap-4 lg:gap-10">
              <div className="hidden lg:flex items-center gap-4 group">
                <Volume2 size={20} className="text-zinc-500 group-hover:text-white transition-colors" />
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue="1"
                  onChange={(e) => { audio.volume = parseFloat(e.target.value); }}
                  className="w-32 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-zinc-500 group-hover:accent-violet-500"
                />
              </div>
              <a 
                href={currentSong.audioUrl}
                download={`Taurus-${currentSong.id}.mp3`}
                className="p-3 lg:px-8 lg:py-4 rounded-xl lg:rounded-2xl bg-zinc-100 hover:bg-white text-black font-black text-sm transition-all shadow-xl active:scale-95 flex items-center gap-2"
              >
                <Download size={18} />
                <span className="hidden md:inline">Export MP3</span>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lyrics Overlay */}
      <AnimatePresence>
        {showLyrics && currentSong?.lyrics && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-x-4 bottom-28 lg:inset-auto lg:top-24 lg:right-12 lg:bottom-40 lg:w-96 max-h-[50vh] lg:max-h-none bg-zinc-900/95 backdrop-blur-3xl border border-zinc-800 rounded-3xl lg:rounded-[2.5rem] p-6 lg:p-10 z-[90] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4 lg:mb-8">
               <h3 className="text-[10px] lg:text-sm font-black text-violet-400 uppercase tracking-widest flex items-center gap-2">
                  <Quote size={14} /> AI Composition
               </h3>
               <button onClick={() => setShowLyrics(false)} className="text-zinc-500 hover:text-white text-xl lg:text-2xl transition-colors">×</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 lg:pr-4">
              <p className="text-sm lg:text-2xl font-display text-white italic leading-snug whitespace-pre-wrap">
                {currentSong.lyrics}
              </p>
            </div>
            <div className="hidden lg:block mt-8 pt-8 border-t border-zinc-800 opacity-50">
               <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Mastered by Taurus Core</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139,92,246,0.3);
        }

        input[type='range'] {
          -webkit-appearance: none;
          background: transparent;
        }

        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          margin-top: -4px;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }

        input[type='range']::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
