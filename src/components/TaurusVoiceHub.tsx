import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Languages,
  Mic2,
  Play,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
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
    tone: 'Warm pop vocal',
    range: 'A3 - C5',
    status: 'onboarding',
  },
  {
    id: 'karen-bright-story',
    name: 'Karen Bright Story',
    language: 'Karen',
    tone: 'Bright storytelling tone',
    range: 'G3 - B4',
    status: 'onboarding',
  },
  {
    id: 'kachin-power-hook',
    name: 'Kachin Power Hook',
    language: 'Kachin',
    tone: 'Strong chorus energy',
    range: 'C3 - E5',
    status: 'onboarding',
  },
  {
    id: 'chin-soft-ballad',
    name: 'Chin Soft Ballad',
    language: 'Chin',
    tone: 'Soft emotional ballad',
    range: 'B2 - A4',
    status: 'onboarding',
  },
];

const CREATE_STEPS = [
  'Record clean voice sample',
  'Confirm consent and usage rights',
  'Admin verifies identity and quality',
  'Voice becomes available in Taurus Voice',
  'Reward ledger tracks every approved use',
];

const legalRules = [
  'Voice owner must give consent before public model release.',
  'Celebrity, artist clone, and copied voice release needs legal rights.',
  'Owner can request private removal before commercial launch.',
  'Reward payout connects later through Taurus Coin ledger.',
];

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

