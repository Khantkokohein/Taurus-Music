import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { User } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Gauge,
  Key,
  Plus,
  RotateCcw,
  Server,
  ShieldCheck,
  TerminalSquare,
  Wallet,
  X,
} from 'lucide-react';
import {
  buildTaurusAccountCode,
  db,
  DEFAULT_API_RATE_LIMIT_PER_MINUTE,
  getEffectivePlanConfig,
  SONG_CREDIT_COST,
  TAURUS_COIN_PER_USDT,
  UserProfile,
} from '../firebase';

type ApiKeyScope = 'song.generate' | 'voice.use' | 'lyrics.generate';

interface DeveloperApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  status: 'active' | 'revoked';
  usageCount?: number;
  rateLimitPerMinute?: number;
  createdAt?: { toMillis?: () => number };
}

interface DeveloperHubProps {
  currentUser: User | null;
  profile: UserProfile | null;
  onClose: () => void;
}

const API_SCOPES: ApiKeyScope[] = ['song.generate', 'voice.use', 'lyrics.generate'];

const apiPlans = [
  { name: 'Starter', key: 'taurus_starter', tokens: '0.05M', used: 0.012, remaining: '0.038M', price: '$9' },
  { name: 'Studio Pro', key: 'taurus_pro', tokens: '0.2M', used: 0.086, remaining: '0.114M', price: '$39' },
  { name: 'Label', key: 'taurus_label', tokens: '1M', used: 0.42, remaining: '0.58M', price: '$99' },
];

const deploySteps = [
  { title: 'Create Key', desc: 'Generate Taurus API key for your website or app.', icon: Key },
  { title: 'Server Route', desc: 'Call Taurus API from backend only. Do not expose the key in browser.', icon: Server },
  { title: 'Cloud Run', desc: 'Deploy backend proxy on Google Cloud Run / Vercel Functions.', icon: Database },
  { title: 'Monitor', desc: 'Watch credits, rate limit, failed calls, and abuse flags.', icon: Gauge },
];

const bytesToHex = (bytes: Uint8Array) => (
  Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
);

const createSecret = () => `taurus_sk_${bytesToHex(crypto.getRandomValues(new Uint8Array(32)))}`;

const sha256 = async (value: string) => {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(buffer));
};

const formatCreatedAt = (key: DeveloperApiKey) => {
  const createdAt = key.createdAt?.toMillis?.();
  return createdAt ? new Date(createdAt).toLocaleDateString() : 'New';
};

const requestSnippet = `POST /api/v1/generate-song
Authorization: Bearer taurus_sk_xxx
Content-Type: application/json

{
  "prompt": "full song idea",
  "lyrics": "optional full lyrics",
  "voiceId": "taurus_voice_id",
  "model": "taurus-studio"
}`;

const envSnippet = `TAURUS_API_KEY=taurus_sk_xxxxx
TAURUS_API_BASE=https://taurus-music.vercel.app
TAURUS_RATE_LIMIT=60`;

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[1.75rem] border border-white/10 bg-[#11100d]/90 shadow-2xl shadow-black/30 ${className}`}>
      {children}
    </div>
  );
}

function ActionButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default function DeveloperHub({ currentUser, profile, onClose }: DeveloperHubProps) {
  const [apiKeys, setApiKeys] = useState<DeveloperApiKey[]>([]);
  const [keyName, setKeyName] = useState('Taurus Website Key');
  const [generatedSecret, setGeneratedSecret] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState('');

  const activePlan = useMemo(() => getEffectivePlanConfig(profile), [profile]);
  const taurusId = profile?.taurusId || (currentUser ? buildTaurusAccountCode(currentUser.uid) : 'Login required');
  const activeKeys = apiKeys.filter(key => key.status === 'active').length;

  useEffect(() => {
    if (!currentUser) {
      setApiKeys([]);
      return undefined;
    }

    const keysQuery = query(
      collection(db, 'users', currentUser.uid, 'apiKeys'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(keysQuery, (snapshot) => {
      setApiKeys(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as DeveloperApiKey)));
    });
  }, [currentUser]);

  const handleCreateKey = async () => {
    if (!currentUser) {
      setStatus('Login required to create an API key.');
      return;
    }

    setIsCreating(true);
    setStatus('');
    try {
      const secret = createSecret();
      const keyHash = await sha256(secret);
      const keyRef = doc(collection(db, 'users', currentUser.uid, 'apiKeys'));

      await setDoc(keyRef, {
        ownerId: currentUser.uid,
        name: keyName.trim().slice(0, 80) || 'Taurus API Key',
        prefix: secret.slice(0, 18),
        keyHash,
        scopes: API_SCOPES,
        status: 'active',
        usageCount: 0,
        rateLimitPerMinute: DEFAULT_API_RATE_LIMIT_PER_MINUTE,
        createdAt: serverTimestamp(),
        lastUsedAt: null,
      });

      setGeneratedSecret(secret);
      setStatus('API key created. Copy it now; it will only be shown once.');
    } catch (error: any) {
      setStatus(error?.message || 'API key creation failed.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!currentUser) return;
    await updateDoc(doc(db, 'users', currentUser.uid, 'apiKeys', keyId), {
      status: 'revoked',
      revokedAt: serverTimestamp(),
    });
    setStatus('API key revoked.');
  };

  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setStatus(message);
    } catch {
      setStatus('Copy blocked by browser permission. Select the snippet and copy manually.');
    }
  };

  const handleCopySecret = () => {
    if (!generatedSecret) return;
    void copyText(generatedSecret, 'Copied API key.');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[125] bg-[#070707] text-white"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(212,169,69,.12),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(255,255,255,.06),transparent_24%)]" />
      <div className="relative flex h-full flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#070707]/90 px-4 backdrop-blur-xl lg:px-8">
          <button type="button" onClick={onClose} className="flex items-center gap-3 text-left" title="Back to Taurus">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#D4A94514] text-[#D4A945]">
              <Key size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.28em]">Developers</h2>
              <p className="text-[10px] font-bold text-white/45">API keys, quotas, deploy docs</p>
            </div>
          </button>
          <ActionButton
            onClick={onClose}
            className="border border-white/10 bg-white/[0.04] p-3 text-white/55 hover:text-white"
            title="Close Developers"
          >
            <X size={18} />
          </ActionButton>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[1fr_390px]">
            <section className="space-y-6">
              <Panel>
                <div className="grid gap-8 p-5 lg:grid-cols-[1fr_260px] lg:p-7">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.32em] text-[#D4A945]">Taurus API Access</p>
                    <h3 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Build with Taurus Music</h3>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">
                      External website, Cloud Run backend, upload flow, voice use, and song generation can connect through Taurus API. Private keys stay server-side.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <ActionButton onClick={handleCreateKey} disabled={!currentUser || isCreating} className="bg-[#D4A945] text-black hover:bg-[#e6bd5b]">
                        <Plus size={15} /> {isCreating ? 'Creating' : 'Create API Key'}
                      </ActionButton>
                      <ActionButton onClick={() => void copyText(requestSnippet, 'Copied API request example.')} className="border border-[#D4A94555] bg-transparent text-[#D4A945] hover:bg-[#D4A945] hover:text-black">
                        <Copy size={15} /> Copy API Call
                      </ActionButton>
                      <ActionButton onClick={onClose} className="border border-white/10 bg-white/[0.04] text-white/70 hover:text-white">
                        Back to Studio <ChevronRight size={15} />
                      </ActionButton>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-[#D4A94522] bg-[#D4A9450d] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-[0.25em] text-[#D4A945]">Status</span>
                      <span className="rounded-full bg-[#D4A945] px-3 py-1 text-[10px] font-black text-black">{activeKeys} Active</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Taurus ID</p>
                        <p className="mt-1 truncate font-mono text-sm font-black text-white">{taurusId}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Plan</p>
                        <p className="mt-1 text-sm font-black text-white">{profile ? activePlan.name : 'Guest'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Rate Limit</p>
                        <p className="mt-1 text-sm font-black text-white">{DEFAULT_API_RATE_LIMIT_PER_MINUTE}/min</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="p-5 lg:p-7">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-black">API Keys</h3>
                      <p className="mt-1 text-sm text-white/45">Only the hash is saved. Copy the secret when it appears.</p>
                    </div>
                    <ActionButton onClick={handleCreateKey} disabled={!currentUser || isCreating} className="bg-white text-black hover:bg-[#D4A945]">
                      <Plus size={15} /> {isCreating ? 'Creating' : 'Create Key'}
                    </ActionButton>
                  </div>

                  <input
                    value={keyName}
                    onChange={(event) => setKeyName(event.target.value)}
                    className="mb-4 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#D4A94588]"
                    placeholder="API key name"
                  />

                  {generatedSecret && (
                    <div className="mb-4 rounded-[1.5rem] border border-[#D4A94544] bg-[#D4A94512] p-4">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#D4A945]">Copy once</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <code className="min-w-0 flex-1 overflow-x-auto rounded-2xl bg-black/60 p-3 text-xs text-[#f4d681] custom-scrollbar">
                          {generatedSecret}
                        </code>
                        <ActionButton onClick={handleCopySecret} className="bg-[#D4A945] text-black hover:bg-[#e6bd5b]" title="Copy key">
                          <Copy size={16} /> Copy
                        </ActionButton>
                      </div>
                    </div>
                  )}

                  {status && (
                    <p className="mb-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-bold text-white/75">
                      {status}
                    </p>
                  )}

                  <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 custom-scrollbar">
                    <div className="grid min-w-[660px] grid-cols-[1.5fr_.8fr_.8fr_.8fr] bg-white/[0.04] px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                      <span>Name</span>
                      <span>Status</span>
                      <span>Calls</span>
                      <span className="text-right">Action</span>
                    </div>
                    {apiKeys.length === 0 ? (
                      <div className="p-8 text-center text-sm text-white/45">
                        {currentUser ? 'No API keys yet.' : 'Login to create API keys.'}
                      </div>
                    ) : (
                      apiKeys.map(key => (
                        <div key={key.id} className="grid min-w-[660px] grid-cols-[1.5fr_.8fr_.8fr_.8fr] items-center gap-3 border-t border-white/10 bg-black/25 px-4 py-4 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-black text-white">{key.name}</p>
                            <p className="mt-1 truncate font-mono text-[11px] text-white/35">{key.prefix}... / {formatCreatedAt(key)}</p>
                          </div>
                          <span className={`w-fit rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wider ${key.status === 'active' ? 'bg-[#D4A94518] text-[#D4A945]' : 'bg-white/5 text-white/35'}`}>
                            {key.status}
                          </span>
                          <span className="font-mono text-xs text-white/55">{key.usageCount || 0}</span>
                          <div className="text-right">
                            {key.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => void handleRevokeKey(key.id)}
                                className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-200 transition-colors hover:bg-red-500/20"
                              >
                                Revoke
                              </button>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/25">Locked</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="p-5 lg:p-7">
                  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-black">Key Usage Grid</h3>
                      <p className="mt-1 text-sm text-white/45">Developer plan, token allowance, current usage, and remaining quota.</p>
                    </div>
                    <span className="rounded-full border border-[#D4A94544] px-4 py-2 text-xs font-black text-[#D4A945]">Cost hidden from users</span>
                  </div>
                  <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 custom-scrollbar">
                    <div className="grid min-w-[720px] grid-cols-[1.2fr_.8fr_.8fr_.8fr_.7fr] bg-white/[0.04] px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                      <span>Plan</span><span>Tokens</span><span>Used</span><span>Remaining</span><span>Price</span>
                    </div>
                    {apiPlans.map(plan => (
                      <div key={plan.key} className="grid min-w-[720px] grid-cols-[1.2fr_.8fr_.8fr_.8fr_.7fr] items-center border-t border-white/10 px-4 py-4 text-sm text-white/65">
                        <div>
                          <p className="font-black text-white">{plan.name}</p>
                          <p className="mt-1 font-mono text-[11px] text-[#D4A945]">{plan.key}</p>
                        </div>
                        <span>{plan.tokens}</span>
                        <span>{plan.used.toFixed(3)}M</span>
                        <span>{plan.remaining}</span>
                        <span className="font-black text-[#D4A945]">{plan.price}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-3">
                    {apiPlans.map(plan => {
                      const width = `${Math.min(100, Math.round((plan.used / Number(plan.tokens.replace('M', ''))) * 100))}%`;
                      return (
                        <div key={plan.key} className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="font-black">{plan.name}</p>
                            <span className="rounded-full bg-[#D4A94518] px-3 py-1 text-xs font-black text-[#D4A945]">{plan.price}</span>
                          </div>
                          <p className="mb-2 text-xs text-white/45">Used: {plan.used.toFixed(3)}M</p>
                          <div className="h-3 overflow-hidden rounded-full bg-black/60">
                            <div className="h-full rounded-full bg-[#D4A945]" style={{ width }} />
                          </div>
                          <p className="mt-3 text-xs text-white/40">API token usage meter</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="p-5 lg:p-7">
                  <h3 className="text-2xl font-black">Developer Connection Flow</h3>
                  <p className="mt-1 text-sm text-white/45">How external apps should connect without exposing private keys.</p>
                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    {deploySteps.map((step, index) => (
                      <div key={step.title} className="relative rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
                        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#D4A945] text-black">
                          <step.icon size={21} />
                        </div>
                        <p className="font-black text-white">{step.title}</p>
                        <p className="mt-2 text-xs leading-5 text-white/45">{step.desc}</p>
                        {index < deploySteps.length - 1 && <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-[#D4A94566] md:block" />}
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            </section>

            <aside className="space-y-6">
              <Panel>
                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.24em]">
                      <Code2 size={16} className="text-[#D4A945]" /> API Preview
                    </h3>
                    <ActionButton onClick={() => void copyText(requestSnippet, 'Copied API request example.')} className="border border-white/10 bg-white/[0.04] p-2 text-white/60 hover:text-white" title="Copy request">
                      <Copy size={14} />
                    </ActionButton>
                  </div>
                  <pre className="overflow-x-auto rounded-2xl bg-black/60 p-4 text-[11px] leading-relaxed text-white/70 custom-scrollbar">{requestSnippet}</pre>
                </div>
              </Panel>

              <Panel>
                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.24em]">
                      <TerminalSquare size={16} className="text-[#D4A945]" /> Deploy Env
                    </h3>
                    <ActionButton onClick={() => void copyText(envSnippet, 'Copied deploy env example.')} className="border border-white/10 bg-white/[0.04] p-2 text-white/60 hover:text-white" title="Copy env">
                      <Copy size={14} />
                    </ActionButton>
                  </div>
                  <pre className="overflow-x-auto rounded-2xl bg-black/60 p-4 text-[11px] leading-relaxed text-white/70 custom-scrollbar">{envSnippet}</pre>
                </div>
              </Panel>

              <Panel>
                <div className="p-5">
                  <h3 className="mb-4 text-sm font-black uppercase tracking-[0.24em]">Credit Rules</h3>
                  <div className="space-y-3 text-xs text-white/55">
                    <p className="flex items-center justify-between">
                      <span>1 USDT draft</span>
                      <span className="font-mono font-black text-white">{TAURUS_COIN_PER_USDT} TC</span>
                    </p>
                    <p className="flex items-center justify-between">
                      <span>Full song draft</span>
                      <span className="font-mono font-black text-white">{SONG_CREDIT_COST} credits</span>
                    </p>
                    <p className="flex items-center gap-2 text-[#D4A945]">
                      <CheckCircle2 size={14} /> API cost and margin stay hidden from user UI.
                    </p>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="p-5">
                  <h3 className="mb-3 text-sm font-black uppercase tracking-[0.24em]">Security Rules</h3>
                  <div className="space-y-3 text-xs leading-6 text-white/50">
                    <p><ShieldCheck className="mr-2 inline h-4 w-4 text-[#D4A945]" /> Never place private API key in React/browser code.</p>
                    <p><RotateCcw className="mr-2 inline h-4 w-4 text-[#D4A945]" /> Rotate key when a team member leaves.</p>
                    <p><Server className="mr-2 inline h-4 w-4 text-[#D4A945]" /> Use backend proxy for song, voice, and upload routes.</p>
                  </div>
                </div>
              </Panel>
            </aside>
          </div>
        </main>
      </div>
    </motion.div>
  );
}
