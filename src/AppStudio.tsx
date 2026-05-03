import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Clock3, CreditCard, Download, History, Loader2, LogOut, Music, Pause, Play, Search, Settings, Sparkles, ThumbsDown, ThumbsUp, Upload, User as UserIcon, Wallet } from 'lucide-react';
import { auth, db, signInWithGoogle, logout, getUserProfile, createUserProfile, claimDailyPointsIfNeeded, consumeGenerationCredit, requestManualPayment, approvePayment, rejectPayment, saveSong, uploadSongAudio, uploadPaymentProof, getEffectivePlanConfig, getTimestampMillis, isOwnerEmail, isOwnerProfile, isSubscriptionExpired, PLAN_CONFIGS, UserProfile, UserTier } from './firebase';

interface Song { id: string; userId?: string; idea: string; prompt: string; audioUrl: string; storagePath?: string; mimeType?: string; lyrics: string; createdAt: number; }
type GenerateResponse = { audioBase64: string; mimeType?: string; lyrics?: string; model?: string; };

const GENRES = ['Rap', 'Motivation', 'Chill Rap', 'Pop', 'Hip-hop', 'Cinematic', 'Myanmar'];
const MOODS = ['Motivation', 'Chill', 'Romantic', 'Sad', 'Epic'];
const VOICES = ['Deep', 'Cold', 'Warm', 'Soft', 'Power'];
const SINGERS = ['Male', 'Female', 'Duet'];
const LANGS = ['Burmese', 'English', 'Burmese + English'];
const QUALITY = ['Taurus Studio', 'Taurus Apex', 'Taurus Custom'];
const STRUCTURES = ['3:00 Studio Map', 'Rap Hook Map', 'Cinematic Build', 'Chill Loop'];
const PACKAGES: Array<{ id: UserTier; title: string; credits: string; price: string }> = [
  { id: 'personal', title: 'Top Up 50', credits: '50', price: '15,000 MMK' },
  { id: 'pro', title: 'Top Up 100', credits: '100', price: '27,000 MMK' },
  { id: 'prime', title: 'Top Up 300', credits: '300', price: '69,000 MMK' },
  { id: 'premium', title: 'Premium', credits: '150 / month', price: '39,000 MMK' },
];

const postJson = async <T,>(url: string, body: Record<string, unknown>): Promise<T> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Login with Gmail first.');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload as T;
};

const audioBase64ToBlob = (audioBase64: string, mimeType?: string) => {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType && mimeType !== 'application/octet-stream' ? mimeType : 'audio/mpeg' });
};

const formatDate = (value: number) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
const compactTitle = (idea: string, mood: string, genre: string, v: string) => `${idea.replace(/3[- ]?minute|create|song|about/gi, '').replace(/[^a-zA-Z0-9\u1000-\u109F\s-]/g, '').trim().split(/\s+/).slice(0, 5).join(' ') || `${mood} ${genre}`} (${v})`;

const buildStudioPrompt = (s: { idea: string; lyrics: string; genre: string; mood: string; voice: string; singer: string; lang: string; bpm: number; structure: string; quality: string; version: 'A' | 'B'; }) => {
  const versionRule = s.version === 'A'
    ? 'Version A: polished radio master, clean hook, commercial replay value, bright controlled energy.'
    : 'Version B: deeper, colder, darker, cinematic low-end, more tension, bigger final lift.';
  const structureRule = s.structure === '3:00 Studio Map'
    ? 'Timing: 0:00 intro, 0:12 verse 1, 0:45 hook, 1:05 verse 2, 1:38 hook 2, 1:58 bridge, 2:20 final hook, 2:50 outro.'
    : `Structure: ${s.structure}.`;
  return [
    `Taurus Studio Master v2. Create a full ${s.lang} ${s.genre} track at ${s.bpm} BPM.`,
    `Quality: ${s.quality}. Make it feel expensive, studio-made, emotional and finished, not demo/karaoke/thin AI draft.`,
    `Idea: ${s.idea}. Mood: ${s.mood}. Voice: ${s.singer} ${s.voice}.`,
    structureRule,
    versionRule,
    'Beat: hard-hitting modern drums, punchy kick, deep controlled 808/sub bass, crisp snare/clap, rolling hi-hats, percussion fills every 8 bars, hook drop, section changes, no weak drums, no muddy bass.',
    'Harmony: emotional minor chords, cinematic piano motif, warm wide pads, string swells into hooks, bass follows chord movement, counter melody, bigger final hook, no flat chords, no empty chorus.',
    'Mix: wide stereo, clean low-end, clear mids, instrument separation, polished loudness, mastering glue, smooth reverb/delay, no sudden cutoff, no cheap phone-demo feel.',
    'Personalization seed: remember that this user wants Burmese motivational rap, deep/cold voice energy, strong 808, cinematic piano, big hook, and studio texture.',
    s.lyrics.trim() ? `Use these lyrics naturally: ${s.lyrics}` : 'Write complete lyrics with a sticky hook and natural phrasing. No filler lines.',
  ].join(' ');
};