export default function TaurusVoiceHub({ onClose, onOpenStudio, onSelectVoice }: TaurusVoiceHubProps) {
  const [activeTab, setActiveTab] = useState<VoiceTab>('explore');
  const [consentChecked, setConsentChecked] = useState(false);
  const [sampleFileName, setSampleFileName] = useState('');
  const [previewVoice, setPreviewVoice] = useState('');
  const [language, setLanguage] = useState('Myanmar + Ethnic');
  const [voiceMode, setVoiceMode] = useState('Singing');
  const [sampleMinutes, setSampleMinutes] = useState(10);
  const [noiseFloor, setNoiseFloor] = useState(35);
  const [privacy, setPrivacy] = useState('Private review');

  const handleUseVoice = (voiceName: string) => {
    onSelectVoice(voiceName);
  };

  const handlePreview = (voiceName: string) => {
    setPreviewVoice(`${voiceName} preview selected`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[125] bg-[#070707] text-white"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(212,169,69,.12),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(255,255,255,.06),transparent_24%)]" />
      <div className="relative flex h-full flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#070707]/90 px-4 backdrop-blur-xl lg:px-8">
          <button type="button" onClick={onClose} className="flex items-center gap-3 text-left" title="Back to Taurus">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#D4A94514] text-[#D4A945]">
              <Mic2 size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.28em]">Taurus Voice</h2>
              <p className="text-[10px] font-bold text-white/45">Explore, record, verify voices</p>
            </div>
          </button>
          <ActionButton
            onClick={onClose}
            className="border border-white/10 bg-white/[0.04] p-3 text-white/55 hover:text-white"
            title="Close Taurus Voice"
          >
            <X size={18} />
          </ActionButton>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          <div className="mx-auto max-w-7xl">
            <Panel className="mb-6">
              <div className="grid gap-8 p-5 lg:grid-cols-[1fr_330px] lg:p-7">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.32em] text-[#D4A945]">Original Voice Library</p>
                  <h3 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Build Taurus-owned voices legally</h3>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">
                    Voice pages are separated from the create screen. Every public voice needs clean recording, consent, identity check, language metadata, and reward tracking.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    {[
                      { id: 'explore', label: 'Explore' },
                      { id: 'create', label: 'Create Voice' },
                      { id: 'my', label: 'My Voices' },
                    ].map(tab => (
                      <ActionButton
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as VoiceTab)}
                        className={activeTab === tab.id ? 'bg-[#D4A945] text-black hover:bg-[#e6bd5b]' : 'border border-white/10 bg-white/[0.04] text-white/65 hover:text-white'}
                      >
                        {tab.label}
                      </ActionButton>
                    ))}
                    <ActionButton onClick={onClose} className="border border-[#D4A94555] bg-transparent text-[#D4A945] hover:bg-[#D4A945] hover:text-black">
                      Back to Studio <ChevronRight size={15} />
                    </ActionButton>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[#D4A94522] bg-[#D4A9450d] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-[0.25em] text-[#D4A945]">Production Ready</span>
                    <Sparkles size={18} className="text-[#D4A945]" />
                  </div>
                  <div className="space-y-4 text-sm">
                    <p className="flex justify-between gap-3 text-white/55"><span>Voice slots</span><strong className="text-white">{VOICE_CATALOG.length}</strong></p>
                    <p className="flex justify-between gap-3 text-white/55"><span>Default mode</span><strong className="text-white">{voiceMode}</strong></p>
                    <p className="flex justify-between gap-3 text-white/55"><span>Privacy</span><strong className="text-white">{privacy}</strong></p>
                    {previewVoice && <p className="rounded-2xl bg-black/30 p-3 text-xs font-bold text-[#D4A945]">{previewVoice}</p>}
                  </div>
                </div>
              </div>
            </Panel>

            {activeTab === 'explore' && (
              <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
                <Panel>
                  <div className="p-5 lg:p-7">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black">Verified Ethnic Voice Slots</h3>
                        <p className="mt-1 text-sm text-white/45">Onboarding list for Taurus original voices. Use button sends selected voice back to create form.</p>
                      </div>
                      <ActionButton onClick={() => setActiveTab('create')} className="bg-white text-black hover:bg-[#D4A945]">
                        <Sparkles size={15} /> Create Voice
                      </ActionButton>
                    </div>

                    <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 custom-scrollbar">
                      <div className="grid min-w-[720px] grid-cols-[1.2fr_.8fr_.8fr_.7fr] bg-white/[0.04] px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                        <span>Voice</span><span>Language</span><span>Range</span><span className="text-right">Action</span>
                      </div>
                      {VOICE_CATALOG.map(voice => (
                        <div key={voice.id} className="grid min-w-[720px] grid-cols-[1.2fr_.8fr_.8fr_.7fr] items-center gap-3 border-t border-white/10 bg-black/25 px-4 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#D4A94514] text-[#D4A945]">
                              <Mic2 size={20} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white">{voice.name}</p>
                              <p className="mt-1 truncate text-xs text-white/45">{voice.tone}</p>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-[#D4A945]">{voice.status}</p>
                            </div>
                          </div>
                          <span className="text-sm text-white/60">{voice.language}</span>
                          <span className="font-mono text-xs text-white/45">{voice.range}</span>
                          <div className="flex justify-end gap-2">
                            <ActionButton onClick={() => handlePreview(voice.name)} className="border border-white/10 bg-white/[0.04] p-3 text-white/55 hover:text-white" title="Preview">
                              <Play size={15} fill="currentColor" />
                            </ActionButton>
                            <ActionButton onClick={() => handleUseVoice(voice.name)} className="border border-[#D4A94555] bg-[#D4A94512] text-[#D4A945] hover:bg-[#D4A945] hover:text-black">
                              Use
                            </ActionButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>

                <aside className="space-y-6">
                  <Panel>
                    <div className="p-5">
                      <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.24em]">
                        <ShieldCheck size={16} className="text-[#D4A945]" /> Policy
                      </h3>
                      <div className="space-y-3">
                        {legalRules.map(rule => (
                          <p key={rule} className="flex gap-3 text-xs leading-6 text-white/50">
                            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#D4A945]" /> {rule}
                          </p>
                        ))}
                      </div>
                    </div>
                  </Panel>

                  <Panel>
                    <div className="p-5">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.24em]">
                        <Users size={16} className="text-[#D4A945]" /> Reward
                      </h3>
                      <p className="text-xs leading-6 text-white/50">
                        Voice owner reward will be calculated from approved voice usage and paid later through Taurus Coin after TaurusPay integration.
                      </p>
                    </div>
                  </Panel>
                </aside>
              </section>
            )}

            {activeTab === 'create' && (
              <section className="grid gap-6 xl:grid-cols-[440px_1fr]">
                <Panel>
                  <div className="p-5 lg:p-7">
                    <h3 className="text-2xl font-black">Create Taurus Voice</h3>
                    <p className="mt-2 text-sm leading-7 text-white/50">
                      Start with clean audio. Training backend/provider phase can attach later without changing this UI flow.
                    </p>

                    <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[#D4A94555] bg-[#D4A9450d] p-8 text-center transition-colors hover:border-[#D4A945]">
                      <Upload size={30} className="mb-3 text-[#D4A945]" />
                      <span className="text-sm font-black text-white">{sampleFileName || 'Upload clean voice sample'}</span>
                      <span className="mt-1 text-xs text-white/45">WAV/MP3, quiet room, no music bed</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(event) => setSampleFileName(event.target.files?.[0]?.name || '')}
                      />
                    </label>

                    <label className="mt-5 flex items-start gap-3 rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={(event) => setConsentChecked(event.target.checked)}
                        className="mt-1 accent-[#D4A945]"
                      />
                      <span className="text-xs leading-6 text-white/55">
                        I confirm this voice belongs to me or I have written consent to submit it to Taurus Voice.
                      </span>
                    </label>

                    <ActionButton
                      onClick={onOpenStudio}
                      disabled={!consentChecked}
                      className="mt-5 w-full bg-[#D4A945] py-4 text-black hover:bg-[#e6bd5b]"
                    >
                      Open Voice Studio
                    </ActionButton>
                  </div>
                </Panel>

                <div className="space-y-6">
                  <Panel>
                    <div className="p-5 lg:p-7">
                      <h3 className="mb-5 flex items-center gap-2 text-2xl font-black">
                        <Settings2 className="text-[#D4A945]" /> Production Settings
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                          <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/40">
                            <Languages size={14} /> Language
                          </span>
                          <select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/50 p-3 text-sm outline-none focus:border-[#D4A94588]">
                            {['Myanmar + Ethnic', 'Shan', 'Karen', 'Kachin', 'Chin', 'Rakhine'].map(item => <option key={item}>{item}</option>)}
                          </select>
                        </label>
                        <label className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                          <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/40">
                            <Mic2 size={14} /> Mode
                          </span>
                          <select value={voiceMode} onChange={(event) => setVoiceMode(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/50 p-3 text-sm outline-none focus:border-[#D4A94588]">
                            {['Singing', 'Spoken + Singing', 'Narration', 'Ad voice'].map(item => <option key={item}>{item}</option>)}
                          </select>
                        </label>
                        <label className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                          <span className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-white/40">Sample length: {sampleMinutes} min</span>
                          <input type="range" min="3" max="30" value={sampleMinutes} onChange={(event) => setSampleMinutes(Number(event.target.value))} className="w-full accent-[#D4A945]" />
                        </label>
                        <label className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                          <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/40">
                            <SlidersHorizontal size={14} /> Noise floor: {noiseFloor}%
                          </span>
                          <input type="range" min="0" max="100" value={noiseFloor} onChange={(event) => setNoiseFloor(Number(event.target.value))} className="w-full accent-[#D4A945]" />
                        </label>
                        <label className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 md:col-span-2">
                          <span className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-white/40">Privacy</span>
                          <select value={privacy} onChange={(event) => setPrivacy(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/50 p-3 text-sm outline-none focus:border-[#D4A94588]">
                            {['Private review', 'Team only', 'Public after approval'].map(item => <option key={item}>{item}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  </Panel>

                  <Panel>
                    <div className="p-5 lg:p-7">
                      <h3 className="mb-5 text-2xl font-black">Submission Flow</h3>
                      <div className="grid gap-3 md:grid-cols-5">
                        {CREATE_STEPS.map((step, index) => (
                          <div key={step} className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                            <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-[#D4A945] text-xs font-black text-black">
                              {index + 1}
                            </div>
                            <p className="text-xs font-bold leading-5 text-white/65">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>
                </div>
              </section>
            )}

            {activeTab === 'my' && (
              <Panel>
                <div className="p-8 text-center">
                  <FileCheck2 size={38} className="mx-auto mb-4 text-[#D4A945]" />
                  <h3 className="text-3xl font-black">No verified voices yet</h3>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/50">
                    Uploaded voices will appear here after consent, identity, language, and audio quality verification.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <ActionButton onClick={() => setActiveTab('create')} className="bg-[#D4A945] text-black hover:bg-[#e6bd5b]">
                      <CheckCircle2 size={15} /> Start Verification
                    </ActionButton>
                    <ActionButton onClick={onClose} className="border border-white/10 bg-white/[0.04] text-white/65 hover:text-white">
                      Back to Studio
                    </ActionButton>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </main>
      </div>
    </motion.div>
  );
}
