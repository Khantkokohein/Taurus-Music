import React, { useState } from 'react';
import { ArrowLeft, Bookmark, CalendarDays, ChevronRight, Crown, Gift, Heart, MessageCircle, Music, Play, ShieldCheck, Sparkles, Trophy, Users } from 'lucide-react';
import { ChallengeEntry, CHALLENGE_GENERATE_ATTEMPTS } from '../firebase';

export type ChallengePage = 'challenge' | 'challenge-rules' | 'challenge-feed' | 'challenge-leaderboard';

type ReactionState = Record<string, { liked?: boolean; saved?: boolean }>;

type ChallengeHubProps = {
  page: ChallengePage;
  entries: ChallengeEntry[];
  selectedSongTitle?: string;
  isRegistered: boolean;
  registrationOpen: boolean;
  creationOpen: boolean;
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
  entryId?: string;
  isRegistering: boolean;
  postingSongId: string;
  commentTextByEntry: Record<string, string>;
  reactionState: ReactionState;
  playingEntryId?: string;
  onNavigate: (page: ChallengePage) => void;
  onBack: () => void;
  onRegister: () => void;
  onCreateSong: () => void;
  onPostSelectedSong: () => void;
  onPlayEntry: (entry: ChallengeEntry) => void;
  onToggleLike: (entry: ChallengeEntry) => void;
  onToggleSave: (entry: ChallengeEntry) => void;
  onCommentChange: (entryId: string, value: string) => void;
  onSubmitComment: (entry: ChallengeEntry) => void;
};

const prizeRows = [
  { place: '1st', value: '$500', tone: 'text-[#D4A945]' },
  { place: '2nd', value: '$300', tone: 'text-zinc-200' },
  { place: '3rd', value: '$200', tone: 'text-amber-600' },
];

const timeline = [
  { icon: CalendarDays, label: 'Registration', value: 'May 7, 2026 - May 15, 2026' },
  { icon: Music, label: 'Creation', value: 'May 16, 2026 - May 19, 2026' },
  { icon: Trophy, label: 'Winner / Payout', value: 'May 20, 2026' },
];

const challengeRules = [
  {
    en: 'Registration is free inside Taurus Studio. Only registered users can join the challenge.',
    my: 'Taurus Studio အတွင်း စာရင်းသွင်းခြင်းသည် အခမဲ့ဖြစ်ပြီး စာရင်းသွင်းထားသူများသာ Challenge တွင် ပါဝင်နိုင်သည်။',
  },
  {
    en: `Registered users receive ${CHALLENGE_GENERATE_ATTEMPTS} generate attempts, equal to 10 premium full-song creations.`,
    my: `စာရင်းသွင်းထားသူတိုင်း Generate ${CHALLENGE_GENERATE_ATTEMPTS} ကြိမ် ရရှိပြီး Premium full song ၁၀ ပုဒ် ဖန်တီးနိုင်သည်။`,
  },
  {
    en: 'Each participant can post only one favorite original song as the official entry.',
    my: 'ပါဝင်သူတစ်ဦးလျှင် မိမိအကြိုက်ဆုံး Original song တစ်ပုဒ်သာ official entry အဖြစ် post တင်နိုင်သည်။',
  },
  {
    en: 'Voice recording, instrumentals, AI lyrics, and AI singing are allowed when the work is original.',
    my: 'မိမိကိုယ်ပိုင် idea အပေါ်အခြေခံထားပါက voice recording, instrumentals, AI lyrics နှင့် AI singing ကို အသုံးပြုနိုင်သည်။',
  },
  {
    en: 'Cover songs, copied melodies, artist voice cloning, and copyrighted material are not allowed.',
    my: 'Cover song, melody ကူးယူခြင်း, artist voice cloning နှင့် မူပိုင်ခွင့်ရှိသော material များကို အသုံးပြုခွင့်မရှိပါ။',
  },
  {
    en: 'Leaderboard score is Likes + Comments + Saves. Each valid action is 1 point.',
    my: 'Leaderboard score သည် Likes + Comments + Saves စုစုပေါင်းဖြစ်ပြီး action တစ်ခုလျှင် ၁ point ဖြစ်သည်။',
  },
  {
    en: 'Spam, fake abuse, copied accounts, or rule-breaking entries may be removed by the Taurus Team.',
    my: 'Spam, fake abuse, copied accounts သို့မဟုတ် စည်းကမ်းချိုးဖောက်သော entry များကို Taurus Team မှ ဖယ်ရှားနိုင်သည်။',
  },
];

