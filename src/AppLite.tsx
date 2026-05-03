import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Clock3, CreditCard, Download, History, Loader2, LogOut, Music, Pause, Play, Search, Settings, Sparkles, Upload, User as UserIcon, Wallet } from 'lucide-react';
import {
  auth,
  db,
  signInWithGoogle,
  logout,
  getUserProfile,
  createUserProfile,
  claimDailyPointsIfNeeded,
  consumeGenerationCredit,
  requestManualPayment,
  approvePayment,
  rejectPayment,
  saveSong,
  uploadSongAudio,
  uploadPaymentProof,
  getEffectivePlanConfig,
  getTimestampMillis,
  isOwnerEmail,
  isOwnerProfile,
  isSubscriptionExpired,
  PLAN_CONFIGS,
  UserProfile,
  UserTier,
} from './firebase';

interface Song {
  id: string;
  userId?: string;
  idea: string;
  prompt: string;
  audioUrl: string;
  storagePath?: string;
  mimeType?: string;
  lyrics: string;
  createdAt: number;
}

type GenerateResponse = {
  audioBase64: string;
  mimeType?: string;
  lyrics?: string;
  model?: string;
};

const GENRES = ['Rap', 'Motivation Song', 'Chill Motivation', 'Pop', 'Hip-hop', 'Cinematic', 'Myanmar Style'];
const MOODS = ['Motivation', 'Chill', 'Romantic', 'Sad', 'Epic'];
const VOICE_TYPES = ['Deep Voice', 'Cold Voice', 'Warm Voice', 'Soft Voice', 'Power Voice'];
const SINGERS = ['Male', 'Female', 'Duet'];
const LANGUAGES = ['Burmese', 'English', 'Burmese + English'];
const STRUCTURES = [
  'Verse - Chorus - Verse - Chorus - Bridge - Chorus',
  'Intro - Verse - Hook - Verse - Hook - Outro',
  'Intro - Verse - Chorus - Bridge - Final Chorus - Outro',
  'Rap Intro - Verse 1 - Hook - Verse 2 - Hook - Outro',
];

const PAYMENT_PACKAGES: Array<{ id: UserTier; title: string; credits: string; price: string; note: string }> = [
  { id: 'personal', title: 'Top Up 50', credits: '50 credits', price: '15,000 MMK', note: 'Manual admin confirm' },
  { id: 'pro', title: 'Top Up 100', credits: '100 credits', price: '27,000 MMK', note: 'Best starter pack' },
  { id: 'prime', title: 'Top Up 300', credits: '300 credits', price: '69,000 MMK', note: 'High volume pack' },
  { id: 'premium', title: 'Premium', credits: '150 credits / month', price: '39,000 MMK', note: 'Launch price' },
];

const postJson = async <T,>(url: string, body: Record<string, unknown>): Promise<T> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please login with Gmail to continue.');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed. Please try again.');
  return payload as T;
};

const audioBase64ToBlob = (audioBase64: string, mimeType?: string) => {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType && mimeType !== 'application/octet-stream' ? mimeType : 'audio/mpeg' });
};

const formatDate = (value: number) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);

const buildProductionPrompt = (settings: {
  idea: string;
  lyrics: string;
  genre: string;
  mood: string;
  voiceType: string;
  singerType: string;
  language: string;
  bpm: number;
  structure: string;
  variant: string;
}) => {
  return [
    `Create a full original 3-minute ${settings.language} ${settings.genre} track for Taurus - Your Music Agent.`,
    `Core idea: ${settings.idea}.`,
    `Mood: ${settings.mood}. Vocal: ${settings.voiceType}. Singer mode: ${settings.singerType}. BPM: ${settings.bpm}.`,
    `Structure: ${settings.structure}. Target duration: about 3 minutes, complete ending, not a short demo.`,
    `Version direction: ${settings.variant}.`,
    'Beat quality rules: punchy modern drums, deep 808 bass, tight snare, clean kick, wide stereo image, no muddy bass, no weak drums.',
    'Harmony quality rules: rich emotional chord progression, cinematic piano or pads when appropriate, layered harmonies, strong chorus lift, no flat chorus.',
    'Vocal quality rules: clear lead vocal, confident tone, natural phrasing, premium master, emotional delivery, no robotic artifacts.',
    settings.lyrics.trim() ? `Use these lyrics naturally and improve flow only where needed: ${settings.lyrics}` : 'Write original lyrics with a memorable hook and clean structure.',
  ].join(' ');
};

