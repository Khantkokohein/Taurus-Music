import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectModal, useTonWallet } from '@tonconnect/ui-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Clock3, Code2, CreditCard, Download, History, Loader2, LogOut, Mic2, Music, Pause, Play, Search, Settings, Sparkles, ThumbsDown, ThumbsUp, User as UserIcon, Wallet } from 'lucide-react';
import DeveloperHub from './components/DeveloperHub';
import TaurusLandingPage from './components/TaurusLandingPage';
import TaurusVoiceHub from './components/TaurusVoiceHub';
import { auth, db, signInWithGoogle, logout, getUserProfile, createUserProfile, claimDailyPointsIfNeeded, consumeGenerationCredit, approvePayment, rejectPayment, saveSong, uploadSongAudio, uploadVoiceProfileSample, saveVoiceProfile, uploadRemixReference, getEffectivePlanConfig, getTimestampMillis, isOwnerEmail, isOwnerProfile, isSubscriptionExpired, buildTaurusAccountCode, PLAN_CONFIGS, GENERATE_TWO_SONGS_COST, UserProfile, UserTier } from './firebase';

interface Song { id: string; userId?: string; idea: string; prompt: string; audioUrl: string; storagePath?: string; mimeType?: string; lyrics: string; lyriaModel?: LyriaModelId; instrumentTags?: string[]; voiceStrength?: string; voiceProfileId?: string; voiceProfileName?: string; remixMode?: string; remixReferencePath?: string; remixReferenceName?: string; createdAt: number; }
interface VoiceProfile { id: string; userId?: string; name: string; sampleUrl: string; storagePath: string; contentType: string; consent: boolean; consentText: string; createdAt: number; }
type GenerateResponse = { audioBase64: string; mimeType?: string; lyrics?: string; model?: string; };
type TaurusPayInvoice = {
  invoiceId: string;
  status: string;
  productId: string;
  credits: number;
  amount: number;
  asset: string;
  network: string;
  recipient: string;
  memo: string;
  reference: string;
  expiresAt?: string | null;
};
type StudioPage = 'landing' | 'create' | 'history' | 'wallet' | 'plans';
type StudioPanel = 'voice' | 'developers' | 'admin' | null;
type StudioVersion = 'A' | 'B' | 'C' | 'D';
type LyriaModelId = 'lyria-3-clip-preview' | 'lyria-3-pro-preview';

interface StudioRoute {
  page: StudioPage;
  panel: StudioPanel;
}

const GENRES = ['Rap', 'Motivation', 'Chill Rap', 'Pop', 'Hip-hop', 'Cinematic', 'Myanmar'];
const MOODS = ['Motivation', 'Chill', 'Romantic', 'Sad', 'Epic'];
const VOICES = ['Deep', 'Cold', 'Warm', 'Soft', 'Power'];
const VOICE_STRENGTHS = ['Power Vocal', 'Soft Vocal', 'Cold Vocal', 'Studio Vocal', 'Duet'];
const INSTRUMENT_CHOICES = ['Piano', 'Guitar', 'Bass Boost', 'Violin', '808', 'Drums', 'Strings', 'Synth'];
const REMIX_MODES = ['Original', 'Cover Safe', 'Remix Safe', 'Melody to Song'];
const SINGERS = ['Male', 'Female', 'Duet'];
const LANGS = ['Burmese', 'English', 'Burmese + English'];
const QUALITY = ['Taurus Studio', 'Taurus Apex', 'Taurus Custom'];
const STRUCTURES = ['3:00 Studio Map', 'Rap Hook Map', 'Cinematic Build', 'Chill Loop'];
const LYRIA_MODEL_OPTIONS: Array<{ id: LyriaModelId; label: string; note: string }> = [
  { id: 'lyria-3-clip-preview', label: 'Lyria 3 Clip', note: '30 sec trial preview' },
  { id: 'lyria-3-pro-preview', label: 'Lyria 3 Pro', note: 'Full song premium' },
];
const STUDIO_PAGES: StudioPage[] = ['landing', 'create', 'history', 'wallet', 'plans'];
const STUDIO_PANELS: Array<Exclude<StudioPanel, null>> = ['voice', 'developers', 'admin'];
const PACKAGES: Array<{ id: UserTier; title: string; credits: string; price: string }> = [
  { id: 'personal', title: 'Top Up 50', credits: '50 credits / 5 creates', price: '3.75 USDT' },
  { id: 'pro', title: 'Top Up 100', credits: '100 credits / 10 creates', price: '6.75 USDT' },
  { id: 'prime', title: 'Top Up 300', credits: '300 credits / 30 creates', price: '17.25 USDT' },
  { id: 'premium', title: 'Premium', credits: '150 credits / 15 creates / month', price: '12.25 USDT' },
];

const PRODUCT_BY_TIER: Partial<Record<UserTier, string>> = {
  personal: 'credits_50',
  pro: 'credits_100',
  prime: 'credits_300',
  premium: 'premium_150_month',
};

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

const isStudioPage = (value: string): value is StudioPage => STUDIO_PAGES.includes(value as StudioPage);
const isStudioPanel = (value: string): value is Exclude<StudioPanel, null> => STUDIO_PANELS.includes(value as Exclude<StudioPanel, null>);

