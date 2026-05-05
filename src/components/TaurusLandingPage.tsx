import { Code2, KeyRound, LogIn, Mic2, Music, Play, Rocket, Wallet } from 'lucide-react';

const sessionPeopleImage = 'https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1400&q=80';
const vocalImage = 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80';
const mixingImage = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80';
const apiImage = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3f?auto=format&fit=crop&w=900&q=80';

type TaurusLandingPageProps = {
  onEnterStudio: () => void;
  onOpenVoice: () => void;
  onOpenDevelopers: () => void;
  onOpenWallet: () => void;
  onLogin: () => void;
};

const services = [
  { icon: Mic2, title: 'Recording', desc: 'Vocal, instrument, and podcast recording with clean session workflow.' },
  { icon: Music, title: 'Music Production', desc: 'Beat making, composition, direction, and final production support.' },
  { icon: Wallet, title: 'Wallet', desc: 'Connect Taurus Coin, credits, plans, and receipt confirmation.' },
  { icon: KeyRound, title: 'API Key', desc: 'Generate API access for studio apps and developer integration.' },
];

const works = [
  { title: 'Studio Session Live', type: 'Video', img: sessionPeopleImage },
  { title: 'Vocal Recording', type: 'Voice', img: vocalImage },
  { title: 'Mix + Master Pack', type: 'Wallet', img: mixingImage },
  { title: 'API Key Access', type: 'API', img: apiImage },
];

export default function TaurusLandingPage({
  onEnterStudio,
  onOpenVoice,
  onOpenDevelopers,
  onOpenWallet,
  onLogin,
}: TaurusLandingPageProps) {
  return (
    <main className="min-h-screen bg-[#070707] p-4 text-white md:p-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(212,169,69,.12),transparent_30%),radial-gradient(circle_at_95%_20%,rgba(255,255,255,.06),transparent_22%)]" />
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0d0d] shadow-2xl shadow-black/60">
        <nav className="flex items-center justify-between border-b border-white/5 px-5 py-4 md:px-8">
          <div>
            <div className="text-xl font-black tracking-wide">Taurus Studio</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.45em] text-[#D4A945]">Music OS</div>
          </div>
          <div className="hidden items-center gap-6 text-[11px] font-bold uppercase tracking-wider text-white/60 lg:flex">
            <button onClick={onEnterStudio}>Studio</button>
            <button onClick={onOpenVoice}>Voice</button>
            <button onClick={onOpenWallet}>Wallet</button>
            <button onClick={onOpenDevelopers}>API Key</button>
          </div>
          <button onClick={onLogin} className="rounded-xl border border-[#D4A94566] px-4 py-2 text-xs font-black uppercase text-[#D4A945] hover:bg-[#D4A945] hover:text-black">
            <LogIn className="mr-2 inline h-4 w-4" /> Gmail
          </button>
        </nav>

        <section className="relative grid min-h-[560px] gap-8 overflow-hidden px-5 pb-10 pt-6 md:px-8 lg:grid-cols-[0.9fr_1.2fr]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_18%,rgba(212,169,69,.2),transparent_28%),linear-gradient(90deg,#0d0d0d_0%,rgba(13,13,13,.92)_42%,rgba(13,13,13,.35)_100%)]" />
          <div className="relative z-10 max-w-xl pt-4">
            <p className="mb-5 text-xs font-extrabold uppercase tracking-[0.28em] text-[#D4A945]">Welcome to 2026</p>
            <h1 className="text-5xl font-black leading-tight md:text-6xl">Taurus <span className="text-[#D4A945]">Studio</span></h1>
            <p className="mt-5 text-lg text-white/80">Music Production • Voice • Wallet • API Key • Deployer</p>
            <p className="mt-5 max-w-md leading-7 text-white/60">A separate landing page that routes into each Taurus page without changing the working app logic.</p>
            <div className="mt-9 flex flex-wrap gap-4">
              <button onClick={onEnterStudio} className="rounded-xl bg-[#D4A945] px-7 py-3 text-sm font-black text-black hover:bg-[#e6bd5b]">
                Open Studio <Rocket className="ml-2 inline h-4 w-4" />
              </button>
              <button onClick={onOpenWallet} className="rounded-xl border border-[#D4A94555] px-7 py-3 text-sm font-black hover:bg-white/10">Connect Wallet</button>
            </div>
          </div>

          <div className="relative z-10 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/60">
            <img src={sessionPeopleImage} alt="People smiling in a music studio preparing to sing" className="absolute inset-0 h-full w-full object-cover opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
            <button className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#D4A945] text-black shadow-2xl transition hover:scale-105">
              <Play className="h-8 w-8" fill="currentColor" />
            </button>
            <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-black/75 px-5 py-4 backdrop-blur-md">
              <div className="font-black">Studio Session Live</div>
              <div className="text-xs text-white/50">Friends smiling, sitting together, ready to sing</div>
            </div>
          </div>
        </section>

        <section className="px-5 py-10 md:px-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-[#D4A945]">Pages</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => (
              <button key={service.title} onClick={service.title === 'Wallet' ? onOpenWallet : service.title === 'API Key' ? onOpenDevelopers : service.title === 'Recording' ? onOpenVoice : onEnterStudio} className="rounded-3xl border border-white/5 bg-white/[0.045] p-5 text-left shadow-xl shadow-black/25 transition hover:-translate-y-1">
                <service.icon className="mb-5 h-11 w-11 rounded-2xl bg-[#D4A94514] p-2 text-[#D4A945]" />
                <h3 className="text-sm font-bold uppercase tracking-wide">{service.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{service.desc}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="px-5 pb-10 md:px-8">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {works.map((work) => (
              <div key={work.title} className="rounded-3xl border border-white/5 bg-white/[0.045] p-4">
                <div className="mb-4 aspect-[4/3] overflow-hidden rounded-2xl bg-white/5">
                  <img src={work.img} alt={work.title} className="h-full w-full object-cover opacity-90" />
                </div>
                <div className="mb-2 inline-flex rounded-full bg-[#D4A94518] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#D4A945]">{work.type}</div>
                <h3 className="font-semibold">{work.title}</h3>
                <p className="mt-1 text-sm text-white/55">Taurus Studio / 2026</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
