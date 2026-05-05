import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { User } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  Code2,
  Copy,
  Key,
  Plus,
  RotateCcw,
  ShieldCheck,
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
  };

  const handleCopySecret = async () => {
    if (!generatedSecret) return;
    await navigator.clipboard?.writeText(generatedSecret);
    setStatus('Copied API key.');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[125] bg-zinc-950 text-zinc-100"
    >
      <div className="flex h-full flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-emerald-300">
              <Key size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest">Developers</h2>
              <p className="text-[10px] font-bold text-zinc-500">API keys, quotas, docs</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-zinc-400 transition-colors hover:text-white"
            title="Close Developers"
          >
            <X size={18} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_360px]">
            <section className="space-y-5">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5 lg:p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Taurus API Access</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
                      Create keys for external websites. Server-side verification will connect in the Cloud Run phase.
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                    {activeKeys} active
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Taurus ID', value: taurusId, icon: ShieldCheck },
                    { label: 'Plan', value: profile ? activePlan.name : 'Guest', icon: Wallet },
                    { label: 'Rate limit', value: `${DEFAULT_API_RATE_LIMIT_PER_MINUTE}/min`, icon: RotateCcw },
                  ].map(item => (
                    <div key={item.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <item.icon size={16} className="mb-3 text-zinc-500" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{item.label}</p>
                      <p className="mt-1 truncate text-sm font-bold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5 lg:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black">API Keys</h3>
                    <p className="mt-1 text-xs text-zinc-500">Store keys securely. Only the hash is saved.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateKey}
                    disabled={!currentUser || isCreating}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
                  >
                    <Plus size={14} />
                    {isCreating ? 'Creating' : 'Create Key'}
                  </button>
                </div>

                <input
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
                  className="mb-4 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"
                  placeholder="API key name"
                />

                {generatedSecret && (
                  <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-amber-300">Copy once</p>
                    <div className="flex gap-2">
                      <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-amber-100 custom-scrollbar">
                        {generatedSecret}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="rounded-xl bg-amber-300 px-3 text-black"
                        title="Copy key"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {status && (
                  <p className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-bold text-zinc-300">
                    {status}
                  </p>
                )}

                <div className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
                  {apiKeys.length === 0 ? (
                    <div className="p-6 text-center text-sm text-zinc-500">
                      {currentUser ? 'No API keys yet.' : 'Login to create API keys.'}
                    </div>
                  ) : (
                    apiKeys.map(key => (
                      <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950/60 p-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-white">{key.name}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${key.status === 'active' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>
                              {key.status}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-zinc-500">{key.prefix}...</p>
                          <p className="mt-1 text-[10px] text-zinc-600">
                            {formatCreatedAt(key)} / {key.usageCount || 0} calls
                          </p>
                        </div>
                        {key.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => handleRevokeKey(key.id)}
                            className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/20"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                  <Code2 size={15} /> API Preview
                </h3>
                <pre className="overflow-x-auto rounded-2xl bg-black/50 p-4 text-[11px] leading-relaxed text-zinc-300 custom-scrollbar">{`POST /api/v1/generate-song
Authorization: Bearer taurus_sk_xxx

{
  "prompt": "full song idea",
  "voiceId": "taurus_voice_id",
  "model": "taurus-apex"
}`}</pre>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5">
                <h3 className="mb-3 text-sm font-black uppercase tracking-widest">Credit Rules</h3>
                <div className="space-y-3 text-xs text-zinc-400">
                  <p className="flex items-center justify-between">
                    <span>1 USDT draft</span>
                    <span className="font-mono text-white">{TAURUS_COIN_PER_USDT} TC</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Full song draft</span>
                    <span className="font-mono text-white">{SONG_CREDIT_COST} credits</span>
                  </p>
                  <p className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 size={14} /> Cost and margin stay hidden from user UI.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5">
                <h3 className="mb-3 text-sm font-black uppercase tracking-widest">Wallet Phase</h3>
                <p className="text-xs leading-relaxed text-zinc-500">
                  TaurusPay, TON, USDT, admin wallet, and webhook verification are intentionally left for the last phase.
                </p>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </motion.div>
  );
}