const studioRoomImage = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=85';

const creatorVisuals = [
  { name: 'Vocal Booth', role: 'Singer', image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=500&q=80', glow: 'from-[#D4A945]/45 via-fuchsia-500/18 to-sky-500/18' },
  { name: 'Studio Duo', role: 'Producer', image: 'https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=500&q=80', glow: 'from-emerald-400/30 via-[#D4A945]/28 to-violet-500/20' },
  { name: 'Mic Room', role: 'Artist', image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=500&q=80', glow: 'from-pink-500/30 via-orange-400/25 to-[#D4A945]/28' },
  { name: 'Stage Cut', role: 'Creator', image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=500&q=80', glow: 'from-cyan-400/25 via-violet-500/25 to-[#D4A945]/28' },
];

const formatCount = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K` : String(value || 0);
const scoreOf = (entry: ChallengeEntry) => Number(entry.score || 0);
const visualIndexFor = (seed: string) => Math.abs([...seed].reduce((total, char) => total + char.charCodeAt(0), 0)) % creatorVisuals.length;
const visualForEntry = (entry: Pick<ChallengeEntry, 'id' | 'userId'>, index = 0) => creatorVisuals[visualIndexFor(entry.id || entry.userId || String(index))];

function BackButton({ onBack }: { onBack: () => void }) {
  return <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-zinc-200 hover:border-[#D4A94555] hover:text-[#D4A945]"><ArrowLeft className="h-4 w-4" />Back</button>;
}

function ChallengeShell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[1.5rem] border border-[#D4A94522] bg-[#11100d]/95 p-4 shadow-2xl shadow-black/40 sm:p-6 lg:p-7">
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(212,169,69,.10),transparent_34%,rgba(45,212,191,.06)_64%,rgba(168,85,247,.08))]" />
    <div className="relative">
    <div className="mb-6 flex items-center justify-between gap-3"><BackButton onBack={onBack} /><span className="rounded-full border border-[#D4A94533] bg-[#D4A94512] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#D4A945]">Studio Challenge</span></div>
    {children}
    </div>
  </div>;
}

function CreatorAvatarStrip({ entries = [] as ChallengeEntry[] }) {
  const visuals = entries.length ? entries.slice(0, 4).map((entry, index) => ({ ...visualForEntry(entry, index), name: entry.authorName || 'Creator', role: `${formatCount(scoreOf(entry))} pts` })) : creatorVisuals;
  return <div className="flex -space-x-3">
    {visuals.map((creator, index) => <img key={`${creator.name}-${index}`} src={creator.image} alt={creator.name} className="h-11 w-11 rounded-full border-2 border-[#11100d] object-cover shadow-lg shadow-black/40" />)}
  </div>;
}

function StudioRoomFeature({ entries = [], compact = false }: { entries?: ChallengeEntry[]; compact?: boolean }) {
  return <div className={`relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30 ${compact ? 'min-h-52' : 'min-h-72'}`}>
    <img src={studioRoomImage} alt="Colorful Taurus challenge studio room" className="absolute inset-0 h-full w-full object-cover opacity-80" />
    <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(0,0,0,.78),rgba(0,0,0,.18)_48%,rgba(0,0,0,.75)),linear-gradient(28deg,rgba(212,169,69,.26),transparent_42%,rgba(45,212,191,.18))]" />
    <div className="relative flex h-full min-h-[inherit] flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#D4A945]">Challenge Studio</p>
          <h3 className="mt-2 max-w-56 text-2xl font-black leading-tight text-white">Original sound room</h3>
        </div>
        <CreatorAvatarStrip entries={entries} />
      </div>
      <div className="mt-12 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Visual</p><p className="mt-1 text-sm font-black text-white">Studio vibe</p></div>
        <div className="rounded-2xl border border-[#D4A94544] bg-[#D4A9451a] p-3 backdrop-blur"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D4A945]">Prize</p><p className="mt-1 text-sm font-black text-white">$1000 TC</p></div>
      </div>
    </div>
  </div>;
}

function CreatorPreviewGrid() {
  return <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {creatorVisuals.map(creator => <div key={creator.name} className={`overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${creator.glow} p-[1px]`}>
      <div className="rounded-2xl bg-black/70 p-3">
        <img src={creator.image} alt={creator.name} className="h-24 w-full rounded-xl object-cover" />
        <p className="mt-3 truncate text-sm font-black text-white">{creator.name}</p>
        <p className="text-xs text-zinc-400">{creator.role}</p>
      </div>
    </div>)}
  </div>;
}

function EmptyFeed() {
  return <div className="rounded-[1.25rem] border border-white/10 bg-black/30 p-6 text-center">
    <Music className="mx-auto h-12 w-12 text-[#D4A945]" />
    <h3 className="mt-4 text-2xl font-black text-white">No challenge entries yet</h3>
    <p className="mt-2 text-sm leading-6 text-zinc-400">Entries appear here after registered creators post one original song.</p>
    <CreatorPreviewGrid />
  </div>;
}

function EntryCard({
  entry,
  index,
  active,
  commentText,
  reactionState,
  onPlay,
  onToggleLike,
  onToggleSave,
  onCommentChange,
  onSubmitComment,
}: {
  entry: ChallengeEntry;
  index: number;
  active: boolean;
  commentText: string;
  reactionState?: { liked?: boolean; saved?: boolean };
  onPlay: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onCommentChange: (value: string) => void;
  onSubmitComment: () => void;
}) {
  const liked = reactionState?.liked === true;
  const saved = reactionState?.saved === true;
  const visual = visualForEntry(entry, index);
  return <section className="snap-start rounded-[1.35rem] border border-[#D4A94522] bg-[radial-gradient(circle_at_20%_10%,rgba(212,169,69,.16),transparent_28%),linear-gradient(145deg,#15120b,#060606)] p-4 shadow-2xl shadow-black/40">
    <div className="grid min-h-[440px] gap-5 lg:grid-cols-[300px_1fr_74px]">
      <div className={`relative min-h-72 overflow-hidden rounded-[1.1rem] bg-gradient-to-br ${visual.glow} p-[1px]`}>
        <img src={visual.image} alt={entry.authorName || visual.name} className="absolute inset-0 h-full w-full rounded-[1.1rem] object-cover opacity-85" />
        <div className="absolute inset-0 rounded-[1.1rem] bg-gradient-to-t from-black/85 via-black/18 to-black/20" />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4A945]">Original Entry</p>
          <p className="mt-1 truncate text-lg font-black text-white">@{entry.authorName}</p>
        </div>
      </div>
      <div className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full border border-[#D4A94555] bg-[#D4A94518] px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#D4A945]">{String(index + 1).padStart(2, '0')} / Challenge</span>
            <span className="rounded-full bg-black/40 px-4 py-2 text-xs font-black text-zinc-300">{formatCount(scoreOf(entry))} pts</span>
          </div>
          <h2 className="mt-8 max-w-3xl text-3xl font-black leading-tight text-white md:text-5xl">{entry.title}</h2>
          <p className="mt-4 text-sm font-semibold text-[#D4A945]">@{entry.authorName}</p>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400">{entry.prompt || 'Original Taurus Studio challenge entry.'}</p>
        </div>
        <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/45 p-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={onPlay} className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#D4A945] text-black shadow-xl shadow-[#D4A94522]"><Play className="h-6 w-6 fill-current" /></button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-black text-white">{active ? 'Playing now' : 'Tap to listen'}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-[#D4A945] ${active ? 'w-2/3' : 'w-1/4'}`} /></div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <input value={commentText} onChange={event => onCommentChange(event.target.value)} placeholder="Add a comment..." className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm outline-none focus:border-[#D4A94588]" />
            <button type="button" onClick={onSubmitComment} className="rounded-2xl bg-[#D4A945] px-4 py-3 text-sm font-black text-black">Post</button>
          </div>
        </div>
      </div>
      <div className="flex flex-row justify-center gap-3 lg:flex-col">
        <button type="button" onClick={onToggleLike} className={`grid min-h-20 flex-1 place-items-center rounded-3xl border px-2 py-3 text-center lg:flex-none ${liked ? 'border-[#D4A945] bg-[#D4A945] text-black' : 'border-white/10 bg-black/30 text-white'}`}><Heart className={`h-6 w-6 ${liked ? 'fill-current' : ''}`} /><span className="text-xs font-black">{formatCount(entry.likeCount)}</span></button>
        <div className="grid min-h-20 flex-1 place-items-center rounded-3xl border border-white/10 bg-black/30 px-2 py-3 text-center text-white lg:flex-none"><MessageCircle className="h-6 w-6" /><span className="text-xs font-black">{formatCount(entry.commentCount)}</span></div>
        <button type="button" onClick={onToggleSave} className={`grid min-h-20 flex-1 place-items-center rounded-3xl border px-2 py-3 text-center lg:flex-none ${saved ? 'border-[#D4A945] bg-[#D4A945] text-black' : 'border-white/10 bg-black/30 text-white'}`}><Bookmark className={`h-6 w-6 ${saved ? 'fill-current' : ''}`} /><span className="text-xs font-black">{formatCount(entry.saveCount)}</span></button>
      </div>
    </div>
  </section>;
}

export default function ChallengeHub(props: ChallengeHubProps) {
  const [rulesLanguage, setRulesLanguage] = useState<'en' | 'my'>('en');
  const sortedEntries = [...props.entries].sort((a, b) => scoreOf(b) - scoreOf(a));
  const topThree = sortedEntries.slice(0, 3);
  const quotaLimit = props.quotaLimit || CHALLENGE_GENERATE_ATTEMPTS;

  if (props.page === 'challenge-rules') {
    return <ChallengeShell onBack={props.onBack}>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-4xl font-black text-white md:text-6xl">Official Rules & Timeline</h2>
            <p className="mt-4 text-zinc-400">English first. Use Translate to read the Myanmar version.</p>
          </div>
          <button type="button" onClick={() => setRulesLanguage(current => current === 'en' ? 'my' : 'en')} className="rounded-2xl border border-[#D4A94555] bg-[#D4A94512] px-5 py-3 text-sm font-black text-[#D4A945] hover:bg-[#D4A945] hover:text-black">
            {rulesLanguage === 'en' ? 'Translate Myanmar' : 'Show English'}
          </button>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-[0.78fr_1fr]">
          <StudioRoomFeature entries={sortedEntries} compact />
          <div className="grid gap-3">
            {timeline.map(item => <div key={item.label} className="flex items-center gap-4 rounded-[1.25rem] border border-[#D4A94533] bg-black/30 p-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#D4A945] text-black"><item.icon className="h-5 w-5" /></div>
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4A945]">{item.label}</p><p className="mt-1 text-base font-black text-white">{item.value}</p></div>
            </div>)}
          </div>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-2xl font-black text-white">Creation Rules</h3>
              <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{rulesLanguage === 'en' ? 'English' : 'Myanmar'}</span>
            </div>
            <div className="mt-5 grid gap-3">{challengeRules.map((rule, index) => <div key={rule.en} className="flex gap-3 rounded-2xl bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300"><ShieldCheck className="h-5 w-5 shrink-0 text-[#D4A945]" /><span><strong className="mr-2 text-[#D4A945]">{index + 1}.</strong>{rule[rulesLanguage]}</span></div>)}</div>
          </div>
          <div className="rounded-[1.5rem] border border-[#D4A94533] bg-[#D4A9450d] p-6">
            <Trophy className="h-10 w-10 text-[#D4A945]" />
            <h3 className="mt-5 text-2xl font-black text-white">Taurus Coin $1000</h3>
            <div className="mt-5 grid gap-3">{prizeRows.map(row => <div key={row.place} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/35 p-4"><span className="font-black text-white">{row.place} Place</span><span className={`text-2xl font-black ${row.tone}`}>{row.value}</span></div>)}</div>
          </div>
        </div>
      </div>
    </ChallengeShell>;
  }

  if (props.page === 'challenge-feed') {
    return <ChallengeShell onBack={props.onBack}>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><h2 className="text-4xl font-black text-white md:text-5xl">Challenge Media</h2><p className="mt-3 text-sm text-zinc-400">Swipe-style public listening feed for original entries.</p></div>
        <button type="button" onClick={() => props.onNavigate('challenge-leaderboard')} className="rounded-2xl border border-[#D4A94555] px-5 py-3 text-sm font-black text-[#D4A945] hover:bg-[#D4A945] hover:text-black">Leaderboard</button>
      </div>
      <div className="max-h-[72vh] space-y-6 overflow-y-auto snap-y snap-mandatory pr-1">
        {sortedEntries.length === 0 ? <EmptyFeed /> : sortedEntries.map((entry, index) => <React.Fragment key={entry.id}><EntryCard entry={entry} index={index} active={props.playingEntryId === entry.id} commentText={props.commentTextByEntry[entry.id] || ''} reactionState={props.reactionState[entry.id]} onPlay={() => props.onPlayEntry(entry)} onToggleLike={() => props.onToggleLike(entry)} onToggleSave={() => props.onToggleSave(entry)} onCommentChange={value => props.onCommentChange(entry.id, value)} onSubmitComment={() => props.onSubmitComment(entry)} /></React.Fragment>)}
      </div>
    </ChallengeShell>;
  }

  if (props.page === 'challenge-leaderboard') {
    return <ChallengeShell onBack={props.onBack}>
      <div className="mx-auto max-w-6xl">
        <div className="text-center"><Crown className="mx-auto h-12 w-12 text-[#D4A945]" /><h2 className="mt-4 text-4xl font-black text-white md:text-6xl">Leaderboard</h2><p className="mt-3 text-sm text-zinc-400">Ranked by Likes + Comments + Saves.</p></div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {topThree.map((entry, index) => {
            const visual = visualForEntry(entry, index);
            return <div key={entry.id} className={`overflow-hidden rounded-[1.25rem] border bg-black/35 ${index === 0 ? 'border-[#D4A945] shadow-xl shadow-[#D4A94511]' : 'border-white/10'}`}>
            <div className={`relative h-36 bg-gradient-to-br ${visual.glow}`}>
              <img src={visual.image} alt={entry.authorName} className="absolute inset-0 h-full w-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/5" />
              <div className="absolute bottom-3 left-3 grid h-12 w-12 place-items-center rounded-full bg-[#D4A945] text-xl font-black text-black">{index + 1}</div>
            </div>
            <div className="p-4">
              <h3 className="truncate text-lg font-black text-white">{entry.authorName}</h3>
              <p className="mt-1 truncate text-sm text-zinc-400">{entry.title}</p>
              <p className="mt-4 text-2xl font-black text-[#D4A945]">{formatCount(scoreOf(entry))} pts</p>
            </div>
          </div>;
          })}
          {topThree.length === 0 && <div className="col-span-full"><EmptyFeed /></div>}
        </div>
        <div className="mt-6 overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30">
          {sortedEntries.map((entry, index) => { const visual = visualForEntry(entry, index); return <div key={entry.id} className="grid grid-cols-[54px_42px_1fr_80px] items-center gap-3 border-b border-white/10 p-3 last:border-b-0">
            <span className="text-xl font-black text-[#D4A945]">#{index + 1}</span>
            <img src={visual.image} alt={entry.authorName} className="h-10 w-10 rounded-full object-cover" />
            <div className="min-w-0"><p className="truncate font-black text-white">{entry.title}</p><p className="truncate text-sm text-zinc-500">@{entry.authorName} - {formatCount(entry.likeCount)} likes - {formatCount(entry.commentCount)} comments - {formatCount(entry.saveCount)} saves</p></div>
            <span className="text-right font-black text-white">{formatCount(scoreOf(entry))}</span>
          </div>; })}
        </div>
      </div>
    </ChallengeShell>;
  }

  return <ChallengeShell onBack={props.onBack}>
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr_300px]">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#D4A94555] bg-[#D4A94518] px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#D4A945]"><Sparkles className="h-4 w-4" />Free Registration</div>
        <h2 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-white md:text-5xl">Taurus Music Studio Challenge</h2>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">Create original songs, post one favorite track, and compete for Taurus Coin $1000.</p>
        <CreatorPreviewGrid />
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={props.onRegister} disabled={!props.registrationOpen || props.isRegistered || props.isRegistering} className="rounded-2xl bg-[#D4A945] px-6 py-4 font-black text-black disabled:opacity-50">{props.isRegistering ? 'Registering...' : props.isRegistered ? 'Registered' : props.registrationOpen ? 'Register Free' : 'Registration opens May 7'}</button>
          <button type="button" onClick={props.onCreateSong} className="rounded-2xl border border-[#D4A94555] px-6 py-4 font-black text-[#D4A945] hover:bg-[#D4A945] hover:text-black">Create Song</button>
          <button type="button" onClick={() => props.onNavigate('challenge-rules')} className="rounded-2xl border border-white/10 px-6 py-4 font-black text-white hover:border-[#D4A94555]">Rules</button>
        </div>
      </div>
      <div className="space-y-4">
        <StudioRoomFeature entries={sortedEntries} />
        <div className="grid gap-3">
          {timeline.map(item => <div key={item.label} className="flex items-center gap-4 rounded-3xl border border-white/10 bg-black/30 p-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#D4A94514]"><item.icon className="h-5 w-5 text-[#D4A945]" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{item.label}</p><p className="mt-1 text-sm font-black text-white">{item.value}</p></div></div>)}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-[1.25rem] border border-[#D4A94533] bg-[#D4A9450d] p-5">
          <Gift className="h-9 w-9 text-[#D4A945]" />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-[#D4A945]">Challenge Quota</p>
          <p className="mt-2 text-3xl font-black text-white">{props.isRegistered ? `${props.quotaRemaining}/${quotaLimit}` : `0/${quotaLimit}`}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">1 generate creates 2 full songs. Registered users get 5 generate attempts.</p>
        </div>
        <button type="button" onClick={props.onPostSelectedSong} disabled={!props.selectedSongTitle || !props.isRegistered || !!props.entryId || !!props.postingSongId} className="w-full rounded-[1.25rem] border border-white/10 bg-black/30 p-5 text-left transition hover:border-[#D4A94555] disabled:opacity-50">
          <div className="flex items-center justify-between gap-3"><div><p className="font-black text-white">Post selected song</p><p className="mt-2 text-sm text-zinc-500">{props.entryId ? 'Entry already posted' : props.selectedSongTitle || 'Select a song from History first'}</p></div><ChevronRight className="h-5 w-5 text-[#D4A945]" /></div>
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => props.onNavigate('challenge-feed')} className="rounded-[1.25rem] border border-white/10 bg-black/30 p-5 text-left hover:border-[#D4A94555]"><Play className="h-6 w-6 text-[#D4A945]" /><p className="mt-3 font-black text-white">Media</p><p className="text-sm text-zinc-500">{props.entries.length} entries</p></button>
          <button type="button" onClick={() => props.onNavigate('challenge-leaderboard')} className="rounded-[1.25rem] border border-white/10 bg-black/30 p-5 text-left hover:border-[#D4A94555]"><Users className="h-6 w-6 text-[#D4A945]" /><p className="mt-3 font-black text-white">Leaders</p><p className="text-sm text-zinc-500">Top 3 prizes</p></button>
        </div>
      </div>
    </div>
  </ChallengeShell>;
}
