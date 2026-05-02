import React, { useState, useEffect, useRef } from 'react';
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
  X,
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
  MessageSquare,
  Smartphone,
  Send,
  Upload
} from 'lucide-react';
import ChatRoom from './components/ChatRoom';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  getUserProfile, 
  createUserProfile, 
  checkGenerationAccess,
  consumeGenerationCredit,
  requestManualPayment,
  approvePayment,
  rejectPayment,
  manualUpdateUser,
  claimDailyPointsIfNeeded,
  saveSong,
  uploadSongAudio,
  uploadPaymentProof,
  unbanUser,
  getBanUntilMillis,
  PLAN_CONFIGS,
  getEffectivePlanConfig,
  getPlanConfig,
  getTimestampMillis,
  isOwnerEmail,
  isOwnerProfile,
  isSubscriptionExpired,
  UserProfile,
  UserTier
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, limit, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface Song {
  id: string;
  idea: string;
  prompt: string;
  audioUrl: string;
  storagePath?: string;
  mimeType?: string;
  lyrics: string;
  createdAt: number;
}

const formatUsd = (value: number) => `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
const MMK_PER_USD = 4000;
const formatMmk = (usd: number) => `${(usd * MMK_PER_USD).toLocaleString()} MMK`;

const PLAN_CARD_STYLES = {
  free: {
    label: 'Free starter',
    borderClass: 'hover:border-zinc-500/50',
    textClass: 'group-hover:text-zinc-100',
    badgeClass: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
  },
  personal: {
    label: 'Starter creator',
    borderClass: 'hover:border-emerald-500/50',
    textClass: 'group-hover:text-emerald-400',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  pro: {
    label: 'Growing studio',
    borderClass: 'hover:border-blue-500/50',
    textClass: 'group-hover:text-blue-400',
    badgeClass: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  },
  prime: {
    label: 'High volume',
    borderClass: 'hover:border-violet-500/50',
    textClass: 'group-hover:text-violet-400',
    badgeClass: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  },
  premium: {
    label: 'Business scale',
    borderClass: 'hover:border-fuchsia-500/50',
    textClass: 'group-hover:text-fuchsia-400',
    badgeClass: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20',
  },
} satisfies Record<UserTier, {
  label: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
}>;

const buildPlanCard = (id: UserTier) => {
  const plan = PLAN_CONFIGS[id];
  const style = PLAN_CARD_STYLES[id];

  return {
    ...plan,
    ...style,
    priceLabel: plan.price === 0 ? 'Free' : formatUsd(plan.price),
    mmkPriceLabel: plan.price === 0 ? 'No payment needed' : formatMmk(plan.price),
    durationLabel: plan.price === 0 ? 'Always available' : plan.durationLabel,
  };
};

const PLAN_CARDS = (['free', 'personal', 'pro', 'prime', 'premium'] as UserTier[]).map(buildPlanCard);
const TIERS = (['personal', 'pro', 'prime', 'premium'] as UserTier[]).map(buildPlanCard);

const GENRE_OPTIONS = [
  { id: 'Neon Pulse', description: 'Modern high-energy Electronic/EDM with synth-wave elements' },
  { id: 'Golden Vibes', description: 'Acoustic, warm, and uplifting soulful atmosphere' },
  { id: 'Pop Essence', description: 'Polished modern top-40 Pop with commercial appeal' },
  { id: 'Urban Flow', description: 'Cloud Rap/Hip-hop with modern trap influence and deep bass' },
  { id: 'Rock Legacy', description: 'High-fidelity Alternative/Arena Rock with powerful guitars' },
];

const INSTRUMENT_OPTIONS = [
  { id: 'Guitar', description: 'expressive rhythm and lead guitar layers' },
  { id: 'Piano', description: 'emotional piano chords and melodic piano fills' },
  { id: 'Bass Boost', description: 'deep boosted bass with strong low-end impact' },
  { id: 'Violin', description: 'cinematic violin and string phrases' },
  { id: 'Drums', description: 'tight live drums with a clear groove' },
  { id: '808 Bass', description: 'modern 808 sub bass and trap bounce' },
  { id: 'Synth', description: 'wide synth pads and bright hooks' },
  { id: 'Myanmar Percussion', description: 'tasteful Myanmar percussion accents' },
];

const VOICES = {
  male: ['Male Edge', 'Male Deep', 'Male High', 'Male Soul', 'Male Smooth'],
  female: ['Female Eager', 'Female Soft', 'Female Power', 'Female Soul', 'Female Pop'],
  other: ['Duet/Pair']
};

const postJson = async <T,>(url: string, body: Record<string, unknown>): Promise<T> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please login with Gmail to continue.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed. Please try again.');
  }

  return payload as T;
};

const fileToBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => {
    const result = reader.result;
    if (typeof result !== 'string') {
      reject(new Error('Audio file could not be read.'));
      return;
    }
    resolve(result.split(',')[1] || '');
  };
  reader.onerror = () => reject(new Error('Audio file could not be read.'));
  reader.readAsDataURL(file);
});

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [idea, setIdea] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('Pop Essence');
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(['Piano', 'Bass Boost']);
  const [selectedVoice, setSelectedVoice] = useState('Duet/Pair');
  const [optimizedPrompt, setOptimizedPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isSoundChooserOpen, setIsSoundChooserOpen] = useState(false);
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
  const [showDailyReward, setShowDailyReward] = useState(false);
  const [selectedTier, setSelectedTier] = useState<UserTier>('personal');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newCredits, setNewCredits] = useState<number>(0);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const isOwnerUnlimited = isOwnerEmail(user?.email) || isOwnerProfile(profile);
  const accountBanUntil = getBanUntilMillis(profile);
  const isAccountBanned = !isOwnerUnlimited && accountBanUntil > Date.now();
  const subscriptionExpiresAt = getTimestampMillis(profile?.subscriptionExpiresAt);
  const subscriptionExpired = isSubscriptionExpired(profile);
  const activePlan = getEffectivePlanConfig(profile);
  const profileWeeklyLimit = subscriptionExpired ? activePlan.weeklyLimit : (profile?.weeklyLimit || activePlan.weeklyLimit);
  const profileMonthlyLimit = subscriptionExpired ? activePlan.monthlyLimit : (profile?.monthlyLimit || activePlan.monthlyLimit);
  const weeklyUsed = profile?.songsUsedThisWeek || 0;
  const monthlyUsed = profile?.songsUsedThisMonth || 0;
  const weeklyRemaining = Math.max(profileWeeklyLimit - weeklyUsed, 0);
  const monthlyRemaining = Math.max(profileMonthlyLimit - monthlyUsed, 0);
  const weeklyProgress = isOwnerUnlimited ? 100 : Math.min((weeklyUsed / profileWeeklyLimit) * 100, 100);
  const monthlyProgress = isOwnerUnlimited ? 100 : Math.min((monthlyUsed / profileMonthlyLimit) * 100, 100);
  const quotaName = isOwnerUnlimited ? 'Owner Unlimited' : `${activePlan.name} Quota`;
  const weeklyQuotaLabel = isOwnerUnlimited ? 'Unlimited' : `${weeklyRemaining} / ${profileWeeklyLimit} week`;
  const monthlyQuotaLabel = isOwnerUnlimited ? 'Unlimited' : `${monthlyRemaining} / ${profileMonthlyLimit}`;
  const needsVoiceUpgrade = !isOwnerUnlimited && (profile?.tier === 'free' || !profile?.tier);
  const isAdminUser = isOwnerUnlimited || profile?.role === 'admin';
  const selectedTierPlan = TIERS.find(tier => tier.id === selectedTier) || TIERS[0];
  const selectedInstrumentSummary = selectedInstruments.length > 0 ? selectedInstruments.join(', ') : 'Auto arrangement';
  const hasGenerationPrompt = Boolean((optimizedPrompt || idea).trim());
  const genreDescription = GENRE_OPTIONS.find(genre => genre.id === selectedGenre)?.description || selectedGenre;
  const arrangementDescription = selectedInstruments.length > 0
    ? INSTRUMENT_OPTIONS
        .filter(instrument => selectedInstruments.includes(instrument.id))
        .map(instrument => `${instrument.id}: ${instrument.description}`)
        .join('; ')
    : 'Let Taurus AI choose the best complete arrangement.';

  const toggleInstrument = (instrumentId: string) => {
    setSelectedInstruments(prev => (
      prev.includes(instrumentId)
        ? prev.filter(item => item !== instrumentId)
        : [...prev, instrumentId]
    ));
  };

  useEffect(() => {
    if (!profile || !isAdminUser || !showAdmin) return;
    const q = query(collection(db, 'users'), where('pendingPayment', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });
    return () => unsubscribe();
  }, [profile, isAdminUser, showAdmin]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      setUser(authUser);
      if (authUser) {
        let userProfile = await getUserProfile(authUser.uid);
        if (!userProfile) {
          userProfile = await createUserProfile(authUser.uid, authUser.email || '', authUser.displayName || '');
          setShowDailyReward(true);
        } else {
          const claimedProfile = await claimDailyPointsIfNeeded(authUser.uid, authUser.displayName || '');
          if (claimedProfile?.dailyRewardClaimed) {
            setShowDailyReward(true);
          }
        }

        unsubscribeProfile = onSnapshot(doc(db, 'users', authUser.uid), (snapshot) => {
          if (!snapshot.exists()) return;
          const liveProfile = snapshot.data() as UserProfile;
          setProfile(liveProfile);

          // Auto-open admin if path is /admin and user is admin
          if (window.location.pathname === '/admin' && (liveProfile.role === 'admin' || isOwnerEmail(liveProfile.email))) {
            setShowAdmin(true);
          }
        });
        
      } else {
        setProfile(null);
        setHistory([]);
      }
    });
    return () => {
      unsubscribe();
      unsubscribeProfile?.();
    };
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
          storagePath: data.storagePath,
          mimeType: data.mimeType,
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

  useEffect(() => {
    audio.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audio.removeAttribute('src');
    audio.load();
  }, [audio, currentSong?.id]);

  useEffect(() => {
    if (!voiceFile) {
      setVoicePreviewUrl('');
      return;
    }

    const previewUrl = URL.createObjectURL(voiceFile);
    setVoicePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [voiceFile]);

  useEffect(() => () => {
    if (voiceRecorderRef.current?.state === 'recording') {
      voiceRecorderRef.current.stop();
    }
    voiceStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

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

  const togglePlay = async () => {
    if (!currentSong) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    } else {
      if (!currentSong.audioUrl) {
        setError("Audio source is not available. Please generate the song again.");
        return;
      }
      
      try {
        if (audio.src !== currentSong.audioUrl) {
          audio.src = currentSong.audioUrl;
        }
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("Playback error:", err);
        setIsPlaying(false);
        const legacyMessage = currentSong.audioUrl.startsWith('blob:')
          ? "This older track was saved with a temporary browser audio link. Please generate it again to save it permanently."
          : "Audio playback failed. Please try again.";
        setError(legacyMessage);
      }
    }
  };

  const closePlayer = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setCurrentSong(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setShowLyrics(false);
  };

  const handleShareCurrentSong = async () => {
    if (!user || !currentSong) {
      setError("Please login and select a song first.");
      return;
    }

    if (isAccountBanned) {
      setError(`Account banned until ${new Date(accountBanUntil).toLocaleDateString()}. Please contact admin.`);
      return;
    }

    try {
      await setDoc(doc(collection(db, 'chatMessages')), {
        user: user.displayName || user.email?.split('@')[0] || 'Online user',
        text: `Shared song: ${currentSong.idea || 'Untitled Track'}`,
        userId: user.uid,
        isSongShare: true,
        songId: currentSong.id,
        songTitle: currentSong.idea || 'Untitled Track',
        songUrl: currentSong.audioUrl,
        songMimeType: currentSong.mimeType || 'audio/mpeg',
        timestamp: serverTimestamp(),
      });
      setShowChat(true);
    } catch (err: any) {
      console.error("Share Song Error:", err);
      setError(err.message || "Failed to send song to chat.");
    }
  };

  const stopVoiceStream = () => {
    voiceStreamRef.current?.getTracks().forEach(track => track.stop());
    voiceStreamRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (!user) {
      setError("Please login with Gmail to record voice.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("Voice recording is not supported in this browser. Upload an audio file instead.");
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const recorderOptions = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(voiceChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          setVoiceFile(new File([blob], `taurus-voice-${Date.now()}.webm`, { type: mimeType }));
        }
        setIsRecordingVoice(false);
        stopVoiceStream();
      };
      voiceRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
    } catch (err: any) {
      stopVoiceStream();
      setIsRecordingVoice(false);
      setError(err.message || "Microphone permission failed.");
    }
  };

  const stopVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const handleVoiceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setError("Please upload an audio file.");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setError("Voice reference must be under 12 MB.");
      return;
    }

    setError(null);
    setVoiceFile(file);
  };

  const handleAnalyzeVoice = async () => {
    if (!user) {
      setError("Please login with Gmail to use Voice Studio.");
      return;
    }
    if (!voiceFile) {
      setError("Record or upload your voice first.");
      return;
    }

    setIsAnalyzingVoice(true);
    setError(null);
    try {
      const audioBase64 = await fileToBase64(voiceFile);
      const response = await postJson<{ prompt: string }>('/api/analyze-voice', {
        audioBase64,
        mimeType: voiceFile.type || 'audio/webm',
        idea,
        genreDescription,
        arrangementDescription,
        voice: selectedVoice,
      });

      if (response.prompt) {
        setOptimizedPrompt(response.prompt);
        if (!idea.trim()) {
          setIdea('Voice reference studio arrangement');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze voice.');
    } finally {
      setIsAnalyzingVoice(false);
    }
  };

  const handleOptimize = async () => {
    if (!idea.trim()) return;
    if (!user) {
      setError("Please login with Gmail to enhance prompts.");
      return;
    }
    setIsOptimizing(true);
    setError(null);
    try {
      const response = await postJson<{ prompt: string }>('/api/optimize-prompt', { idea });
      if (response.prompt) {
        setOptimizedPrompt(response.prompt);
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

    if (isAccountBanned) {
      setError(`Account banned until ${new Date(accountBanUntil).toLocaleDateString()}. Please contact admin.`);
      return;
    }

    const finalPrompt = optimizedPrompt || idea;
    if (!finalPrompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    try {
      const access = await checkGenerationAccess(user.uid);
      if (!access.allowed) {
        if (access.mode === 'banned') {
          throw new Error("Your account is banned. Please contact admin.");
        }
        if (access.mode === 'points') {
          throw new Error("Daily points are not enough yet.");
        }
        setShowUpgrade(true);
        throw new Error(`Song limit reached. Weekly left: ${access.weeklyRemaining || 0}, monthly left: ${access.monthlyRemaining || 0}.`);
      }

      const generation = await postJson<{
        audioBase64: string;
        mimeType: string;
        lyrics: string;
      }>('/api/generate-song', {
        prompt: finalPrompt,
        genreDescription,
        arrangementDescription,
        voice: selectedVoice,
      });

      const { audioBase64, lyrics, mimeType } = generation;
      
      // Collect audio into blob - Force audio/mpeg as fallback if mimeType is unknown
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const safeMimeType = mimeType && mimeType !== "application/octet-stream" ? mimeType : "audio/mpeg";
      const blob = new Blob([bytes], { type: safeMimeType });
      const newSongId = Math.random().toString(36).substr(2, 9);
      const uploadedAudio = await uploadSongAudio(user.uid, newSongId, blob);
      const usage = await consumeGenerationCredit(user.uid);
      if (!usage.allowed) {
        if (usage.mode === 'banned') {
          throw new Error("Your account is banned. Please contact admin.");
        }
        if (usage.mode === 'points') {
          throw new Error("Daily points are not enough yet.");
        }
        setShowUpgrade(true);
        throw new Error("Song limit reached before saving. Please try again after refill.");
      }

      const newSong = {
        id: newSongId,
        idea,
        prompt: finalPrompt,
        audioUrl: uploadedAudio.audioUrl,
        storagePath: uploadedAudio.storagePath,
        mimeType: uploadedAudio.mimeType,
        lyrics: lyrics || "Lyrics not generated for this track.",
      };
      
      // Usage update locally
      setProfile(prev => {
        if (!prev) return null;
        if (usage.mode === 'owner') return prev;
        const plan = getEffectivePlanConfig(prev);
        const weeklyLimit = prev.weeklyLimit || plan.weeklyLimit;
        const monthlyLimit = prev.monthlyLimit || plan.monthlyLimit;
        return {
          ...prev,
          weeklyLimit,
          monthlyLimit,
          songsUsedThisWeek: weeklyLimit - (usage.weeklyRemaining ?? Math.max(weeklyLimit - ((prev.songsUsedThisWeek || 0) + 1), 0)),
          songsUsedThisMonth: monthlyLimit - (usage.monthlyRemaining ?? Math.max(monthlyLimit - ((prev.songsUsedThisMonth || 0) + 1), 0)),
        };
      });

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
    if (!paymentProofFile) {
      setError("Please upload the payment screenshot first.");
      return;
    }

    try {
      setIsPaymentSubmitting(true);
      const proof = await uploadPaymentProof(user.uid, paymentProofFile);
      await requestManualPayment(user.uid, selectedTier, proof);
      setShowPayment(false);
      setPaymentProofFile(null);
      setProfile(prev => prev ? {
        ...prev,
        pendingPayment: true,
        requestedTier: selectedTier,
        paymentStatus: 'pending',
        paymentProofUrl: proof.url,
        paymentProofPath: proof.path,
        paymentProofName: proof.name,
      } : null);
      alert(`Payment request sent for ${selectedTierPlan.name}. Please wait for manual approval.`);
    } catch (err: any) {
      setError(err.message || "Failed to submit payment proof.");
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handleApprove = async (userId: string, tier: string) => {
    await approvePayment(userId, tier);
    alert("User upgraded successfully!");
  };

  const handleRejectPayment = async (userId: string) => {
    await rejectPayment(userId);
    alert("Payment request rejected.");
  };

  const handleManualUpdate = async () => {
    if (!editingUser) return;
    try {
      await manualUpdateUser(editingUser.uid, { points: newCredits });
      alert("User points updated!");
      setEditingUser(prev => prev ? { ...prev, points: newCredits } : null);
      if (user?.uid === editingUser.uid) {
        setProfile(prev => prev ? { ...prev, points: newCredits } : null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to update points");
    }
  };

  const handleUnban = async () => {
    if (!editingUser) return;
    try {
      await unbanUser(editingUser.uid);
      alert("User unbanned.");
      setEditingUser(prev => prev ? {
        ...prev,
        chatBannedUntil: undefined,
        chatBanReason: '',
        chatViolationCount: 0,
      } : null);
    } catch (err: any) {
      setError(err.message || "Failed to unban user");
    }
  };

  const handleSearchUser = async () => {
    if (!searchEmail.trim()) return;
    const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim()), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data() as UserProfile;
        setEditingUser(userData);
        setNewCredits(userData.points || 0);
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
            isAdmin={isAdminUser}
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

      {/* Daily Reward Popup */}
      <AnimatePresence>
        {showDailyReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] bg-black/70 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.94, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 18 }}
              className="w-full max-w-sm rounded-[2rem] border border-amber-500/20 bg-zinc-900 p-6 shadow-2xl"
            >
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                <Sparkles size={12} /> Daily Login Ad Reward
              </div>
              <h3 className="text-3xl font-display font-black text-white">+10 Points</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Claimed for today. Song generation is controlled by your weekly and monthly plan limits.
              </p>
              <button
                onClick={() => setShowDailyReward(false)}
                className="mt-6 w-full rounded-2xl bg-white py-3 text-sm font-black text-black hover:bg-zinc-200 transition-colors"
              >
                Continue
              </button>
            </motion.div>
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
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-7xl p-6 sm:p-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar"
            >
              <div className="absolute top-0 right-0 p-6 sm:p-8">
                <button onClick={() => setShowUpgrade(false)} className="text-zinc-500 hover:text-white text-3xl sm:text-xl">&times;</button>
              </div>

              <div className="text-center mb-8 sm:mb-12 mt-4 sm:mt-0">
                <h2 className="text-3xl sm:text-4xl font-display font-bold mb-3 sm:mb-4 tracking-tight">Taurus Creator Plans</h2>
                <p className="text-zinc-500 max-w-2xl mx-auto text-sm sm:text-base">
                  More songs for every creator. Each plan includes weekly refill and monthly protection.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3 md:gap-5">
                {PLAN_CARDS.map(tier => (
                  <div key={tier.id} className={`p-5 md:p-6 rounded-2xl md:rounded-3xl border border-zinc-800 bg-zinc-900/30 flex flex-col group ${tier.borderClass} transition-all`}>
                    <div className={`mb-4 w-fit rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${tier.badgeClass}`}>
                      {tier.label}
                    </div>
                    <h3 className={`text-lg md:text-xl font-bold mb-1 ${tier.textClass} transition-colors`}>{tier.name}</h3>
                    <div className="text-3xl md:text-4xl font-display font-black">{tier.priceLabel}</div>
                    <div className="text-xs font-bold text-amber-300">{tier.mmkPriceLabel}</div>
                    <div className="mb-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">{tier.durationLabel} access</div>
                    <div className="space-y-2.5 mb-5 w-full text-xs text-zinc-400">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        <span>{tier.weeklyLimit} songs / week</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RotateCcw size={16} className="text-violet-400 shrink-0" />
                        <span>{tier.monthlyLimit} songs / month</span>
                      </div>
                    </div>
                    {tier.id === 'free' ? (
                      <button
                        disabled
                        className="mt-auto w-full py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-zinc-800 text-zinc-400 text-sm md:text-base font-bold cursor-default"
                      >
                        {profile?.tier === 'free' || subscriptionExpired ? 'Current Plan' : 'Included'}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedTier(tier.id);
                          setPaymentProofFile(null);
                          setShowPayment(true);
                        }}
                        className="mt-auto w-full py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-zinc-100 text-black text-sm md:text-base font-bold hover:bg-white transition-all"
                      >
                        Choose Plan
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-6 sm:mt-10 sm:pt-10 border-t border-zinc-800 flex flex-wrap justify-center gap-4 sm:gap-12 text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                <div className="flex items-center gap-2"><Wallet size={14} /> Crypto Payment</div>
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-lg w-full">
              <h3 className="text-2xl font-bold mb-2">Subscribe to {selectedTierPlan.name}</h3>
              <p className="text-zinc-400 text-sm mb-4">
                {selectedTierPlan.priceLabel} ({selectedTierPlan.mmkPriceLabel}) for {selectedTierPlan.durationLabel}. Includes {selectedTierPlan.weeklyLimit} songs/week and {selectedTierPlan.monthlyLimit} songs/month.
              </p>
              
              <div className="space-y-4 text-sm max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                
                {/* Global Payments (Stripe) */}
                <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700 hover:border-violet-500/50 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-white flex items-center gap-2">
                        <CreditCard size={18} className="text-violet-400" />
                        Apple Pay / Google Pay / Cards
                      </h4>
                      <p className="text-zinc-500 text-xs mt-1">Powered by Stripe Integration.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => alert('In a real app, this redirects to Stripe Checkout for Apple Pay & Google Pay.')}
                    className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 transition-colors"
                  >
                    Pay {selectedTierPlan.priceLabel} via Global Gateway
                  </button>
                </div>

                {/* Local Payments (Myanmar) */}
                <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                  <h4 className="font-bold text-white flex items-center gap-2 mb-4">
                    <Smartphone size={18} className="text-emerald-400" />
                    KPay / Wave Money
                  </h4>
                  <div className="space-y-3">
                    <div className="bg-black/50 p-3 rounded-xl border border-zinc-700/50">
                      <p className="text-zinc-400 text-xs mb-1">Transfer to</p>
                      <p className="font-bold text-white text-base">09989807081 (U Khant Ko Ko Hein)</p>
                      <p className="mt-2 text-xs font-bold text-amber-300">Amount: {selectedTierPlan.mmkPriceLabel}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">$1 = 4,000 MMK</p>
                    </div>
                    
                    <button 
                      onClick={() => alert('For Auto-System: Merchant APIs like 2C2P or direct KBZ/Wave APIs are required. Currently using manual verfication.')}
                      className="w-full py-2.5 flex items-center justify-center gap-2 rounded-xl bg-emerald-600/20 text-emerald-400 font-bold hover:bg-emerald-600/30 transition-colors"
                    >
                      <span>Pay via Auto-Checkout System</span>
                      <ShieldCheck size={14} />
                    </button>
                    
                    <div className="relative flex items-center py-2">
                      <div className="flex-grow border-t border-zinc-700"></div>
                      <span className="flex-shrink-0 mx-4 text-xs text-zinc-500 uppercase tracking-widest">or manual report</span>
                      <div className="flex-grow border-t border-zinc-700"></div>
                    </div>

                    <label className="block rounded-2xl border border-dashed border-zinc-700 bg-black/30 p-4 text-center cursor-pointer hover:border-violet-500/50 transition-colors">
                      <Upload size={18} className="mx-auto mb-2 text-violet-300" />
                      <span className="block text-xs font-bold text-white">
                        {paymentProofFile ? paymentProofFile.name : 'Upload payment screenshot'}
                      </span>
                      <span className="mt-1 block text-[10px] text-zinc-500">JPG / PNG / WebP screenshot required</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => setPaymentProofFile(event.target.files?.[0] || null)}
                      />
                    </label>

                    <button 
                      onClick={handleManualPayment}
                      disabled={isPaymentSubmitting}
                      className="w-full py-2.5 rounded-xl border border-zinc-700 font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                    >
                      {isPaymentSubmitting ? 'Submitting...' : `Report Manual Transfer for ${selectedTierPlan.name}`}
                    </button>
                  </div>
                </div>

                {/* Crypto Ton Payment */}
                <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                  <h4 className="font-bold text-white flex items-center gap-2 mb-4">
                    <Wallet size={18} className="text-blue-400" />
                    Crypto (USDT TON)
                  </h4>
                  <p className="font-mono text-zinc-300 text-xs bg-black/50 p-3 rounded-xl border border-zinc-700/50 select-all break-all text-center">
                    UQBnoZuLED2kPb3XBSWa5BaA6ZPTXZX00jETRbJRKbKBAItg
                  </p>
                </div>

              </div>

              <div className="mt-6 flex gap-4 pt-6 border-t border-zinc-800">
                <button 
                  onClick={() => {
                    setShowPayment(false);
                    setPaymentProofFile(null);
                  }}
                  className="flex-1 py-3 rounded-xl bg-zinc-800 font-bold hover:bg-zinc-700 text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 180, 360]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="w-24 h-24 mb-8 rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.5)]"
            >
              <Music size={40} className="text-white" />
            </motion.div>
            <h2 className="text-3xl lg:text-5xl font-display font-black text-white mb-4 tracking-tight">Synthesizing Symphony</h2>
            <p className="text-zinc-400 max-w-sm mx-auto">
              Our AI is currently composing your track and tuning the vocals. This usually takes around 30 to 60 seconds...
            </p>
            
            <div className="w-full max-w-md bg-zinc-900 h-2 mt-12 rounded-full overflow-hidden border border-zinc-800">
               <motion.div 
                 initial={{ width: "0%" }}
                 animate={{ width: "95%" }}
                 transition={{ duration: 45, ease: "easeOut" }}
                 className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
               />
            </div>
            <p className="mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest animate-pulse">Processing lyria-3-pro-preview</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Dashboard */}
      <AnimatePresence>
        {showAdmin && isAdminUser && (
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
                   <p className="text-zinc-500">Manage payments, user points, and bans.</p>
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
                              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-violet-300">
                                Requested: {getPlanConfig(u.requestedTier || 'personal').name} · {formatMmk(getPlanConfig(u.requestedTier || 'personal').price)} · {getPlanConfig(u.requestedTier || 'personal').durationLabel}
                              </p>
                              {u.paymentProofUrl && (
                                <a
                                  href={u.paymentProofUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-300 hover:bg-amber-500/20"
                                >
                                  <Upload size={12} /> View Screenshot
                                </a>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {TIERS.map(tier => (
                                <button
                                  key={tier.id}
                                  onClick={() => handleApprove(u.uid, tier.id)}
                                  className="flex-1 min-w-[74px] px-3 py-2 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg text-xs hover:bg-violet-600 hover:text-white transition-all"
                                >
                                  {tier.name}
                                </button>
                              ))}
                              <button
                                onClick={() => handleRejectPayment(u.uid)}
                                className="flex-1 min-w-[74px] px-3 py-2 bg-red-500/10 text-red-300 border border-red-500/20 rounded-lg text-xs hover:bg-red-600 hover:text-white transition-all"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Points and Ban Management */}
                <div className="flex flex-col min-h-0 bg-zinc-800/20 rounded-3xl p-6 border border-zinc-800">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <Users size={14} /> User Controls
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
                            <p className="text-xs text-zinc-500 capitalize">
                              {editingUser.tier} Plan · {editingUser.chatViolationCount || 0} strikes
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-black text-zinc-500 tracking-widest mb-2 block">User Points</label>
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
                              Save
                            </button>
                          </div>
                          <p className="text-[9px] text-zinc-600 mt-2 italic">Points are daily reward balance. Song creation is limited by plan quota.</p>
                        </div>

                        <div className="pt-4 grid grid-cols-2 gap-2">
                          <button onClick={() => setNewCredits(0)} className="py-2 rounded-lg bg-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors">Set 0 Points</button>
                          <button onClick={handleUnban} className="py-2 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors">Unban User</button>
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
        <div className="p-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Music className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
              Taurus Music
            </h1>
          </div>
        </div>

        <div className="px-6 mb-4 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Generation History ({history.length})</p>
        </div>
        
        <div className="px-6 space-y-1 overflow-y-auto flex-1 custom-scrollbar min-h-0">
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

        <div className="shrink-0 p-6 border-t border-zinc-800 space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
          {user ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-zinc-700" alt="Avatar" />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate w-24">{user.displayName}</p>
                    <p className={`text-[10px] font-black uppercase tracking-tighter ${isOwnerUnlimited || (profile?.tier !== 'free' && !subscriptionExpired) ? 'text-violet-400' : 'text-zinc-500'}`}>
                      {isOwnerUnlimited ? 'owner unlimited' : `${subscriptionExpired ? 'expired' : (profile?.tier || 'free')} plan`}
                    </p>
                  </div>
                </div>
                <button onClick={() => logout()} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-red-400 transition-colors">
                  <LogOut size={16} />
                </button>
              </div>

              {isAdminUser && (
                <button 
                  onClick={() => setShowAdmin(true)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck size={14} /> Admin Dashboard
                </button>
              )}

              <div className="bg-zinc-800/30 rounded-xl p-3 border border-zinc-700/30">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">{quotaName}</span>
                  <span className="text-[10px] font-bold text-violet-400">{weeklyQuotaLabel}</span>
                </div>
                <div className="w-full bg-zinc-950 h-1 rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ width: `${weeklyProgress}%` }}
                    className="bg-violet-500 h-full shadow-[0_0_10px_rgba(139,92,246,0.5)]" 
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-[9px] font-bold text-zinc-500">
                  <span>Monthly left</span>
                  <span className="font-mono text-zinc-300">{monthlyQuotaLabel}</span>
                </div>
                <div className="mt-1 w-full bg-zinc-950 h-1 rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ width: `${monthlyProgress}%` }}
                    className="bg-emerald-500 h-full shadow-[0_0_10px_rgba(16,185,129,0.35)]" 
                  />
                </div>
                <p className="text-[8px] text-zinc-600 mt-2 uppercase font-bold tracking-tighter">Daily reward: {profile?.points || 0} pts (+10/day)</p>
                {!isOwnerUnlimited && profile?.tier !== 'free' && subscriptionExpiresAt > 0 && (
                  <p className={`text-[8px] mt-2 uppercase font-bold tracking-tighter ${subscriptionExpired ? 'text-red-300' : 'text-violet-300'}`}>
                    {subscriptionExpired ? 'Expired' : `Expires ${new Date(subscriptionExpiresAt).toLocaleDateString()}`}
                  </p>
                )}
              </div>

              {isAccountBanned && (
                <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20 text-[10px] text-red-300 font-bold">
                  Account banned until {new Date(accountBanUntil).toLocaleDateString()}
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
            {profile?.tier !== 'free' && profile?.tier !== undefined ? 'Upgrade Plan' : 'View Plans'}
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
             {isAdminUser && (
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
          <div className="max-w-2xl w-full text-center mb-3 lg:mb-6 relative z-10 shrink-0">
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

          </div>

          <div className="relative z-20 mb-4 lg:mb-8 flex w-full max-w-4xl shrink-0 flex-col items-center gap-2 lg:gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/90 px-4 py-2 text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-zinc-300 shadow-lg shadow-black/30 transition-all hover:border-violet-500/40 hover:text-white"
            >
              <History size={13} />
              History
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[8px] text-zinc-400">{history.length}</span>
            </button>

            <div className="relative flex justify-center">
              <button
                type="button"
                onClick={() => setIsSoundChooserOpen(prev => !prev)}
                className="max-w-[92vw] rounded-full border border-violet-500/30 bg-violet-600 px-4 py-2 text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white shadow-[0_0_18px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500"
              >
                Choose Sound: {selectedGenre} · {selectedInstrumentSummary}
              </button>
              <AnimatePresence>
                {isSoundChooserOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    className="absolute top-11 z-30 w-[min(92vw,680px)] rounded-3xl border border-zinc-800 bg-zinc-950/95 p-4 text-left shadow-2xl backdrop-blur-xl"
                  >
                    <div className="mb-4">
                      <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Song Style</p>
                      <div className="flex flex-wrap gap-2">
                        {GENRE_OPTIONS.map(genre => (
                          <button
                            key={genre.id}
                            type="button"
                            onClick={() => setSelectedGenre(genre.id)}
                            className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${selectedGenre === genre.id ? 'bg-violet-600 text-white' : 'border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-white'}`}
                          >
                            {genre.id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Instruments / Mix</p>
                      <div className="flex flex-wrap gap-2">
                        {INSTRUMENT_OPTIONS.map(instrument => (
                          <button
                            key={instrument.id}
                            type="button"
                            onClick={() => toggleInstrument(instrument.id)}
                            className={`rounded-full px-3 py-2 text-[10px] font-black transition-all ${selectedInstruments.includes(instrument.id) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-white'}`}
                          >
                            {instrument.id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSoundChooserOpen(false)}
                      className="mt-4 w-full rounded-2xl bg-white py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-zinc-200 transition-colors"
                    >
                      Done
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl lg:rounded-[2.5rem] p-1 lg:p-3 shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative z-10 flex flex-col min-h-0 mb-2 lg:mb-0">
            <div className="flex flex-col min-h-0">
              <div className="px-4 lg:px-10 pt-1.5 lg:pt-8 flex gap-3 lg:gap-6 shrink-0">
                <div className="flex-1">
                  <p className="text-[8px] lg:text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-0.5 lg:mb-3">Artist Gender/Style</p>
                  <select 
                    value={selectedVoice} 
                    onChange={(e) => {
                      const isFreeUser = needsVoiceUpgrade;
                      if (isFreeUser && e.target.value !== 'Duet/Pair') {
                        setShowUpgrade(true);
                      } else {
                        setSelectedVoice(e.target.value);
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg lg:rounded-2xl p-1 lg:p-3 text-[9px] lg:text-xs text-white focus:ring-1 focus:ring-violet-500 outline-none"
                  >
                    <optgroup label={`Male Voices ${needsVoiceUpgrade ? '🔒 (Upgrade)' : ''}`} className={`bg-zinc-900 ${needsVoiceUpgrade ? 'text-zinc-500' : 'text-white'}`}>
                      {VOICES.male.map(v => <option key={v} value={v}>{v}</option>)}
                    </optgroup>
                    <optgroup label={`Female Voices ${needsVoiceUpgrade ? '🔒 (Upgrade)' : ''}`} className={`bg-zinc-900 ${needsVoiceUpgrade ? 'text-zinc-500' : 'text-white'}`}>
                      {VOICES.female.map(v => <option key={v} value={v}>{v}</option>)}
                    </optgroup>
                    <optgroup label="Collaborations" className="bg-zinc-900 text-white">
                      {VOICES.other.map(v => <option key={v} value={v}>{v}</option>)}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="mx-4 lg:mx-10 mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/55 p-3 lg:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-violet-300">Voice Studio</p>
                    <p className="truncate text-[10px] text-zinc-500">{voiceFile ? voiceFile.name : 'Record or upload vocal reference'}</p>
                  </div>
                  {voicePreviewUrl && (
                    <button
                      type="button"
                      onClick={() => setVoiceFile(null)}
                      className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                      title="Remove voice reference"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {voicePreviewUrl && (
                  <audio controls src={voicePreviewUrl} className="mb-3 h-8 w-full" />
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
                    disabled={isAnalyzingVoice}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${isRecordingVoice ? 'border-red-500/30 bg-red-500/15 text-red-200' : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'}`}
                  >
                    <Mic2 size={14} />
                    {isRecordingVoice ? 'Stop' : 'Record'}
                  </button>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-300 transition-all hover:text-white">
                    <Upload size={14} />
                    Upload
                    <input type="file" accept="audio/*" onChange={handleVoiceFileChange} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={handleAnalyzeVoice}
                    disabled={!voiceFile || isAnalyzingVoice || isRecordingVoice}
                    className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-violet-500 disabled:opacity-50"
                  >
                    {isAnalyzingVoice ? <RotateCcw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {isAnalyzingVoice ? 'Analyzing' : 'Make Studio Prompt'}
                  </button>
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
                    disabled={isOptimizing || !idea || isAccountBanned}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-2 lg:py-3 rounded-xl lg:rounded-2xl bg-zinc-900 group border border-zinc-800 text-[10px] lg:text-xs font-bold text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                  >
                    <Mic2 size={14} className="group-hover:text-violet-400 transition-colors" />
                    <span className="hidden xs:inline">{isOptimizing ? 'Analyzing...' : 'Gemini Auto-Enhance'}</span>
                    <span className="xs:hidden">Enhance</span>
                  </button>
                </div>
                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !hasGenerationPrompt || isAccountBanned}
                  className="w-full sm:w-auto px-6 lg:px-14 py-3 lg:py-5 rounded-xl lg:rounded-[2rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm lg:text-lg flex items-center justify-center gap-3 lg:gap-4 shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  <span>{isAccountBanned ? 'Account Banned' : isGenerating ? 'Synthesizing...' : 'Generate Symphony'}</span>
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
            <div className="w-auto lg:w-1/3 flex items-center gap-3 lg:gap-6">
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

            <div className="flex-1 min-w-0 flex flex-col items-center max-w-xl">
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

            <div className="shrink-0 lg:w-1/3 flex justify-end items-center gap-2 lg:gap-4">
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
              <button
                type="button"
                onClick={handleShareCurrentSong}
                title="Send to Chat"
                className="p-3 lg:px-5 lg:py-4 rounded-xl lg:rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-violet-600/20 hover:border-violet-500/30 font-black text-sm transition-all active:scale-95 flex items-center gap-2"
              >
                <Send size={18} />
                <span className="hidden xl:inline">Send to Chat</span>
              </button>
              <a 
                href={currentSong.audioUrl}
                download={`Taurus-${currentSong.id}.mp3`}
                className="p-3 lg:px-5 xl:px-8 lg:py-4 rounded-xl lg:rounded-2xl bg-zinc-100 hover:bg-white text-black font-black text-sm transition-all shadow-xl active:scale-95 flex items-center gap-2"
              >
                <Download size={18} />
                <span className="hidden md:inline">Export MP3</span>
              </a>
              <button
                type="button"
                onClick={closePlayer}
                title="Close player"
                className="p-3 lg:p-4 rounded-xl lg:rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-red-500/10 hover:border-red-500/30 transition-all active:scale-95"
              >
                <X size={18} />
              </button>
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
