import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  FileCheck2,
  Mic2,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';

type VoiceTab = 'explore' | 'create' | 'my';

interface TaurusVoiceHubProps {
  onClose: () => void;
  onOpenStudio: () => void;
  onSelectVoice: (voiceName: string) => void;
}

const VOICE_CATALOG = [
  {
    id: 'shan-warm-lead',
    name: 'Shan Warm Lead',
    language: 'Shan',
    style: 'warm pop vocal',
    status: 'onboarding',
  },
  {
    id: 'karen-bright-story',
    name: 'Karen Bright Story',
    language: 'Karen',
    style: 'bright storytelling tone',
    status: 'onboarding',
  },
  {
    id: 'kachin-power-hook',
    name: 'Kachin Power Hook',
    language: 'Kachin',
    style: 'strong chorus energy',
    status: 'onboarding',
  },
  {
    id: 'chin-soft-ballad',
    name: 'Chin Soft Ballad',
    language: 'Chin',
    style: 'soft emotional ballad',
    status: 'onboarding',
  },
];

const CREATE_STEPS = [
  'Record clean voice sample',
  'Confirm consent and usage rights',
  'Admin verifies identity and quality',
  'Voice becomes available in Taurus Voice',
  'Reward ledger tracks usage',
];

export default function TaurusVoiceHub({ onClose, onOpenStudio, onSelectVoice }: TaurusVoiceHubProps) {
  const [activeTab, setActiveTab] = useState<VoiceTab>('explore');
  const [consentChecked, setConsentChecked] = useState(false);

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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-violet-300">
              <Mic2 size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest">Taurus Voice</h2>
              <p className="text-[10px] font-bold text-zinc-500">Explore, create, verify voices</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-zinc-400 transition-colors hover:text-white"
            title="Close Taurus Voice"
          >
            <X size={18} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap gap-2">
              {[
                { id: 'explore', label: 'Explore' },
                { id: 'create', label: 'Create Voice' },
                { id: 'my', label: 'My Voices' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as VoiceTab)}
                  className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-black' : 'border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'explore' && (
              <section className="grid gap-5 lg:grid-cols-[1fr_330px]">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5 lg:p-6">
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">Verified Ethnic Voice Slots</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
                        These are onboarding slots for Taurus original voices. Real public release requires owner consent and admin verification.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-black transition-colors hover:bg-zinc-200"
                    >
                      <Sparkles size={14} /> Create Voice
                    </button>
                  </div>

                  <div className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
                    {VOICE_CATALOG.map(voice => (
                      <div key={voice.id} className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/60 p-4">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
                            <Mic2 size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{voice.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{voice.language} / {voice.style}</p>
                            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                              {voice.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-zinc-400 transition-colors hover:text-white"
                            title="Preview"
                          >
                            <Play size={15} fill="currentColor" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectVoice(voice.name)}
                            className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-violet-200 transition-colors hover:bg-violet-500/20"
                          >
                            Use
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <aside className="space-y-5">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                      <ShieldCheck size={15} /> Policy
                    </h3>
                    <p className="text-xs leading-relaxed text-zinc-500">
                      Taurus should use consented original voices only. Celebrity or copied artist voices need rights before public use.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                      <Users size={15} /> Reward
                    </h3>
                    <p className="text-xs leading-relaxed text-zinc-500">
                      Voice owner reward is tracked later through Taurus Coin ledger after TaurusPay is connected.
                    </p>
                  </div>
                </aside>
              </section>
            )}

            {activeTab === 'create' && (
              <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5 lg:p-6">
                  <h3 className="text-2xl font-black tracking-tight">Create Taurus Voice</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    Start with clean voice recording in Taurus Studio. Verification and cloud training come after the provider/GPU phase.
                  </p>

                  <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/60 p-8 text-center transition-colors hover:border-violet-500/40">
                    <Upload size={28} className="mb-3 text-violet-300" />
                    <span className="text-sm font-bold text-white">Upload clean voice sample</span>
                    <span className="mt-1 text-xs text-zinc-500">UI placeholder / training backend later</span>
                    <input type="file" accept="audio/*" className="hidden" />
                  </label>

                  <label className="mt-5 flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(event) => setConsentChecked(event.target.checked)}
                      className="mt-1 accent-violet-500"
                    />
                    <span className="text-xs leading-relaxed text-zinc-400">
                      I confirm this voice belongs to me or I have written consent to submit it to Taurus Voice.
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={onOpenStudio}
                    disabled={!consentChecked}
                    className="mt-5 w-full rounded-2xl bg-white py-3 text-sm font-black text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
                  >
                    Open Voice Studio
                  </button>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-5 lg:p-6">
                  <h3 className="mb-5 text-lg font-black">Submission Flow</h3>
                  <div className="space-y-3">
                    {CREATE_STEPS.map((step, index) => (
                      <div key={step} className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-xs font-black text-zinc-500">
                          {index + 1}
                        </div>
                        <p className="text-sm font-bold text-zinc-300">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'my' && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-8 text-center">
                <FileCheck2 size={34} className="mx-auto mb-4 text-zinc-600" />
                <h3 className="text-2xl font-black">No verified voices yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                  Uploaded voices will appear here after consent, identity, and audio quality verification.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-black text-black transition-colors hover:bg-zinc-200"
                >
                  <CheckCircle2 size={15} /> Start Verification
                </button>
              </section>
            )}
          </div>
        </main>
      </div>
    </motion.div>
  );
}