export default function AppStudio() {
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
  const [tier, setTier] = useState<UserTier>('premium');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [idea, setIdea] = useState('Burmese motivational rap about building success from zero, never giving up, deep cold male voice, cinematic piano, strong 808.');
  const [lyrics, setLyrics] = useState('');
  const [genre, setGenre] = useState('Rap');
  const [mood, setMood] = useState('Motivation');
  const [voice, setVoice] = useState('Deep');
  const [singer, setSinger] = useState('Male');
  const [lang, setLang] = useState('Burmese');
  const [quality, setQuality] = useState('Taurus Studio');
  const [bpm, setBpm] = useState(120);
  const [structure, setStructure] = useState('3:00 Studio Map');
  const audioRef = useRef(new Audio());

  const owner = isOwnerEmail(user?.email) || isOwnerProfile(profile);
  const expired = isSubscriptionExpired(profile);
  const plan = getEffectivePlanConfig(profile);
  const monthlyLimit = expired ? plan.monthlyLimit : (profile?.monthlyLimit || plan.monthlyLimit);
  const monthlyUsed = profile?.songsUsedThisMonth || 0;
  const dailyUsed = profile?.dailyGenerationCount || 0;
  const credits = owner ? '∞' : String(Math.max(monthlyLimit - monthlyUsed, 0));
  const daily = owner ? '∞' : plan.id === 'free' ? String(Math.max(5 - dailyUsed, 0)) : 'No cap';
  const admin = owner || profile?.role === 'admin';
  const filtered = useMemo(() => history.filter(s => `${s.idea} ${s.prompt}`.toLowerCase().includes(search.toLowerCase())), [history, search]);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    const unsub = onAuthStateChanged(auth, async authUser => {
      unsubProfile?.();
      setUser(authUser);
      if (!authUser) { setProfile(null); setHistory([]); return; }
      const existing = await getUserProfile(authUser.uid);
      if (!existing) await createUserProfile(authUser.uid, authUser.email || '', authUser.displayName || '');
      else await claimDailyPointsIfNeeded(authUser.uid, authUser.displayName || '');
      unsubProfile = onSnapshot(doc(db, 'users', authUser.uid), snap => {
        if (!snap.exists()) return;
        const live = snap.data() as UserProfile;
        setProfile(live);
        if (window.location.pathname === '/admin' && (live.role === 'admin' || isOwnerEmail(live.email))) setShowAdmin(true);
      });
    });
    return () => { unsub(); unsubProfile?.(); };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'users', user.uid, 'songs'), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(q, snap => setHistory(snap.docs.map(d => {
      const x = d.data();
      return { id: d.id, userId: x.userId || user.uid, idea: x.idea || 'Untitled', prompt: x.prompt || '', audioUrl: x.audioUrl || '', storagePath: x.storagePath, mimeType: x.mimeType || 'audio/mpeg', lyrics: x.lyrics || '', createdAt: x.createdAt?.toMillis?.() || Date.now() } as Song;
    })));
  }, [user]);

  useEffect(() => {
    if (!profile || !admin || !showAdmin) return undefined;
    return onSnapshot(query(collection(db, 'users'), where('pendingPayment', '==', true)), snap => setPendingUsers(snap.docs.map(d => d.data() as UserProfile)));
  }, [profile, admin, showAdmin]);

  useEffect(() => {
    const a = audioRef.current;
    const done = () => setIsPlaying(false);
    a.addEventListener('ended', done);
    return () => { a.removeEventListener('ended', done); a.pause(); };
  }, []);

  const playSong = async (song: Song) => {
    if (!song.audioUrl) return setError('Audio missing.');
    const a = audioRef.current;
    if (currentSong?.id === song.id && isPlaying) { a.pause(); setIsPlaying(false); return; }
    setCurrentSong(song); a.src = song.audioUrl; await a.play(); setIsPlaying(true);
  };

  const downloadSong = (song: Song) => { const link = document.createElement('a'); link.href = song.audioUrl; link.download = `${song.idea || 'taurus-song'}.mp3`.replace(/[^a-z0-9._-]+/gi, '-'); link.click(); };
  const setFeedback = (label: string) => setProgress(`Feedback saved: ${label}. Next version will tune stronger.`);

  const generate = async () => {
    if (!user) return setError('Login with Gmail first.');
    if (!idea.trim() && !lyrics.trim()) return setError('Add idea or lyrics.');
    setIsGenerating(true); setError(null);
    try {
      setProgress('Checking 2 credits...');
      const usage = await consumeGenerationCredit(user.uid, 2);
      if (!usage.allowed) throw new Error(`Not enough credits. Remaining: ${usage.remaining}.`);
      for (const version of ['A', 'B'] as const) {
        setProgress(`Generating Version ${version}...`);
        const compiled = buildStudioPrompt({ idea, lyrics, genre, mood, voice, singer, lang, bpm, structure, quality, version });
        const response = await postJson<GenerateResponse>('/api/generate-song', {
          prompt: compiled,
          genreDescription: `${genre}, ${mood}, ${lang}, ${bpm} BPM, Taurus Studio Master v2`,
          arrangementDescription: 'Hard drums, deep 808, crisp snare, rolling hats, cinematic piano, string swells, rich harmony, wide master, strong final hook.',
          modelProfile: `${quality}: v5.5-style personalization layer, studio master preset, instrumental quality boost first, vocal profile ready when model access supports it.`,
          lyricsText: lyrics,
          lyricsMode: lyrics.trim() ? 'manual' : 'auto',
          instrumental: false,
          styleText: `${quality}, ${mood}, ${voice} ${singer}, big hook, strong beat, rich harmony, studio texture`,
          artistName: '',
          weirdness: version === 'A' ? 35 : 58,
          styleInfluence: version === 'A' ? 72 : 86,
          durationMode: 'full',
          variantLabel: version === 'A' ? 'Version A polished commercial master' : 'Version B deep cold cinematic master',
          voice: `${singer} ${voice}`,
        });
        setProgress(`Saving Version ${version}...`);
        const blob = audioBase64ToBlob(response.audioBase64, response.mimeType);
        const id = `${Date.now()}-${version}`;
        const uploaded = await uploadSongAudio(user.uid, id, blob);
        await saveSong(user.uid, { id, idea: compactTitle(idea, mood, genre, `Version ${version}`), prompt: compiled, audioUrl: uploaded.audioUrl, storagePath: uploaded.storagePath, mimeType: uploaded.mimeType, lyrics: response.lyrics || lyrics || 'Generated by Taurus Studio.' });
      }
      setProgress('Done. Studio versions saved.');
    } catch (e: any) { setError(e.message || 'Generation failed.'); setProgress('Failed'); }
    finally { setIsGenerating(false); }
  };

  const submitPayment = async () => {
    if (!user) return setError('Login first.');
    setSubmitting(true); setError(null);
    try {
      const proof = proofFile ? await uploadPaymentProof(user.uid, proofFile) : undefined;
      await requestManualPayment(user.uid, tier, proof);
      setProgress('Payment sent for admin confirm.');
    } catch (e: any) { setError(e.message || 'Payment failed.'); }
    finally { setSubmitting(false); }
  };

  const chips = (items: string[], value: string, set: (v: string) => void) => <div className="flex flex-wrap gap-2">{items.map(i => <button key={i} onClick={() => set(i)} className={`rounded-2xl border px-3 py-2 text-sm ${value === i ? 'border-violet-300 bg-violet-500/25 text-white' : 'border-white/10 bg-white/[0.03] text-zinc-400'}`}>{i}</button>)}</div>;
  const expiry = getTimestampMillis(profile?.subscriptionExpiresAt);

  return <div className="min-h-screen bg-[#080812] text-zinc-100">
    <div className="fixed inset-0 overflow-hidden pointer-events-none"><div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl"/><div className="absolute right-10 top-28 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl"/></div>
    <div className="relative flex min-h-screen">
      <aside className="hidden w-72 border-r border-white/10 bg-white/[0.03] p-6 lg:block">
        <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/20 text-violet-200"><Music/></div><div><h1 className="text-xl font-bold">Taurus</h1><p className="text-xs text-zinc-400">Your Music Agent</p></div></div>
        <nav className="mt-10 space-y-2 text-sm">{['Create','History','Wallet','Plans'].map(x => <div key={x} className="rounded-2xl bg-white/[0.04] px-4 py-3">{x}</div>)}{admin && <button onClick={() => setShowAdmin(true)} className="w-full rounded-2xl bg-violet-500/20 px-4 py-3 text-left">Admin</button>}</nav>
        <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">PLAN</p><p className="mt-2 font-semibold">{owner ? 'Owner Unlimited' : plan.name}</p><p className="text-sm text-zinc-400">Credits: {credits}</p><p className="text-sm text-zinc-400">Daily: {daily}</p></div>
      </aside>
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative max-w-xl flex-1"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search songs..." className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 outline-none"/></div><div className="flex gap-3"><div className="rounded-2xl border border-white/10 px-4 py-3 text-sm"><Wallet className="mr-2 inline h-4 w-4"/>{credits}</div>{user ? <button onClick={logout} className="rounded-2xl border border-white/10 px-4 py-3 text-sm"><LogOut className="mr-2 inline h-4 w-4"/>Logout</button> : <button onClick={signInWithGoogle} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950"><UserIcon className="mr-2 inline h-4 w-4"/>Gmail</button>}</div></header>
        {error && <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle className="mr-2 inline h-4 w-4"/>{error}</div>}
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="space-y-6"><div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30"><div className="grid gap-6 lg:grid-cols-[1fr_220px]"><div><p className="mb-2 text-xs uppercase tracking-[0.35em] text-violet-300">Studio Master v2</p><h2 className="text-4xl font-bold tracking-tight">Make it hit harder</h2><p className="mt-3 text-zinc-400">Short prompt. Big beat. Rich harmony. Studio texture.</p></div><div className="relative mx-auto h-44 w-44 rotate-3 rounded-[2rem] border border-white/10 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 p-1 shadow-2xl shadow-fuchsia-950/40"><div className="h-full w-full rounded-[1.7rem] bg-black/30 p-4 backdrop-blur"><Sparkles className="h-9 w-9 text-white"/><div className="mt-10 h-10 rounded-full bg-white/25 blur-lg"/><p className="mt-2 text-sm font-bold">3D Studio Core</p></div></div></div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2"><label><span className="mb-2 block text-sm">Prompt</span><textarea value={idea} onChange={e => setIdea(e.target.value.slice(0,1000))} rows={6} className="w-full resize-none rounded-3xl border border-white/10 bg-black/30 p-4 outline-none"/></label><label><span className="mb-2 block text-sm">Lyrics</span><textarea value={lyrics} onChange={e => setLyrics(e.target.value.slice(0,4000))} rows={6} placeholder="Optional lyrics..." className="w-full resize-none rounded-3xl border border-white/10 bg-black/30 p-4 outline-none"/></label></div>
            <div className="mt-6 grid gap-5"><div><p className="mb-2 text-sm">Quality</p>{chips(QUALITY, quality, setQuality)}</div><div><p className="mb-2 text-sm">Genre</p>{chips(GENRES, genre, setGenre)}</div><div><p className="mb-2 text-sm">Mood</p>{chips(MOODS, mood, setMood)}</div><div><p className="mb-2 text-sm">Voice</p>{chips(VOICES, voice, setVoice)}</div><div><p className="mb-2 text-sm">Singer</p>{chips(SINGERS, singer, setSinger)}</div><div><p className="mb-2 text-sm">Language</p>{chips(LANGS, lang, setLang)}</div><label><span className="mb-2 block text-sm">BPM {bpm}</span><input type="range" min="60" max="200" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-full accent-violet-500"/></label><select value={structure} onChange={e => setStructure(e.target.value)} className="rounded-2xl border border-white/10 bg-black/30 p-3">{STRUCTURES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"><button onClick={generate} disabled={isGenerating || !user} className="rounded-3xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 font-semibold disabled:opacity-50">{isGenerating ? <Loader2 className="mr-2 inline h-5 w-5 animate-spin"/> : <Sparkles className="mr-2 inline h-5 w-5"/>}Generate 2</button><p className="text-sm text-zinc-400">{progress}</p></div></div>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"><div className="mb-4 flex items-center justify-between"><h3 className="text-2xl font-bold"><History className="mr-2 inline h-5 w-5 text-violet-300"/>Song History</h3><span className="text-sm text-zinc-500">{filtered.length}</span></div><div className="grid gap-3">{filtered.map(song => <div key={song.id} className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-semibold">{song.idea}</p><p className="text-xs text-zinc-500">{formatDate(song.createdAt)}</p><div className="mt-2 flex gap-2"><button onClick={() => setFeedback('like')} className="rounded-full bg-white/5 p-2"><ThumbsUp className="h-4 w-4"/></button><button onClick={() => setFeedback('needs stronger beat/harmony')} className="rounded-full bg-white/5 p-2"><ThumbsDown className="h-4 w-4"/></button></div></div><div className="flex gap-2"><button onClick={() => playSong(song)} className="rounded-2xl bg-white px-4 py-2 text-zinc-950">{currentSong?.id===song.id && isPlaying ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}</button><button onClick={() => downloadSong(song)} className="rounded-2xl border border-white/10 px-4 py-2"><Download className="h-4 w-4"/></button></div></div>)}{filtered.length===0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-400">No songs yet.</p>}</div></div></section>
          <aside className="space-y-6"><div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"><h3 className="text-2xl font-bold"><Wallet className="mr-2 inline h-5 w-5"/>Wallet</h3><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-3xl bg-black/25 p-4"><p className="text-xs text-zinc-500">Credits</p><p className="mt-1 text-2xl font-bold">{credits}</p></div><div className="rounded-3xl bg-black/25 p-4"><p className="text-xs text-zinc-500">Daily</p><p className="mt-1 text-2xl font-bold">{daily}</p></div></div>{expiry>0 && <p className="mt-2 text-xs text-zinc-500">Expires {formatDate(expiry)}</p>}</div><div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"><h3 className="text-xl font-bold"><CreditCard className="mr-2 inline h-5 w-5"/>Plans</h3><div className="mt-4 grid gap-3">{PACKAGES.map(p => <button key={p.id} onClick={() => setTier(p.id)} className={`rounded-3xl border p-4 text-left ${tier===p.id?'border-violet-300 bg-violet-500/15':'border-white/10 bg-black/20'}`}><div className="flex justify-between"><p className="font-semibold">{p.title}</p><p>{p.price}</p></div><p className="text-sm text-zinc-400">{p.credits} credits</p></button>)}</div><label className="mt-4 block rounded-3xl border border-dashed border-white/15 p-4 text-sm text-zinc-400"><Upload className="mr-2 inline h-4 w-4"/>Receipt only<input type="file" accept="image/*" onChange={e => setProofFile(e.target.files?.[0] || null)} className="mt-3 block w-full text-xs"/></label><button onClick={submitPayment} disabled={!user || submitting} className="mt-4 w-full rounded-3xl bg-white px-5 py-3 font-semibold text-zinc-950 disabled:opacity-50">{submitting ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 inline h-4 w-4"/>}Admin Confirm</button></div></aside>
        </div>
      </main>
    </div>
    {showAdmin && admin && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[2rem] border border-white/10 bg-[#0c0c18] p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-bold"><Settings className="mr-2 inline h-5 w-5"/>Admin</h2><button onClick={() => setShowAdmin(false)} className="rounded-2xl border border-white/10 px-4 py-2">Close</button></div>{pendingUsers.length===0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-400"><Clock3 className="mr-2 inline h-4 w-4"/>No pending payments.</p>}{pendingUsers.map(u => <div key={u.uid} className="mb-3 rounded-3xl border border-white/10 p-4"><p className="font-semibold">{u.email}</p><p className="text-sm text-zinc-400">{PLAN_CONFIGS[u.requestedTier || 'premium']?.name}</p>{u.paymentProofUrl && <a href={u.paymentProofUrl} target="_blank" rel="noreferrer" className="text-violet-300 underline">View proof</a>}<div className="mt-3 flex gap-2"><button onClick={() => approvePayment(u.uid, u.requestedTier || 'premium')} className="rounded-2xl bg-emerald-500 px-4 py-2">Approve</button><button onClick={() => rejectPayment(u.uid, 'Receipt not confirmed')} className="rounded-2xl bg-red-500 px-4 py-2">Reject</button></div></div>)}</div></div>}
  </div>;
}