export default function AppLite() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<Song[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedTier, setSelectedTier] = useState<UserTier>('premium');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [idea, setIdea] = useState('3-minute Burmese motivational rap about never giving up, deep male voice, punchy drums, cinematic piano.');
  const [lyrics, setLyrics] = useState('');
  const [genre, setGenre] = useState('Rap');
  const [mood, setMood] = useState('Motivation');
  const [voiceType, setVoiceType] = useState('Deep Voice');
  const [singerType, setSingerType] = useState('Male');
  const [language, setLanguage] = useState('Burmese');
  const [bpm, setBpm] = useState(120);
  const [structure, setStructure] = useState(STRUCTURES[3]);

  const audioRef = useRef(new Audio());

  const isOwnerUnlimited = isOwnerEmail(user?.email) || isOwnerProfile(profile);
  const subscriptionExpired = isSubscriptionExpired(profile);
  const activePlan = getEffectivePlanConfig(profile);
  const planName = isOwnerUnlimited ? 'Owner Unlimited' : activePlan.name;
  const monthlyLimit = subscriptionExpired ? activePlan.monthlyLimit : (profile?.monthlyLimit || activePlan.monthlyLimit);
  const monthlyUsed = profile?.songsUsedThisMonth || 0;
  const dailyUsed = profile?.dailyGenerationCount || 0;
  const creditsLeft = isOwnerUnlimited ? 'Unlimited' : String(Math.max(monthlyLimit - monthlyUsed, 0));
  const dailyLeft = isOwnerUnlimited ? 'Unlimited' : activePlan.id === 'free' ? String(Math.max(5 - dailyUsed, 0)) : 'No daily cap';
  const isAdminUser = isOwnerUnlimited || profile?.role === 'admin';

  const filteredHistory = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return history;
    return history.filter(song => `${song.idea} ${song.prompt} ${song.lyrics}`.toLowerCase().includes(needle));
  }, [history, searchText]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      unsubscribeProfile?.();
      setUser(authUser);
      if (!authUser) {
        setProfile(null);
        setHistory([]);
        return;
      }
      const existingProfile = await getUserProfile(authUser.uid);
      if (!existingProfile) await createUserProfile(authUser.uid, authUser.email || '', authUser.displayName || '');
      else await claimDailyPointsIfNeeded(authUser.uid, authUser.displayName || '');

      unsubscribeProfile = onSnapshot(doc(db, 'users', authUser.uid), (snapshot) => {
        if (snapshot.exists()) {
          const liveProfile = snapshot.data() as UserProfile;
          setProfile(liveProfile);
          if (window.location.pathname === '/admin' && (liveProfile.role === 'admin' || isOwnerEmail(liveProfile.email))) setShowAdmin(true);
        }
      });
    });
    return () => {
      unsubscribe();
      unsubscribeProfile?.();
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'users', user.uid, 'songs'), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map((songDoc) => {
        const data = songDoc.data();
        return {
          id: songDoc.id,
          userId: data.userId || user.uid,
          idea: data.idea || 'Untitled Track',
          prompt: data.prompt || '',
          audioUrl: data.audioUrl || '',
          storagePath: data.storagePath,
          mimeType: data.mimeType || 'audio/mpeg',
          lyrics: data.lyrics || '',
          createdAt: data.createdAt?.toMillis?.() || Date.now(),
        } as Song;
      }));
    });
  }, [user]);

  useEffect(() => {
    if (!profile || !isAdminUser || !showAdmin) return undefined;
    const q = query(collection(db, 'users'), where('pendingPayment', '==', true));
    return onSnapshot(q, snapshot => setPendingUsers(snapshot.docs.map(item => item.data() as UserProfile)));
  }, [profile, isAdminUser, showAdmin]);

  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, []);

  const playSong = async (song: Song) => {
    if (!song.audioUrl) {
      setError('Audio URL missing for this song.');
      return;
    }
    const audio = audioRef.current;
    if (currentSong?.id === song.id && isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    setCurrentSong(song);
    audio.src = song.audioUrl;
    await audio.play();
    setIsPlaying(true);
  };

  const downloadSong = (song: Song) => {
    const link = document.createElement('a');
    link.href = song.audioUrl;
    link.download = `${song.idea || 'taurus-song'}.mp3`.replace(/[^a-z0-9._-]+/gi, '-');
    link.click();
  };

  const handleGenerate = async () => {
    if (!user) {
      setError('Please login with Gmail first.');
      return;
    }
    if (!idea.trim() && !lyrics.trim()) {
      setError('Add a song idea or lyrics first.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      setProgress('Checking credits for 2 songs...');
      const usage = await consumeGenerationCredit(user.uid, 2);
      if (!usage.allowed) {
        throw new Error(`Not enough credits. Remaining: ${usage.remaining}. Free users can use up to 5 credits per day from the 10 starter credits.`);
      }

      const variants = ['Version A: polished radio master with strong hook', 'Version B: colder, deeper, more cinematic alternate take'];
      for (let index = 0; index < variants.length; index += 1) {
        const variant = variants[index];
        setProgress(`Generating ${index + 1}/2: ${variant.split(':')[0]}...`);
        const compiledPrompt = buildProductionPrompt({ idea, lyrics, genre, mood, voiceType, singerType, language, bpm, structure, variant });
        const response = await postJson<GenerateResponse>('/api/generate-song', {
          prompt: compiledPrompt,
          genreDescription: `${genre}, ${mood}, ${language}, ${bpm} BPM`,
          arrangementDescription: 'Punchy drums, deep 808 bass, cinematic piano, rich harmony, wide stereo master, strong chorus lift.',
          modelProfile: 'Taurus Apex L5 professional 3-minute studio quality recipe using the existing Gemini/Lyria key.',
          lyricsText: lyrics,
          lyricsMode: lyrics.trim() ? 'manual' : 'auto',
          instrumental: false,
          styleText: `${mood}, ${voiceType}, ${singerType}, 3-minute, premium beat, rich harmony`,
          artistName: '',
          weirdness: 42,
          styleInfluence: 68,
          durationMode: 'full',
          variantLabel: variant,
          voice: `${singerType} ${voiceType}`,
        });

        setProgress(`Saving ${index + 1}/2 to song history...`);
        const blob = audioBase64ToBlob(response.audioBase64, response.mimeType);
        const songId = `${Date.now()}-${index + 1}`;
        const uploaded = await uploadSongAudio(user.uid, songId, blob);
        const song: Song = {
          id: songId,
          userId: user.uid,
          idea: `${idea.slice(0, 80) || genre} (${index === 0 ? 'Version A' : 'Version B'})`,
          prompt: compiledPrompt,
          audioUrl: uploaded.audioUrl,
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          lyrics: response.lyrics || lyrics || 'Lyrics generated with Taurus.',
          createdAt: Date.now(),
        };
        await saveSong(user.uid, song);
        if (index === 0) setCurrentSong(song);
      }
      setProgress('Done. 2 songs saved to history.');
    } catch (err: any) {
      setError(err.message || 'Generation failed. Please try again.');
      setProgress('Failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const submitPayment = async () => {
    if (!user) {
      setError('Please login first.');
      return;
    }
    setIsPaymentSubmitting(true);
    setError(null);
    try {
      let proof: { url: string; path: string; name: string } | undefined;
      if (paymentProofFile) proof = await uploadPaymentProof(user.uid, paymentProofFile);
      await requestManualPayment(user.uid, selectedTier, proof);
      setProgress('Payment request submitted. Admin will confirm manually.');
    } catch (err: any) {
      setError(err.message || 'Payment request failed.');
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const selectOption = (items: string[], value: string, onChange: (value: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded-2xl border px-3 py-2 text-sm transition ${value === item ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'}`}
        >
          {item}
        </button>
      ))}
    </div>
  );

  const planExpiry = getTimestampMillis(profile?.subscriptionExpiresAt);

  return (
    <div className="min-h-screen bg-[#080812] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute right-10 top-24 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-white/[0.03] p-6 lg:block">
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/20 text-violet-200"><Music /></div>
              <div>
                <h1 className="font-display text-xl font-bold">Taurus</h1>
                <p className="text-xs text-zinc-400">Your Music Agent</p>
              </div>
            </div>
          </div>
          <nav className="space-y-2 text-sm">
            {['Create', 'Song History', 'Wallet', 'Plans'].map(item => <div key={item} className="rounded-2xl bg-white/[0.04] px-4 py-3 text-zinc-300">{item}</div>)}
            {isAdminUser && <button onClick={() => setShowAdmin(true)} className="w-full rounded-2xl bg-violet-500/20 px-4 py-3 text-left text-violet-200">Admin Central</button>}
          </nav>
          <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Plan</p>
            <p className="mt-2 text-lg font-semibold">{planName}</p>
            <p className="mt-1 text-sm text-zinc-400">Credits: {creditsLeft}</p>
            <p className="text-sm text-zinc-400">Daily: {dailyLeft}</p>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search songs or history..." className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 outline-none ring-violet-500/30 focus:ring-4" />
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm"><Wallet className="mr-2 inline h-4 w-4 text-violet-300" />{creditsLeft} credits</div>
              {user ? (
                <button onClick={logout} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-zinc-300 hover:text-white"><LogOut className="mr-2 inline h-4 w-4" />Logout</button>
              ) : (
                <button onClick={signInWithGoogle} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950"><UserIcon className="mr-2 inline h-4 w-4" />Login with Gmail</button>
              )}
            </div>
          </header>

          {error && <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}

          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <section className="space-y-6">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.35em] text-violet-300">AI Song Studio</p>
                    <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Create songs your way</h2>
                    <p className="mt-3 max-w-2xl text-zinc-400">Prompt, lyrics, voice, BPM and structure are compiled into a Taurus production recipe for two full songs.</p>
                  </div>
                  <div className="rounded-2xl bg-violet-500/15 px-4 py-3 text-sm text-violet-100">2 songs = 2 credits</div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-300">Song Idea / Prompt</span>
                    <textarea value={idea} onChange={event => setIdea(event.target.value.slice(0, 1000))} rows={7} className="w-full resize-none rounded-3xl border border-white/10 bg-black/30 p-4 outline-none ring-violet-500/20 focus:ring-4" placeholder="Type your song idea here..." />
                    <span className="mt-1 block text-right text-xs text-zinc-500">{idea.length} / 1000</span>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-300">Lyrics (Optional)</span>
                    <textarea value={lyrics} onChange={event => setLyrics(event.target.value.slice(0, 4000))} rows={7} className="w-full resize-none rounded-3xl border border-white/10 bg-black/30 p-4 outline-none ring-violet-500/20 focus:ring-4" placeholder="Enter your lyrics here..." />
                    <span className="mt-1 block text-right text-xs text-zinc-500">{lyrics.length} / 4000</span>
                  </label>
                </div>

                <div className="mt-6 grid gap-5">
                  <div><p className="mb-2 text-sm font-medium text-zinc-300">Genre</p>{selectOption(GENRES, genre, setGenre)}</div>
                  <div><p className="mb-2 text-sm font-medium text-zinc-300">Mood</p>{selectOption(MOODS, mood, setMood)}</div>
                  <div><p className="mb-2 text-sm font-medium text-zinc-300">Voice Type</p>{selectOption(VOICE_TYPES, voiceType, setVoiceType)}</div>
                  <div><p className="mb-2 text-sm font-medium text-zinc-300">Singer Type</p>{selectOption(SINGERS, singerType, setSingerType)}</div>
                  <div><p className="mb-2 text-sm font-medium text-zinc-300">Language</p>{selectOption(LANGUAGES, language, setLanguage)}</div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-300">BPM: {bpm}</span>
                    <input type="range" min="60" max="200" value={bpm} onChange={event => setBpm(Number(event.target.value))} className="w-full accent-violet-500" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-300">Structure</span>
                    <select value={structure} onChange={event => setStructure(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none">
                      {STRUCTURES.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button onClick={handleGenerate} disabled={isGenerating || !user} className="rounded-3xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 font-semibold text-white shadow-lg shadow-violet-950/40 disabled:cursor-not-allowed disabled:opacity-50">
                    {isGenerating ? <Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 inline h-5 w-5" />}
                    Generate 2 Songs
                  </button>
                  <p className="text-sm text-zinc-400">{progress}</p>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-2xl font-bold"><History className="mr-2 inline h-5 w-5 text-violet-300" />Song History</h3>
                  <span className="text-sm text-zinc-500">{filteredHistory.length} songs</span>
                </div>
                <div className="grid gap-3">
                  {filteredHistory.length === 0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-400">No songs yet. Generate 2 songs to start your library.</p>}
                  {filteredHistory.map(song => (
                    <div key={song.id} className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">{song.idea}</p>
                        <p className="text-xs text-zinc-500">{formatDate(song.createdAt)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => playSong(song)} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950">{currentSong?.id === song.id && isPlaying ? <Pause className="inline h-4 w-4" /> : <Play className="inline h-4 w-4" />}</button>
                        <button onClick={() => downloadSong(song)} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300"><Download className="inline h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <h3 className="font-display text-2xl font-bold"><Wallet className="mr-2 inline h-5 w-5 text-violet-300" />Taurus Wallet</h3>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-black/25 p-4"><p className="text-xs text-zinc-500">Credits</p><p className="mt-1 text-2xl font-bold">{creditsLeft}</p></div>
                  <div className="rounded-3xl bg-black/25 p-4"><p className="text-xs text-zinc-500">Daily Free</p><p className="mt-1 text-2xl font-bold">{dailyLeft}</p></div>
                </div>
                <p className="mt-4 text-sm text-zinc-400">Free gives 10 starter credits with 5 credits max per day. Premium gives 150 credits per month.</p>
                {planExpiry > 0 && <p className="mt-2 text-xs text-zinc-500">Plan expires: {formatDate(planExpiry)}</p>}
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <h3 className="font-display text-2xl font-bold"><CreditCard className="mr-2 inline h-5 w-5 text-violet-300" />Plans & Manual Payment</h3>
                <div className="mt-4 grid gap-3">
                  {PAYMENT_PACKAGES.map(pack => (
                    <button key={pack.id} onClick={() => setSelectedTier(pack.id)} className={`rounded-3xl border p-4 text-left transition ${selectedTier === pack.id ? 'border-violet-400 bg-violet-500/15' : 'border-white/10 bg-black/20'}`}>
                      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{pack.title}</p><p className="text-sm text-zinc-400">{pack.credits}</p></div><p className="font-semibold text-violet-200">{pack.price}</p></div>
                      <p className="mt-1 text-xs text-zinc-500">{pack.note}</p>
                    </button>
                  ))}
                </div>
                <label className="mt-4 block rounded-3xl border border-dashed border-white/15 p-4 text-sm text-zinc-400">
                  <Upload className="mr-2 inline h-4 w-4" />Upload receipt, not card number/CVV
                  <input type="file" accept="image/*" onChange={event => setPaymentProofFile(event.target.files?.[0] || null)} className="mt-3 block w-full text-xs" />
                </label>
                <button onClick={submitPayment} disabled={!user || isPaymentSubmitting} className="mt-4 w-full rounded-3xl bg-white px-5 py-3 font-semibold text-zinc-950 disabled:opacity-50">
                  {isPaymentSubmitting ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 inline h-4 w-4" />}
                  Submit for Admin Confirm
                </button>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <h3 className="font-display text-xl font-bold">Recent Songs</h3>
                <div className="mt-4 space-y-3">
                  {history.slice(0, 4).map(song => <button key={song.id} onClick={() => playSong(song)} className="w-full rounded-2xl bg-black/20 p-3 text-left text-sm hover:bg-white/[0.06]"><p className="truncate font-medium">{song.idea}</p><p className="text-xs text-zinc-500">{formatDate(song.createdAt)}</p></button>)}
                  {history.length === 0 && <p className="text-sm text-zinc-500">Your generated tracks will appear here.</p>}
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>

      {showAdmin && isAdminUser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[2rem] border border-white/10 bg-[#0c0c18] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold"><Settings className="mr-2 inline h-5 w-5 text-violet-300" />Admin Central</h2>
              <button onClick={() => setShowAdmin(false)} className="rounded-2xl border border-white/10 px-4 py-2 text-sm">Close</button>
            </div>
            <div className="grid gap-3">
              {pendingUsers.length === 0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-400"><Clock3 className="mr-2 inline h-4 w-4" />No pending payment approvals.</p>}
              {pendingUsers.map(item => (
                <div key={item.uid} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold">{item.email}</p>
                      <p className="text-sm text-zinc-400">Requested: {PLAN_CONFIGS[item.requestedTier || 'premium']?.name || item.requestedTier}</p>
                      {item.paymentProofUrl && <a href={item.paymentProofUrl} target="_blank" rel="noreferrer" className="text-sm text-violet-300 underline">View payment proof</a>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approvePayment(item.uid, item.requestedTier || 'premium')} className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white">Approve</button>
                      <button onClick={() => rejectPayment(item.uid, 'Receipt not confirmed')} className="rounded-2xl bg-red-500 px-4 py-2 text-sm font-semibold text-white">Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