const readStudioRoute = (): StudioRoute => {
  if (typeof window === 'undefined') return { page: 'landing', panel: null };
  const [rawPage, rawPanel] = window.location.hash.replace(/^#/, '').split('/');
  if (window.location.pathname === '/admin') return { page: 'create', panel: 'admin' };
  return {
    page: rawPage && isStudioPage(rawPage) ? rawPage : 'landing',
    panel: rawPanel && isStudioPanel(rawPanel) ? rawPanel : null,
  };
};

const routeHash = (route: StudioRoute) => `#${route.page}${route.panel ? `/${route.panel}` : ''}`;

const formatDate = (value: number) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
const compactTitle = (idea: string, mood: string, genre: string, v: string) => `${idea.replace(/3[- ]?minute|create|song|about/gi, '').replace(/[^a-zA-Z0-9\u1000-\u109F\s-]/g, '').trim().split(/\s+/).slice(0, 5).join(' ') || `${mood} ${genre}`} (${v})`;
const compactWalletAddress = (address: string) => address ? `${address.slice(0, 6)}...${address.slice(-6)}` : '';

const getVoiceStrengthProfile = (voiceStrength: string) => {
  if (voiceStrength === 'Soft Vocal') return 'soft but expensive studio vocal, intimate close-mic warmth, smooth air, controlled emotion, no weak volume.';
  if (voiceStrength === 'Cold Vocal') return 'cold powerful vocal, deep presence, tight breath control, crisp consonants, dark premium tone, front-of-mix focus.';
  if (voiceStrength === 'Duet') return 'duet-ready vocal stack, lead plus support voice, wide hook doubles, call-response ad-libs, balanced male/female harmony if useful.';
  if (voiceStrength === 'Studio Vocal') return 'professional booth vocal, clean preamp feel, full-bodied tone, upfront center image, polished compression and de-essing.';
  return 'maximum power vocal, huge front-facing presence, thick lead body, strong projection, premium hook stacks, high perceived loudness without clipping.';
};

const getStudioProductionPreset = (s: { genre: string; mood: string; voice: string; voiceStrength: string; singer: string; lang: string; bpm: number; structure: string; instruments: string[]; version: StudioVersion; }) => {
  const energy = s.version === 'A' ? 'clean, confident, radio-forward' : 'bigger, deeper, more cinematic';
  const selectedInstruments = s.instruments.length ? s.instruments.join(', ') : 'Piano, Bass Boost, 808, Drums';
  const voiceProfile = getVoiceStrengthProfile(s.voiceStrength);
  return {
    vocalProduction: [
      `${s.singer} ${s.voice} ${s.voiceStrength}, ${energy} lead performance.`,
      voiceProfile,
      'Make the vocal feel recorded in a real studio booth: close condenser mic texture, clean preamp, tight pitch, polished compression, de-essing, tasteful saturation, wide hook doubles, and no room noise.',
      'Lead vocal must sit extremely upfront and centered with clear consonants, controlled breath, natural vibrato, confident pitch, emotional phrases, and no robotic delivery.',
      'Add tasteful double-tracking on hooks, low harmony/support stacks, short ad-libs before transitions, and call-response accents where useful.',
      s.lang.toLowerCase().includes('burmese') ? 'Myanmar/Burmese pronunciation must be natural, syllables must land on beat, and words must not sound broken or foreign.' : 'Pronunciation must follow the selected language naturally.',
    ].join(' '),
    instrumentalProduction: [
      `${s.genre} ${s.mood} arrangement at ${s.bpm} BPM.`,
      `Selected instruments must drive the arrangement: ${selectedInstruments}.`,
      'Drums must hit hard with punchy kick, tight snare/clap, rolling hats, percussion movement every 8 bars, fills into hooks, and a real drop lift.',
      '808/sub bass and bass boost must be deep, clean, tuned, sidechain-aware, and not muddy. Piano/guitar/violin/synth/strings must create rich harmony, counter melody, and section movement when selected.',
      'Avoid loop-only backing. Each section needs new layers, risers, breaks, impacts, and a bigger final chorus.',
    ].join(' '),
    masteringProfile: [
      'Mix like a modern studio master with very high perceived loudness: vocal huge and clear above beat, controlled low end, separated mids, wide chorus stereo, smooth reverb/delay tails, de-essed highs, glue compression, limiter, and release-ready volume.',
      'Make it feel powerful at maximum energy, but do not clip, pump badly, distort the vocal, bury the lyric, or leave dead silence before the ending.',
    ].join(' '),
    negativeProductionRules: [
      'No karaoke feel. No thin demo. No weak drums. No muddy bass. No flat chord loop. No off-key vocal. No random mumbling. No abrupt cutoff. No cheap phone-recording texture.',
      'Do not imitate a real artist voice, copyrighted melody, or existing song. Create an original Taurus performance with only broad vibe influence.',
    ].join(' '),
    sectionMap: s.structure === '3:00 Studio Map'
      ? '0:00 intro motif, 0:12 verse 1, 0:42 pre-hook lift, 0:55 hook, 1:18 verse 2, 1:50 hook 2, 2:12 bridge/breakdown, 2:35 final hook with extra stacks, 3:05 outro.'
      : `${s.structure}: intro, verse, pre-hook, hook, second verse, hook, bridge, final hook, outro with clear ending.`,
  };
};

const buildStudioPrompt = (s: { idea: string; lyrics: string; genre: string; mood: string; voice: string; voiceStrength: string; singer: string; lang: string; bpm: number; structure: string; quality: string; instruments: string[]; version: StudioVersion; }) => {
  const versionRule = s.version === 'A'
    ? 'Version A: flagship polished radio master, clean hook, commercial replay value, bright controlled energy.'
    : 'Version B: flagship deep cinematic master, colder low-end, more tension, heavier lift, same quality level as Version A.';
  const studio = getStudioProductionPreset(s);
  return [
    `Taurus Studio Master v4. Create a full ${s.lang} ${s.genre} track at ${s.bpm} BPM.`,
    `Quality: ${s.quality}. Make it feel expensive, studio-made, emotional and finished.`,
    `Idea: ${s.idea}. Mood: ${s.mood}. Voice: ${s.singer} ${s.voice} with ${s.voiceStrength}.`,
    `Instrument choices: ${s.instruments.length ? s.instruments.join(', ') : 'Piano, Bass Boost, 808, Drums'}. These must be audible and shape the arrangement.`,
    `Section map: ${studio.sectionMap}`,
    versionRule,
    `Vocal production: ${studio.vocalProduction}`,
    `Instrumental production: ${studio.instrumentalProduction}`,
    `Mastering: ${studio.masteringProfile}`,
    `Avoid: ${studio.negativeProductionRules}`,
    'Personalization seed: Burmese motivational rap, powerful deep/cold vocal energy, strong 808, cinematic piano, big hook, studio texture, expensive mix.',
    s.lyrics.trim() ? `Use these lyrics naturally: ${s.lyrics}` : 'Write complete lyrics with a sticky hook and natural phrasing. No filler lines.',
  ].join(' ');
};

export default function AppStudio() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<Song[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [tier, setTier] = useState<UserTier>('premium');
  const [paymentWallet, setPaymentWallet] = useState('');
  const [taurusPayInvoice, setTaurusPayInvoice] = useState<TaurusPayInvoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showVoiceHub, setShowVoiceHub] = useState(false);
  const [showDeveloperHub, setShowDeveloperHub] = useState(false);
  const [activePage, setActivePage] = useState<StudioPage>('landing');
  const [search, setSearch] = useState('');
  const [idea, setIdea] = useState('Burmese motivational rap about building success from zero, never giving up, deep cold male voice, cinematic piano, strong 808.');
  const [lyrics, setLyrics] = useState('');
  const [genre, setGenre] = useState('Rap');
  const [mood, setMood] = useState('Motivation');
  const [voice, setVoice] = useState('Deep');
  const [voiceStrength, setVoiceStrength] = useState('Power Vocal');
  const [instruments, setInstruments] = useState<string[]>(['Piano', 'Bass Boost', '808', 'Drums']);
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState('');
  const [voiceProfileName, setVoiceProfileName] = useState('');
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [recordedVoiceBlob, setRecordedVoiceBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [remixMode, setRemixMode] = useState('Original');
  const [remixReferenceFile, setRemixReferenceFile] = useState<File | null>(null);
  const [remixLyrics, setRemixLyrics] = useState('');
  const [remixConsent, setRemixConsent] = useState(false);
  const [singer, setSinger] = useState('Male');
  const [lang, setLang] = useState('Burmese');
  const [quality, setQuality] = useState('Taurus Studio');
  const [lyriaModel, setLyriaModel] = useState<LyriaModelId>('lyria-3-clip-preview');
  const [bpm, setBpm] = useState(120);
  const [structure, setStructure] = useState('3:00 Studio Map');
  const audioRef = useRef(new Audio());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const tonAddress = useTonAddress();
  const tonWallet = useTonWallet();
  const tonModal = useTonConnectModal();

  const applyRoute = (route: StudioRoute) => {
    setActivePage(route.page);
    setShowVoiceHub(route.panel === 'voice');
    setShowDeveloperHub(route.panel === 'developers');
    setShowAdmin(route.panel === 'admin');
  };

  const writeRoute = (route: StudioRoute, mode: 'push' | 'replace' = 'push') => {
    const nextState = { ...(window.history.state || {}), taurusRoute: route };
    if (mode === 'replace') window.history.replaceState(nextState, '', routeHash(route));
    else window.history.pushState(nextState, '', routeHash(route));
    applyRoute(route);
  };

  const navigatePage = (page: StudioPage) => writeRoute({ page, panel: null });
  const openPanel = (panel: Exclude<StudioPanel, null>) => writeRoute({ page: activePage, panel });
  const closePanel = () => writeRoute({ page: activePage, panel: null }, 'replace');

  const owner = isOwnerEmail(user?.email) || isOwnerProfile(profile);
  const expired = isSubscriptionExpired(profile);
  const plan = getEffectivePlanConfig(profile);
  const monthlyLimit = expired ? plan.monthlyLimit : (profile?.monthlyLimit || plan.monthlyLimit);
  const monthlyUsed = profile?.songsUsedThisMonth || 0;
  const monthlyRemaining = Math.max(monthlyLimit - monthlyUsed, 0);
  const pointBalance = Math.max(Number(profile?.points || 0), 0);
  const credits = !user ? 'Login' : owner ? '∞' : String(pointBalance);
  const daily = !user ? 'Connect Gmail' : owner ? '∞' : plan.id === 'free' ? `${monthlyRemaining}/month` : 'No cap';
  const admin = owner || profile?.role === 'admin';
  const taurusId = profile?.taurusId || (user ? buildTaurusAccountCode(user.uid) : '');
  const filtered = useMemo(() => history.filter(s => `${s.idea} ${s.prompt}`.toLowerCase().includes(search.toLowerCase())), [history, search]);
  const selectedVoiceProfile = useMemo(() => voiceProfiles.find(item => item.id === selectedVoiceProfileId) || null, [voiceProfiles, selectedVoiceProfileId]);
  const canUseProLyria = owner || plan.id === 'premium';
  const effectiveLyriaModel: LyriaModelId = canUseProLyria ? lyriaModel : 'lyria-3-clip-preview';
  const activeLyriaOption = LYRIA_MODEL_OPTIONS.find(item => item.id === effectiveLyriaModel) || LYRIA_MODEL_OPTIONS[0];
  const generationCountLabel = effectiveLyriaModel === 'lyria-3-clip-preview' ? '2 clips' : '2 songs';
  const connectedWalletLabel = tonAddress ? compactWalletAddress(tonAddress) : 'Not connected';

  useEffect(() => {
    if (tonAddress) setPaymentWallet(tonAddress);
  }, [tonAddress]);

  useEffect(() => {
    setLyriaModel(canUseProLyria ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview');
  }, [canUseProLyria]);

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      await signInWithGoogle();
      setProgress('Gmail connected.');
    } catch (e: any) {
      setError(e?.message || 'Gmail login failed. Please try again.');
    }
  };

  useEffect(() => {
    const initialRoute = readStudioRoute();
    window.history.replaceState({ ...(window.history.state || {}), taurusRoute: initialRoute }, '', routeHash(initialRoute));
    applyRoute(initialRoute);

    const handlePopState = () => applyRoute(readStudioRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
      return { id: d.id, userId: x.userId || user.uid, idea: x.idea || 'Untitled', prompt: x.prompt || '', audioUrl: x.audioUrl || '', storagePath: x.storagePath, mimeType: x.mimeType || 'audio/mpeg', lyrics: x.lyrics || '', lyriaModel: x.lyriaModel || 'lyria-3-pro-preview', instrumentTags: x.instrumentTags || [], voiceStrength: x.voiceStrength || '', voiceProfileId: x.voiceProfileId || '', voiceProfileName: x.voiceProfileName || '', remixMode: x.remixMode || '', remixReferencePath: x.remixReferencePath || '', remixReferenceName: x.remixReferenceName || '', createdAt: x.createdAt?.toMillis?.() || Date.now() } as Song;
    })));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setVoiceProfiles([]);
      setSelectedVoiceProfileId('');
      return undefined;
    }
    const q = query(collection(db, 'users', user.uid, 'voiceProfiles'), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(q, snap => setVoiceProfiles(snap.docs.map(d => {
      const x = d.data();
      return { id: d.id, userId: x.userId || user.uid, name: x.name || 'Voice Profile', sampleUrl: x.sampleUrl || '', storagePath: x.storagePath || '', contentType: x.contentType || 'audio/webm', consent: x.consent === true, consentText: x.consentText || '', createdAt: x.createdAt?.toMillis?.() || Date.now() } as VoiceProfile;
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
  const toggleInstrument = (item: string) => setInstruments(current => (
    current.includes(item) ? current.filter(value => value !== item) : [...current, item]
  ));
  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setError('Voice recording is not supported in this browser.');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setRecordedVoiceBlob(new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (e: any) {
      setError(e?.message || 'Could not start voice recording.');
    }
  };
  const stopVoiceRecording = () => mediaRecorderRef.current?.stop();
  const saveCurrentVoiceProfile = async () => {
    if (!user) return setError('Login with Gmail first.');
    if (!voiceConsent) return setError('Voice consent is required before saving a voice profile.');
    const sample = recordedVoiceBlob || voiceSampleFile;
    if (!sample) return setError('Upload or record a voice sample first.');
    const name = voiceProfileName.trim() || `${voiceStrength} Profile`;
    setVoiceSaving(true); setError(null);
    try {
      const profileId = `vp-${Date.now()}`;
      const uploaded = await uploadVoiceProfileSample(user.uid, profileId, sample, voiceSampleFile?.name || 'recorded-voice.webm');
      await saveVoiceProfile(user.uid, {
        id: profileId,
        name,
        sampleUrl: uploaded.sampleUrl,
        storagePath: uploaded.storagePath,
        contentType: uploaded.contentType,
        consent: true,
        consentText: 'User confirmed they own this voice or have permission to use it inside Taurus Music.',
      });
      setSelectedVoiceProfileId(profileId);
      setVoiceProfileName('');
      setVoiceSampleFile(null);
      setRecordedVoiceBlob(null);
      setVoiceConsent(false);
      setProgress('Voice profile saved.');
    } catch (e: any) { setError(e.message || 'Voice profile save failed.'); }
    finally { setVoiceSaving(false); }
  };

  const generate = async () => {
    if (!user) return setError('Login with Gmail first.');
    if (!profile) return setError('Gmail connected. Profile is loading, please try again in a moment.');
    if (!idea.trim() && !lyrics.trim()) return setError('Add idea or lyrics.');
    if (remixMode !== 'Original' && !remixConsent) return setError('Cover/remix permission checkbox is required.');
    setIsGenerating(true); setError(null);
    try {
      let remixReference: Awaited<ReturnType<typeof uploadRemixReference>> | null = null;
      if (remixReferenceFile) {
        setProgress('Uploading cover/remix reference...');
        remixReference = await uploadRemixReference(user.uid, `ref-${Date.now()}`, remixReferenceFile);
      }
      setProgress(`Checking ${GENERATE_TWO_SONGS_COST} credits...`);
      const usage = await consumeGenerationCredit(user.uid, GENERATE_TWO_SONGS_COST);
      if (!usage.allowed) throw new Error(`Not enough credits. Remaining: ${usage.remaining}.`);
      const clipMode = effectiveLyriaModel === 'lyria-3-clip-preview';
      const variants: Array<{ version: StudioVersion; durationMode: 'full' | 'preview'; label: string; title: string }> = [
        { version: 'A', durationMode: clipMode ? 'preview' : 'full', label: clipMode ? 'Lyria 3 Clip Preview A polished hook sample' : 'Lyria 3 Pro Version A polished commercial master', title: clipMode ? 'Clip Preview A' : 'Version A' },
        { version: 'B', durationMode: clipMode ? 'preview' : 'full', label: clipMode ? 'Lyria 3 Clip Preview B deep cinematic hook sample' : 'Lyria 3 Pro Version B deep cold cinematic master', title: clipMode ? 'Clip Preview B' : 'Version B' },
      ];
      for (const variant of variants) {
        setProgress(`Generating ${variant.title} with ${activeLyriaOption.label}...`);
        const corePrompt = buildStudioPrompt({ idea, lyrics, genre, mood, voice, voiceStrength, singer, lang, bpm, structure, quality, instruments, version: variant.version });
        const studio = getStudioProductionPreset({ genre, mood, voice, voiceStrength, singer, lang, bpm, structure, instruments, version: variant.version });
        const voiceProfilePrompt = selectedVoiceProfile
          ? `User-consented Taurus voice profile selected: ${selectedVoiceProfile.name}. Use it only as the user's authorized tone, diction, and delivery direction. Do not clone any third-party artist or unconsented identity.`
          : '';
        const remixPrompt = remixMode !== 'Original'
          ? `Cover/remix mode: ${remixMode}. User confirmed legal permission. Reference file: ${remixReference?.name || remixReferenceFile?.name || 'none'}. Melody/lyrics notes: ${remixLyrics || 'Create a safe original variation.'}. Do not copy exact copyrighted melody, lyrics, master recording, or artist identity.`
          : '';
        const compiled = [corePrompt, voiceProfilePrompt, remixPrompt].filter(Boolean).join(' ');
        const response = await postJson<GenerateResponse>('/api/generate-song', {
          prompt: compiled,
          genreDescription: `${genre}, ${mood}, ${lang}, ${bpm} BPM, ${instruments.join(', ') || 'studio core'}, Taurus Studio Master v4`,
          arrangementDescription: studio.instrumentalProduction,
          modelProfile: `${quality}: Taurus Studio v4 production chain, ${voiceStrength}, flagship vocal clarity, full arrangement movement, selected instrument weight, and mastered maximum perceived loudness without clipping.`,
          lyricsText: lyrics,
          lyricsMode: lyrics.trim() ? 'manual' : 'auto',
          instrumental: false,
          styleText: `${quality}, ${mood}, ${voice} ${singer}, ${voiceStrength}, ${instruments.join(', ') || 'studio core'}, big hook, strong beat, rich harmony, studio booth vocal, powerful instrumental`,
          artistName: '',
          weirdness: variant.version === 'A' ? 35 : 58,
          styleInfluence: variant.version === 'A' ? 72 : 86,
          durationMode: variant.durationMode,
          variantLabel: variant.label,
          voice: `${singer} ${voice} ${voiceStrength}`,
          vocalProduction: `${studio.vocalProduction} ${voiceProfilePrompt}`,
          instrumentalProduction: studio.instrumentalProduction,
          masteringProfile: studio.masteringProfile,
          negativeProductionRules: studio.negativeProductionRules,
          sectionMap: studio.sectionMap,
          lyriaModel: effectiveLyriaModel,
        });
        setProgress(`Saving ${variant.title}...`);
        const blob = audioBase64ToBlob(response.audioBase64, response.mimeType);
        const id = `${Date.now()}-${variant.version}`;
        const uploaded = await uploadSongAudio(user.uid, id, blob);
        await saveSong(user.uid, { id, idea: compactTitle(idea, mood, genre, variant.title), prompt: compiled, audioUrl: uploaded.audioUrl, storagePath: uploaded.storagePath, mimeType: uploaded.mimeType, lyrics: response.lyrics || lyrics || 'Generated by Taurus Studio.', lyriaModel: (response.model as LyriaModelId) || effectiveLyriaModel, instrumentTags: instruments, voiceStrength, voiceProfileId: selectedVoiceProfile?.id || '', voiceProfileName: selectedVoiceProfile?.name || '', remixMode, remixReferencePath: remixReference?.storagePath || '', remixReferenceName: remixReference?.name || '' });
      }
      setProgress(`Done. ${variants.length} studio versions saved.`);
    } catch (e: any) { setError(e.message || 'Generation failed.'); setProgress('Failed'); }
    finally { setIsGenerating(false); }
  };

  const submitPayment = async () => {
    if (!user) return setError('Login first.');
    if (!PRODUCT_BY_TIER[tier]) return setError('Invalid payment plan.');
    if (!paymentWallet.trim()) return setError('Add your Telegram/TON wallet address first.');
    setSubmitting(true); setError(null);
    try {
      const invoice = await postJson<TaurusPayInvoice>('/api/tauruspay-invoice', {
        productId: PRODUCT_BY_TIER[tier],
        wallet: paymentWallet.trim(),
      });
      setTaurusPayInvoice(invoice);
      setProgress('TaurusPay invoice created. Pay exact amount only.');
    } catch (e: any) { setError(e.message || 'Payment failed.'); }
    finally { setSubmitting(false); }
  };

  const checkTaurusPayStatus = async () => {
    if (!taurusPayInvoice) return;
    setSubmitting(true); setError(null);
    try {
      const status = await postJson<{ status: string; applied?: boolean }>('/api/tauruspay-status', {
        invoiceId: taurusPayInvoice.invoiceId,
      });
      setTaurusPayInvoice(current => current ? { ...current, status: status.status } : current);
      setProgress(status.applied ? 'Payment confirmed. Credits added.' : `Payment status: ${status.status}`);
    } catch (e: any) { setError(e.message || 'Payment status check failed.'); }
    finally { setSubmitting(false); }
  };

  const openWalletPayment = () => {
    if (!tonAddress) {
      tonModal.open();
      return;
    }
    setPaymentWallet(tonAddress);
    navigatePage('plans');
  };

  const expiry = getTimestampMillis(profile?.subscriptionExpiresAt);
  const walletPanel = <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"><h3 className="text-2xl font-bold"><Wallet className="mr-2 inline h-5 w-5"/>Wallet</h3><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-3xl bg-black/25 p-4"><p className="text-xs text-zinc-500">Credits</p><p className="mt-1 text-2xl font-bold">{credits}</p></div><div className="rounded-3xl bg-black/25 p-4"><p className="text-xs text-zinc-500">Free month</p><p className="mt-1 text-2xl font-bold">{daily}</p></div></div>{expiry>0 && <p className="mt-2 text-xs text-zinc-500">Expires {formatDate(expiry)}</p>}<div className="mt-5 rounded-3xl border border-[#D4A94533] bg-[#D4A9450d] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-[#D4A945]">TON Wallet</p><p className="mt-2 font-black text-white">{tonWallet ? 'Connected' : 'Connect required'}</p><p className="mt-1 break-all font-mono text-xs text-zinc-400">{tonAddress || 'Telegram Wallet / TON wallet not connected.'}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${tonAddress ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-zinc-400'}`}>{connectedWalletLabel}</span></div><div className="mt-4 flex flex-col gap-3"><TonConnectButton className="ton-connect-button"/><button onClick={openWalletPayment} className="rounded-2xl bg-[#D4A945] px-4 py-3 text-sm font-black text-black transition-colors hover:bg-[#e6bd5b]">{tonAddress ? 'Use Wallet for TaurusPay' : 'Connect Wallet'}</button></div></div></div>;
  const plansPanel = <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"><h3 className="text-xl font-bold"><CreditCard className="mr-2 inline h-5 w-5"/>TaurusPay</h3><p className="mt-2 text-sm text-zinc-400">USDT on TON. Exact amount only. Underpay fails, overpay goes to manual review.</p><div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-zinc-200">Connected wallet</p><p className="mt-1 break-all font-mono text-xs text-zinc-500">{tonAddress || 'Not connected yet'}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${tonAddress ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-zinc-400'}`}>{connectedWalletLabel}</span></div><div className="mt-3"><TonConnectButton className="ton-connect-button"/></div></div><div className="mt-4 grid gap-3">{PACKAGES.map(p => <button key={p.id} onClick={() => { setTier(p.id); setTaurusPayInvoice(null); }} className={`rounded-3xl border p-4 text-left ${tier===p.id?'border-[#D4A945] bg-[#D4A94514]':'border-white/10 bg-black/20'}`}><div className="flex justify-between gap-3"><p className="font-semibold">{p.title}</p><p>{p.price}</p></div><p className="text-sm text-zinc-400">{p.credits}</p></button>)}</div><label className="mt-4 block rounded-3xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300"><span className="mb-2 block font-semibold">Your Telegram / TON wallet</span><input value={paymentWallet} onChange={e => setPaymentWallet(e.target.value)} placeholder="UQ... wallet address" className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-[#D4A94588]"/></label><button onClick={submitPayment} disabled={!user || submitting} className="mt-4 w-full rounded-3xl bg-[#D4A945] px-5 py-3 font-black text-black disabled:opacity-50">{submitting ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 inline h-4 w-4"/>}Create TaurusPay Invoice</button>{taurusPayInvoice && <div className="mt-4 rounded-3xl border border-[#D4A94533] bg-[#D4A9450d] p-4 text-sm"><p className="font-black text-[#D4A945]">Invoice {taurusPayInvoice.status}</p><div className="mt-3 space-y-2 text-zinc-300"><p>Network: {taurusPayInvoice.network}</p><p>Asset: {taurusPayInvoice.asset}</p><p>Amount: {taurusPayInvoice.amount} {taurusPayInvoice.asset}</p><p className="break-all">Recipient: {taurusPayInvoice.recipient}</p><p className="break-all">Memo: {taurusPayInvoice.memo || taurusPayInvoice.reference}</p></div><button onClick={checkTaurusPayStatus} disabled={submitting} className="mt-4 w-full rounded-2xl border border-[#D4A94555] px-4 py-3 font-black text-[#D4A945] disabled:opacity-50">Check Payment Status</button></div>}</div>;
  const chips = (items: string[], value: string, set: (v: string) => void) => <div className="flex flex-wrap gap-2">{items.map(i => <button key={i} onClick={() => set(i)} className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors ${value === i ? 'border-[#D4A945] bg-[#D4A945] text-black' : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-[#D4A94555] hover:text-white'}`}>{i}</button>)}</div>;

  if (activePage === 'landing') {
    return <div className="min-h-screen bg-[#080812] text-zinc-100">
      {showVoiceHub && <TaurusVoiceHub onClose={closePanel} onOpenStudio={() => navigatePage('create')} onSelectVoice={(voiceName) => { setVoice(voiceName); navigatePage('create'); }} />}
      {showDeveloperHub && <DeveloperHub currentUser={user} profile={profile} onClose={closePanel} />}
      <TaurusLandingPage
        onEnterStudio={() => navigatePage('create')}
        onOpenVoice={() => openPanel('voice')}
        onOpenDevelopers={() => openPanel('developers')}
        onOpenWallet={() => navigatePage('wallet')}
        onLogin={handleGoogleLogin}
      />
    </div>;
  }

  return <div className="min-h-screen bg-[#070707] text-zinc-100">
    {showVoiceHub && <TaurusVoiceHub onClose={closePanel} onOpenStudio={closePanel} onSelectVoice={(voiceName) => { setVoice(voiceName); closePanel(); }} />}
    {showDeveloperHub && <DeveloperHub currentUser={user} profile={profile} onClose={closePanel} />}
    <div className="fixed inset-0 overflow-hidden pointer-events-none"><div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#D4A945]/10 blur-3xl"/><div className="absolute right-10 top-28 h-96 w-96 rounded-full bg-white/[0.04] blur-3xl"/></div>
    <div className="relative flex min-h-screen">
      <aside className="hidden w-72 border-r border-white/10 bg-[#0b0a08]/95 p-6 lg:block">
        <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#D4A94514] text-[#D4A945]"><Music/></div><div><h1 className="text-xl font-black tracking-wide">Taurus</h1><p className="text-xs text-zinc-500">Studio Music OS</p></div></div>
        <nav className="mt-10 space-y-2 text-sm">{(['landing','create','history','wallet','plans'] as StudioPage[]).map(x => <button key={x} onClick={() => navigatePage(x)} className={`w-full rounded-2xl px-4 py-3 text-left font-bold capitalize transition-colors ${activePage===x?'bg-[#D4A945] text-black':'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.07] hover:text-white'}`}>{x}</button>)}<button onClick={() => openPanel('voice')} className="flex w-full items-center gap-2 rounded-2xl border border-[#D4A94522] bg-[#D4A9450d] px-4 py-3 text-left font-bold text-[#D4A945] transition-colors hover:bg-[#D4A945] hover:text-black"><Mic2 className="h-4 w-4"/>Taurus Voice</button><button onClick={() => openPanel('developers')} className="flex w-full items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-left font-bold transition-colors hover:bg-white/[0.07]"><Code2 className="h-4 w-4"/>Developers</button>{admin && <button onClick={() => openPanel('admin')} className="w-full rounded-2xl border border-[#D4A94522] bg-[#D4A94514] px-4 py-3 text-left font-bold text-[#D4A945]">Admin</button>}</nav>
        <div className="mt-10 rounded-3xl border border-white/10 bg-black/30 p-4"><p className="text-xs font-black uppercase tracking-[0.24em] text-[#D4A945]">Plan</p><p className="mt-2 font-semibold">{owner ? 'Owner Unlimited' : plan.name}</p>{taurusId && <p className="mt-1 font-mono text-xs text-zinc-500">{taurusId}</p>}<p className="text-sm text-zinc-400">Credits: {credits}</p><p className="text-sm text-zinc-400">Free month: {daily}</p></div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <header className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative max-w-xl flex-1"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search songs..." className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 outline-none transition-colors focus:border-[#D4A94588]"/></div><div className="flex gap-3"><div className="rounded-2xl border border-[#D4A94533] bg-[#D4A9450d] px-4 py-3 text-sm font-bold text-[#D4A945]"><Wallet className="mr-2 inline h-4 w-4"/>{credits}</div>{user ? <button onClick={logout} title={user.email || 'Gmail connected'} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold transition-colors hover:text-white"><LogOut className="mr-2 inline h-4 w-4"/>Gmail Connected</button> : <button onClick={handleGoogleLogin} className="rounded-2xl bg-[#D4A945] px-4 py-3 text-sm font-black text-black transition-colors hover:bg-[#e6bd5b]"><UserIcon className="mr-2 inline h-4 w-4"/>Gmail</button>}</div></header>
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">{(['landing','create','history','wallet','plans'] as StudioPage[]).map(x => <button key={x} onClick={() => navigatePage(x)} className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-bold capitalize ${activePage===x?'bg-[#D4A945] text-black':'border border-white/10 bg-white/[0.04] text-zinc-300'}`}>{x}</button>)}<button onClick={() => openPanel('voice')} className="shrink-0 rounded-2xl border border-[#D4A94533] bg-[#D4A9450d] px-4 py-2 text-xs font-bold text-[#D4A945]">Voice</button><button onClick={() => openPanel('developers')} className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold">API</button></div>
        {error && <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle className="mr-2 inline h-4 w-4"/>{error}</div>}
        <div className="grid min-w-0 gap-6 xl:grid-cols-[1fr_360px]">
          <section className="min-w-0 space-y-6">{activePage === 'create' && <div className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[#11100d]/95 shadow-2xl shadow-black/40">
            <div className="relative p-6 lg:p-8">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(212,169,69,.18),transparent_28%)]" />
              <div className="relative grid gap-8 lg:grid-cols-[1fr_260px]">
                <div>
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.34em] text-[#D4A945]">Studio Master V4</p>
                  <h2 className="max-w-2xl break-words text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">Make a release-ready song</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400">Write the idea, choose voice and sound direction, then Taurus builds two studio versions with stronger vocal chain, heavier instrumental production, and mastered full-song structure.</p>
                  <div className="mt-6 flex flex-wrap gap-3 text-xs font-black uppercase tracking-[0.2em] text-zinc-500"><span className="rounded-full border border-[#D4A94533] bg-[#D4A9450d] px-4 py-2 text-[#D4A945]">Full song map</span><span className="rounded-full border border-white/10 bg-black/30 px-4 py-2">Two versions</span><span className="rounded-full border border-white/10 bg-black/30 px-4 py-2">Studio texture</span></div>
                </div>
                <div className="rounded-[1.75rem] border border-[#D4A94533] bg-[#D4A9450d] p-5">
                  <Sparkles className="h-8 w-8 text-[#D4A945]"/>
                  <div className="mt-8 space-y-4">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Quality</p><p className="mt-1 font-black text-white">{quality}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Lyria Model</p><p className="mt-1 font-black text-white">{activeLyriaOption.label}</p><p className="mt-1 text-xs text-[#D4A945]">{activeLyriaOption.note}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Voice</p><p className="mt-1 font-black text-white">{singer} {voice}</p><p className="mt-1 text-xs text-[#D4A945]">{voiceStrength}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Instruments</p><p className="mt-1 text-sm font-black text-white">{instruments.join(' · ') || 'Studio Core'}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Tempo</p><p className="mt-1 font-black text-white">{bpm} BPM</p></div>
                  </div>
                </div>
              </div>

              <div className="relative mt-8 grid gap-5 lg:grid-cols-2">
                <label className="block rounded-[1.75rem] border border-white/10 bg-black/35 p-5">
                  <span className="mb-3 flex items-center justify-between text-sm font-black"><span>Song Description</span><span className="text-xs text-zinc-600">{idea.length}/1000</span></span>
                  <textarea value={idea} onChange={e => setIdea(e.target.value.slice(0,1000))} rows={8} className="w-full resize-none rounded-3xl border border-white/10 bg-[#070707] p-4 text-sm leading-7 text-white outline-none transition-colors focus:border-[#D4A94588]" placeholder="Describe the full song idea..."/>
                </label>
                <label className="block rounded-[1.75rem] border border-white/10 bg-black/35 p-5">
                  <span className="mb-3 flex items-center justify-between text-sm font-black"><span>Lyrics</span><span className="text-xs text-zinc-600">{lyrics.length}/4000</span></span>
                  <textarea value={lyrics} onChange={e => setLyrics(e.target.value.slice(0,4000))} rows={8} placeholder="Optional lyrics..." className="w-full resize-none rounded-3xl border border-white/10 bg-[#070707] p-4 text-sm leading-7 text-white outline-none transition-colors focus:border-[#D4A94588]"/>
                </label>
              </div>

              <div className="relative mt-6 grid gap-5 lg:grid-cols-2">
                <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                  <h3 className="mb-5 text-lg font-black">Sound DNA</h3>
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-sm font-bold text-zinc-300">Lyria 3 Model</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {LYRIA_MODEL_OPTIONS.map(option => {
                          const locked = option.id === 'lyria-3-pro-preview' && !canUseProLyria;
                          const active = effectiveLyriaModel === option.id;
                          return <button key={option.id} disabled={locked} onClick={() => setLyriaModel(option.id)} className={`rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-[#D4A945] bg-[#D4A945] text-black' : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-[#D4A94555]'}`}><span className="block text-sm font-black">{option.label}</span><span className={`mt-1 block text-xs ${active ? 'text-black/70' : 'text-zinc-500'}`}>{locked ? 'Premium / Owner only' : option.note}</span></button>;
                        })}
                      </div>
                    </div>
                    <div><p className="mb-2 text-sm font-bold text-zinc-300">Quality</p>{chips(QUALITY, quality, setQuality)}</div>
                    <div><p className="mb-2 text-sm font-bold text-zinc-300">Genre</p>{chips(GENRES, genre, setGenre)}</div>
                    <div><p className="mb-2 text-sm font-bold text-zinc-300">Mood</p>{chips(MOODS, mood, setMood)}</div>
                    <div><p className="mb-2 text-sm font-bold text-zinc-300">Instruments</p><div className="flex flex-wrap gap-2">{INSTRUMENT_CHOICES.map(item => <button key={item} onClick={() => toggleInstrument(item)} className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors ${instruments.includes(item) ? 'border-[#D4A945] bg-[#D4A945] text-black' : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-[#D4A94555] hover:text-white'}`}>{item}</button>)}</div></div>
                  </div>
                </div>
                <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                  <h3 className="mb-5 text-lg font-black">Voice Direction</h3>
                  <div className="space-y-5"><div><p className="mb-2 text-sm font-bold text-zinc-300">Voice</p>{chips(VOICES, voice, setVoice)}</div><div><p className="mb-2 text-sm font-bold text-zinc-300">Strength</p>{chips(VOICE_STRENGTHS, voiceStrength, setVoiceStrength)}</div><div><p className="mb-2 text-sm font-bold text-zinc-300">Singer</p>{chips(SINGERS, singer, setSinger)}</div><div><p className="mb-2 text-sm font-bold text-zinc-300">Language</p>{chips(LANGS, lang, setLang)}</div></div>
                </div>
              </div>

              <div className="relative mt-6 grid gap-5 lg:grid-cols-2">
                <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                  <h3 className="mb-5 text-lg font-black">Taurus Voice Profile</h3>
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-zinc-300">Select saved voice<select value={selectedVoiceProfileId} onChange={e => setSelectedVoiceProfileId(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#070707] p-3 text-sm outline-none focus:border-[#D4A94588]"><option value="">No voice profile</option>{voiceProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                    <input value={voiceProfileName} onChange={e => setVoiceProfileName(e.target.value.slice(0,80))} placeholder="New voice profile name" className="w-full rounded-2xl border border-white/10 bg-[#070707] px-4 py-3 text-sm outline-none focus:border-[#D4A94588]"/>
                    <input type="file" accept="audio/*" onChange={e => { setVoiceSampleFile(e.target.files?.[0] || null); setRecordedVoiceBlob(null); }} className="w-full rounded-2xl border border-white/10 bg-[#070707] px-4 py-3 text-sm text-zinc-300 file:mr-3 file:rounded-xl file:border-0 file:bg-[#D4A945] file:px-3 file:py-2 file:font-black file:text-black"/>
                    <div className="flex flex-wrap gap-2"><button onClick={recording ? stopVoiceRecording : startVoiceRecording} className={`rounded-2xl px-4 py-3 text-sm font-black ${recording ? 'bg-red-500 text-white' : 'border border-[#D4A94555] text-[#D4A945]'}`}>{recording ? 'Stop Recording' : 'Record Voice'}</button>{recordedVoiceBlob && <span className="rounded-2xl border border-emerald-400/30 px-4 py-3 text-sm font-bold text-emerald-300">Recorded sample ready</span>}</div>
                    <label className="flex gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300"><input type="checkbox" checked={voiceConsent} onChange={e => setVoiceConsent(e.target.checked)} className="mt-1 accent-[#D4A945]"/><span>I own this voice or have permission to use it in Taurus Music.</span></label>
                    <button onClick={saveCurrentVoiceProfile} disabled={voiceSaving || !user} className="w-full rounded-2xl bg-[#D4A945] px-4 py-3 text-sm font-black text-black disabled:opacity-50">{voiceSaving ? 'Saving...' : 'Save Voice Profile'}</button>
                  </div>
                </div>
                <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                  <h3 className="mb-5 text-lg font-black">Cover / Remix Guard</h3>
                  <div className="space-y-4">
                    <select value={remixMode} onChange={e => setRemixMode(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#070707] p-3 text-sm outline-none focus:border-[#D4A94588]">{REMIX_MODES.map(mode => <option key={mode}>{mode}</option>)}</select>
                    <input type="file" accept="audio/*" onChange={e => setRemixReferenceFile(e.target.files?.[0] || null)} className="w-full rounded-2xl border border-white/10 bg-[#070707] px-4 py-3 text-sm text-zinc-300 file:mr-3 file:rounded-xl file:border-0 file:bg-[#D4A945] file:px-3 file:py-2 file:font-black file:text-black"/>
                    <textarea value={remixLyrics} onChange={e => setRemixLyrics(e.target.value.slice(0,1200))} rows={5} placeholder="Melody / lyrics / reference notes..." className="w-full resize-none rounded-2xl border border-white/10 bg-[#070707] p-4 text-sm leading-6 outline-none focus:border-[#D4A94588]"/>
                    <label className="flex gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300"><input type="checkbox" checked={remixConsent} onChange={e => setRemixConsent(e.target.checked)} className="mt-1 accent-[#D4A945]"/><span>I have rights or permission for this reference. Taurus must create a safe original variation, not an exact clone.</span></label>
                  </div>
                </div>
              </div>

              <div className="relative mt-6 grid gap-5 lg:grid-cols-[1fr_260px]">
                <label className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                  <span className="mb-3 flex items-center justify-between text-sm font-black"><span>BPM</span><span className="rounded-full bg-[#D4A945] px-3 py-1 text-xs text-black">{bpm}</span></span>
                  <input type="range" min="60" max="200" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-full accent-[#D4A945]"/>
                </label>
                <label className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                  <span className="mb-3 block text-sm font-black">Structure</span>
                  <select value={structure} onChange={e => setStructure(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#070707] p-3 text-sm outline-none focus:border-[#D4A94588]">{STRUCTURES.map(s => <option key={s}>{s}</option>)}</select>
                </label>
              </div>

              <div className="relative mt-6 flex flex-col gap-3 rounded-[1.75rem] border border-[#D4A94533] bg-[#D4A9450d] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-black text-white">Studio render queue</p><p className="mt-1 text-xs text-zinc-500">{progress}</p></div>
                <button onClick={generate} disabled={isGenerating || !user || !profile} className="rounded-2xl bg-[#D4A945] px-6 py-4 font-black text-black transition-colors hover:bg-[#e6bd5b] disabled:opacity-50">{isGenerating ? <Loader2 className="mr-2 inline h-5 w-5 animate-spin"/> : <Sparkles className="mr-2 inline h-5 w-5"/>}{!user ? 'Login Gmail to use free credits' : !profile ? 'Loading profile...' : `Generate ${generationCountLabel} · ${GENERATE_TWO_SONGS_COST} credits`}</button>
              </div>
            </div>
          </div>}
            {activePage === 'history' && <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"><div className="mb-4 flex items-center justify-between"><h3 className="text-2xl font-bold"><History className="mr-2 inline h-5 w-5 text-violet-300"/>Song History</h3><span className="text-sm text-zinc-500">{filtered.length}</span></div><div className="grid gap-3">{filtered.map(song => <div key={song.id} className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-semibold">{song.idea}</p><p className="text-xs text-zinc-500">{formatDate(song.createdAt)}</p><div className="mt-2 flex gap-2"><button onClick={() => setFeedback('like')} className="rounded-full bg-white/5 p-2"><ThumbsUp className="h-4 w-4"/></button><button onClick={() => setFeedback('needs stronger beat/harmony')} className="rounded-full bg-white/5 p-2"><ThumbsDown className="h-4 w-4"/></button></div></div><div className="flex gap-2"><button onClick={() => playSong(song)} className="rounded-2xl bg-white px-4 py-2 text-zinc-950">{currentSong?.id===song.id && isPlaying ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}</button><button onClick={() => downloadSong(song)} className="rounded-2xl border border-white/10 px-4 py-2"><Download className="h-4 w-4"/></button></div></div>)}{filtered.length===0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-400">No songs yet.</p>}</div></div>}</section>
          <aside className="space-y-6">{activePage === 'create' && <div className="rounded-[2rem] border border-white/10 bg-[#11100d]/95 p-6 shadow-2xl shadow-black/30">
            <h3 className="text-xl font-black">Studio Monitor</h3>
            <div className="mt-5 space-y-4">
              <div className="rounded-3xl border border-[#D4A94533] bg-[#D4A9450d] p-4"><p className="text-xs font-black uppercase tracking-[0.24em] text-[#D4A945]">Credits</p><p className="mt-2 text-2xl font-black text-white">{credits}</p></div>
              <div className="grid grid-cols-2 gap-3"><div className="rounded-3xl bg-black/30 p-4"><p className="text-xs text-zinc-500">Free month</p><p className="mt-1 text-xl font-black">{daily}</p></div><div className="rounded-3xl bg-black/30 p-4"><p className="text-xs text-zinc-500">Songs</p><p className="mt-1 text-xl font-black">{history.length}</p></div></div>
              <div className="rounded-3xl border border-white/10 bg-black/30 p-4"><p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Signal Chain</p><div className="mt-3 space-y-2 text-sm text-zinc-400"><p>Prompt &gt; Lyrics &gt; Section Map</p><p>Vocal Chain &gt; Instrumental Chain</p><p>Master &gt; Save &gt; Export</p></div></div>
              <button onClick={() => openPanel('voice')} className="w-full rounded-2xl border border-[#D4A94555] bg-transparent px-4 py-3 text-sm font-black text-[#D4A945] transition-colors hover:bg-[#D4A945] hover:text-black"><Mic2 className="mr-2 inline h-4 w-4"/>Open Taurus Voice</button>
            </div>
          </div>}{activePage === 'wallet' && walletPanel}{activePage === 'plans' && plansPanel}</aside>
        </div>
      </main>
    </div>
    {showAdmin && admin && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[2rem] border border-white/10 bg-[#0c0c18] p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-bold"><Settings className="mr-2 inline h-5 w-5"/>Admin</h2><button onClick={closePanel} className="rounded-2xl border border-white/10 px-4 py-2">Close</button></div>{pendingUsers.length===0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-400"><Clock3 className="mr-2 inline h-4 w-4"/>No pending payments.</p>}{pendingUsers.map(u => <div key={u.uid} className="mb-3 rounded-3xl border border-white/10 p-4"><p className="font-semibold">{u.email}</p><p className="text-sm text-zinc-400">{PLAN_CONFIGS[u.requestedTier || 'premium']?.name}</p>{u.paymentProofUrl && <a href={u.paymentProofUrl} target="_blank" rel="noreferrer" className="text-violet-300 underline">View proof</a>}<div className="mt-3 flex gap-2"><button onClick={() => approvePayment(u.uid, u.requestedTier || 'premium')} className="rounded-2xl bg-emerald-500 px-4 py-2">Approve</button><button onClick={() => rejectPayment(u.uid, 'Receipt not confirmed')} className="rounded-2xl bg-red-500 px-4 py-2">Reject</button></div></div>)}</div></div>}
  </div>;
}
