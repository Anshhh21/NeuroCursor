import { motion } from 'motion/react';
import { ArrowDownTrayIcon, CodeBracketIcon } from '@heroicons/react/24/outline';
import SwarmCursor from './SwarmCursor';

const AppLogo = () => (
  <div className="relative w-10 h-10 flex items-center justify-center">
    <svg viewBox="0 0 24 24" className="w-9 h-9 filter drop-shadow-[0_0_12px_rgba(235,131,59,0.8)]" fill="none">
      <path d="M3.5 2.5L19.5 12.5L12.5 14.5L8.5 21.5L3.5 2.5Z" fill="#090807" stroke="#443224" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3 2L19 12L12 14L8 21L3 2Z" fill="#1c1815" stroke="#eb833b" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M3 2L12 14L8 21L3 2Z" fill="#100e0c" />
      <circle cx="3" cy="2" r="2.5" fill="#f97316" className="animate-pulse" />
      <circle cx="3" cy="2" r="1" fill="#fff" />
    </svg>
  </div>
);

function App() {
  return (
    <div className="min-h-screen bg-[#050403] text-stone-200 selection:bg-amber-500/20 font-sans overflow-x-hidden relative">
      
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% -20%, rgba(180,100,30,0.12) 0%, transparent 60%), radial-gradient(circle at 50% 120%, rgba(50,20,5,0.4) 0%, transparent 50%)' }} />

      <SwarmCursor 
        color="#eb833b" 
        accentColor="#ffffff"
        count={8} 
        size={5} 
        speed={2.5} 
        spread={100} 
        wander={0.25} 
        trail={0.75} 
        scatterOnClick 
      />

      <nav className="relative z-10 w-full max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AppLogo />
          <span className="text-xl font-bold tracking-tight text-stone-100">NeuroCursor</span>
        </div>
        <div className="flex gap-4">
          <a href="https://github.com/Anshhh21/NeuroCursor" target="_blank" rel="noreferrer" className="text-stone-400 hover:text-stone-200 transition-colors text-sm font-medium flex items-center gap-2">
            <CodeBracketIcon className="w-5 h-5" />
            GitHub
          </a>
        </div>
      </nav>

      <main className="relative z-10 flex flex-col items-center justify-center min-h-[75vh] px-6 text-center">
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-6 max-w-4xl"
        >
          <div className="px-4 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-500/90 text-xs font-mono uppercase tracking-[0.2em]">
            Every mouse movement, everywhere
          </div>

          <h1 className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-amber-500/60 leading-none drop-shadow-[0_0_60px_rgba(235,131,59,0.3)] pb-4">
            NeuroCursor
          </h1>

          <p className="text-lg sm:text-xl text-stone-400 font-mono max-w-2xl leading-relaxed mt-2">
            AI-powered gesture control. Control your computer with your bare hands, locally, with zero noticeable latency.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-12 w-full sm:w-auto">
            {/* macOS Download */}
            <a 
              href="https://github.com/Anshhh21/NeuroCursor/releases/latest" 
              className="group relative flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-stone-100 text-[#050403] font-bold text-sm sm:text-base transition-transform hover:scale-105"
            >
              <div className="absolute inset-0 rounded-full bg-white blur-md opacity-20 group-hover:opacity-40 transition-opacity" />
              <ArrowDownTrayIcon className="w-5 h-5" />
              <span>Download for macOS (.dmg)</span>
            </a>

            {/* Windows Download */}
            <a 
              href="https://github.com/Anshhh21/NeuroCursor/releases/latest" 
              className="group flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-stone-900/50 border border-stone-800 text-stone-300 font-bold text-sm sm:text-base hover:bg-stone-800 hover:text-white transition-all"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              <span>Download for Windows (.exe)</span>
            </a>
          </div>
          
          <div className="mt-8 max-w-2xl text-left bg-white/5 border border-white/10 p-5 rounded-2xl text-stone-300 text-xs sm:text-sm leading-relaxed backdrop-blur-md">
            <div className="flex gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-semibold text-stone-100 mb-1">macOS Users</p>
                <p className="text-stone-400 mb-3">
                  Because this app is independently built without a paid Apple Developer certificate, macOS Gatekeeper may incorrectly flag it as "damaged". 
                  To open it, drag the app into your <strong>Applications</strong> folder, open your <strong>Terminal</strong>, and run:
                </p>
                <div className="bg-black/50 border border-white/10 px-3 py-2 rounded-lg text-amber-500/90 font-mono text-xs select-all inline-block">
                  xattr -cr /Applications/NeuroCursor.app
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 max-w-2xl text-left bg-white/5 border border-white/10 p-5 rounded-2xl text-stone-300 text-xs sm:text-sm leading-relaxed backdrop-blur-md">
            <div className="flex gap-3">
              <span className="text-xl">🛡️</span>
              <div>
                <p className="font-semibold text-stone-100 mb-1">Windows Users</p>
                <p className="text-stone-400 mb-1">
                  Windows SmartScreen may show a warning that this file <strong>"isn't commonly downloaded"</strong> or <strong>"Windows protected your PC"</strong>. This happens because this is a brand new, independently built app without an expensive corporate publisher certificate.
                </p>
                <p className="text-stone-400">
                  To install it safely: Hover over the download warning, click the <strong>three dots (...)</strong> or <strong>See more</strong>, and select <strong>Keep anyway</strong>. If a blue popup appears when opening the file, click <strong>More info</strong> and then <strong>Run anyway</strong>.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-stone-500 mt-8 font-mono">
            Requires webcam. Processing runs 100% locally.
          </p>

        </motion.div>

        {/* Features preview or simple decorative visual */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-24 w-full max-w-5xl rounded-2xl border border-white/5 bg-[#0a0806]/80 backdrop-blur-3xl overflow-hidden shadow-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-8"
        >
          <div className="flex-1 text-left space-y-3">
            <h3 className="text-xl font-semibold text-stone-200">How it works</h3>
            <p className="text-sm text-stone-400 leading-relaxed font-mono">
              1. Raise your index finger to move the cursor.<br/>
              2. Pinch your thumb and index finger to click.<br/>
              3. Raise two fingers to scroll.<br/>
              4. Open palm to pause tracking.
            </p>
          </div>
          <div className="flex-1 flex justify-center items-center">
            {/* Visual representation of gestures */}
            <div className="grid grid-cols-2 gap-4">
               <div className="w-24 h-24 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-2">
                 <span className="text-3xl">☝️</span>
                 <span className="text-[10px] text-stone-500 font-mono uppercase tracking-widest">Move</span>
               </div>
               <div className="w-24 h-24 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-2">
                 <span className="text-3xl">🤏</span>
                 <span className="text-[10px] text-stone-500 font-mono uppercase tracking-widest">Click</span>
               </div>
               <div className="w-24 h-24 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-2">
                 <span className="text-3xl">✌️</span>
                 <span className="text-[10px] text-stone-500 font-mono uppercase tracking-widest">Scroll</span>
               </div>
               <div className="w-24 h-24 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-2">
                 <span className="text-3xl">🖐️</span>
                 <span className="text-[10px] text-stone-500 font-mono uppercase tracking-widest">Pause</span>
               </div>
            </div>
          </div>
        </motion.div>

      </main>

      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-12 flex flex-col sm:flex-row items-center justify-between border-t border-white/5 text-xs text-stone-500 font-mono mt-12">
        <p>© {new Date().getFullYear()} NeuroCursor. Open source software.</p>
        <p>Built with MediaPipe, Tauri, and React.</p>
      </footer>

    </div>
  );
}

export default App;
