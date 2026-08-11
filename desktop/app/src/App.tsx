import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { availableMonitors } from "@tauri-apps/api/window";
import LightRays from "./LightRays";
import BlurText from "./BlurText";
import ScrollExpand from "./ScrollExpand";

interface EngineMessage {
  engineStatus?: string;
  event?: string;
  hand?: string;
  x?: number;
  y?: number;
  timestamp?: number;
  status?: string;
  message?: string;
  frame?: string;
}

// Gesture → colour mapping
const GESTURE_COLOR: Record<string, [number, number, number]> = {
  "pause":       [239,  68,  68],
  "left-click":  [235, 131,  59],
  "scroll":      [168,  85, 247],
};
const DEFAULT_COLOR: [number, number, number] = [235, 131, 59];

// 3D Black Cursor Logo Icon with glowing amber tip
const AppLogo = () => (
  <div className="relative w-8 h-8 flex items-center justify-center">
    <svg viewBox="0 0 24 24" className="w-7 h-7 filter drop-shadow-[0_0_10px_rgba(235,131,59,0.7)]" fill="none">
      <path d="M3.5 2.5L19.5 12.5L12.5 14.5L8.5 21.5L3.5 2.5Z" fill="#090807" stroke="#443224" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3 2L19 12L12 14L8 21L3 2Z" fill="#1c1815" stroke="#eb833b" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M3 2L12 14L8 21L3 2Z" fill="#100e0c" />
      <circle cx="3" cy="2" r="2.5" fill="#f97316" className="animate-pulse" />
      <circle cx="3" cy="2" r="1" fill="#fff" />
    </svg>
  </div>
);

// Shared LightRays background
const Background = () => (
  <div className="fixed inset-0 pointer-events-none z-0">
    <LightRays
      raysOrigin="top-center"
      raysColor="#c86a28"
      raysSpeed={0.8}
      lightSpread={0.4}
      rayLength={2.5}
      followMouse={true}
      mouseInfluence={0.08}
      noiseAmount={0}
      distortion={0}
      className="w-full h-full opacity-45"
      pulsating={false}
      fadeDistance={0.9}
      saturation={0.9}
    />
  </div>
);

function App() {
  // ── Phase control ───────────────────────────────────────────────────────
  // 'intro'  → full-screen scroll-expand hero (no main page below)
  // 'main'   → normal dashboard
  const [phase, setPhase] = useState<'intro' | 'main'>('intro');

  // ── Engine control ──────────────────────────────────────────────────────
  // Engine only starts when user explicitly clicks "Start Engine"
  const [engineStarted, setEngineStarted] = useState(false);

  // ── App state ───────────────────────────────────────────────────────────
  const [engineData, setEngineData] = useState<EngineMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [videoFrame, setVideoFrame] = useState<string | null>(null);

  // Settings — loaded from localStorage
  const [alpha, setAlpha]           = useState(() => parseFloat(localStorage.getItem('nc_alpha')       ?? '0.25'));
  const [debounceMs, setDebounceMs] = useState(() => parseInt(localStorage.getItem('nc_debounceMs')   ?? '800'));
  const [scrollSpeed, setScrollSpeed] = useState(() => parseInt(localStorage.getItem('nc_scrollSpeed') ?? '50'));

  // Refs — always read fresh values in event listener closure
  const alphaRef       = useRef(parseFloat(localStorage.getItem('nc_alpha')       ?? '0.25'));
  const debounceMsRef  = useRef(parseInt(localStorage.getItem('nc_debounceMs')   ?? '800'));
  const scrollSpeedRef = useRef(parseInt(localStorage.getItem('nc_scrollSpeed') ?? '50'));
  const lastScrollYRef = useRef<number | null>(null);

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const engineDataRef  = useRef<EngineMessage | null>(null);
  const smoothXRef     = useRef(0.5);
  const smoothYRef     = useRef(0.5);
  const lastGestureRef = useRef<{ event: string; time: number }>({ event: "", time: 0 });
  const screenBoundsRef = useRef({ width: window.screen.width, height: window.screen.height, offsetX: 0, offsetY: 0 });

  // Sync engineData ref
  useEffect(() => { engineDataRef.current = engineData; }, [engineData]);

  // Persist settings to localStorage
  useEffect(() => { alphaRef.current = alpha;             localStorage.setItem('nc_alpha',       alpha.toString()); },       [alpha]);
  useEffect(() => { debounceMsRef.current = debounceMs;   localStorage.setItem('nc_debounceMs',  debounceMs.toString()); },  [debounceMs]);
  useEffect(() => { scrollSpeedRef.current = scrollSpeed; localStorage.setItem('nc_scrollSpeed', scrollSpeed.toString()); }, [scrollSpeed]);

  // Monitor detection (runs once)
  useEffect(() => {
    availableMonitors().then((monitors) => {
      if (monitors.length === 0) return;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const m of monitors) {
        const sf = m.scaleFactor;
        const lx = m.position.x / sf;
        const ly = m.position.y / sf;
        const lw = m.size.width  / sf;
        const lh = m.size.height / sf;
        left   = Math.min(left,   lx);
        top    = Math.min(top,    ly);
        right  = Math.max(right,  lx + lw);
        bottom = Math.max(bottom, ly + lh);
      }
      screenBoundsRef.current = { width: right - left, height: bottom - top, offsetX: left, offsetY: top };
      console.log("[Screens]", screenBoundsRef.current);
    }).catch(console.error);
  }, []);

  // ── Webcam + Engine listener — only starts when user clicks "Start Engine" ──
  useEffect(() => {
    if (!engineStarted) return;

    // Trigger macOS camera permission prompt, then immediately release the hardware lock
    // so the Python engine can take exclusive control.
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
      })
      .catch(err => console.error("Webcam permission error:", err));

    const unlisten = listen<string>("engine-event", async (event) => {
      try {
        const parsed: EngineMessage = JSON.parse(event.payload);
        setEngineData(parsed);
        setIsConnected(true);
        
        if (parsed.frame) {
          setVideoFrame(`data:image/jpeg;base64,${parsed.frame}`);
        }

        // OS Mouse Control
        if (parsed.x !== undefined && parsed.y !== undefined && parsed.event !== "pause") {
          const ALPHA = alphaRef.current;
          const CAM_X_MIN = 1 - 0.9008;
          const CAM_X_MAX = 0.80;
          const CAM_Y_MIN = 0.10, CAM_Y_MAX = 0.90;
          const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
          const mirroredX = 1 - parsed.x;
          const normX = clamp((mirroredX - CAM_X_MIN) / (CAM_X_MAX - CAM_X_MIN), 0, 1);
          const normY = clamp((parsed.y  - CAM_Y_MIN) / (CAM_Y_MAX - CAM_Y_MIN), 0, 1);
          smoothXRef.current = smoothXRef.current * (1 - ALPHA) + normX * ALPHA;
          smoothYRef.current = smoothYRef.current * (1 - ALPHA) + normY * ALPHA;
          const { width, height, offsetX, offsetY } = screenBoundsRef.current;
          const screenX = Math.round(offsetX + smoothXRef.current * width);
          const screenY = Math.round(offsetY + smoothYRef.current * height);
          await invoke("move_mouse", { x: screenX, y: screenY });
        }

        // Gesture Actions
        const DEBOUNCE_MS = debounceMsRef.current;
        const now  = Date.now();
        const last = lastGestureRef.current;

        if (parsed.event === "left-click") {
          if (parsed.event !== last.event || now - last.time > DEBOUNCE_MS) {
            lastGestureRef.current = { event: parsed.event, time: now };
            await invoke("mouse_click", { button: "left" });
          }
        } else if (parsed.event === "scroll") {
          const currentY = parsed.y!;
          if (lastScrollYRef.current !== null) {
            const deltaY = currentY - lastScrollYRef.current;
            const scrollAmount = Math.round(-deltaY * scrollSpeedRef.current);
            if (Math.abs(scrollAmount) >= 1) {
              await invoke("mouse_scroll", { length: scrollAmount });
            }
          }
          lastScrollYRef.current = currentY;
          lastGestureRef.current = { event: parsed.event, time: now };
        } else {
          if (parsed.event !== last.event) {
            lastGestureRef.current = { event: parsed.event ?? "", time: 0 };
          }
          lastScrollYRef.current = null;
        }
      } catch (err) {
        console.error("Failed to parse engine JSON:", err);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [engineStarted]); // Only fires when engine is started

  // ── Canvas draw loop — starts when phase switches to main ───────────────
  useEffect(() => {
    if (phase !== 'main') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId: number;

    const syncSize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width  = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };

    const observer = new ResizeObserver(syncSize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    syncSize();

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const data = engineDataRef.current;
      if (data?.x !== undefined && data?.y !== undefined) {
        const cx = (1 - data.x) * canvas.width;
        const cy = data.y * canvas.height;
        const [r, g, b] = GESTURE_COLOR[data.event ?? ""] ?? DEFAULT_COLOR;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
        glow.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.shadowColor = `rgba(${r},${g},${b},0.95)`;
        ctx.shadowBlur  = 18;
        ctx.fill();
        ctx.shadowBlur  = 0;
        if (data.event && data.event !== "tracking") {
          ctx.font      = "500 11px monospace";
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.85)";
          ctx.shadowBlur  = 6;
          ctx.fillText(data.event.toUpperCase(), cx + 14, cy + 4);
          ctx.shadowBlur  = 0;
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [phase]); // Re-runs when we switch to main phase

  const isHandVisible = engineData?.x !== undefined && engineData?.y !== undefined;

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 1: Intro (full-screen, isolated scroll — main page is NOT rendered)
  // ──────────────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div className="w-screen h-screen bg-gradient-to-b from-stone-100 to-stone-300 overflow-hidden font-sans">
        {/* ScrollExpand fills the full viewport and owns its own scroll container */}
        <div className="relative z-10 w-full h-full">
          <ScrollExpand
            title={<span className="text-stone-900 drop-shadow-none">Built to scale</span>}
            scrollHint="Scroll to begin"
            useWindowScroll={false}
            startWidth={45}
            startHeight={60}
            startRadius={20}
            endRadius={8}
            mediaZoom={1.15}
            scrollDistance={1.0}
            holdDistance={0.3}
            smoothing={0.1}
            overlayScrim={0.65}
            enabled={true}
            className="w-full h-full"
          >
            {/* This content appears when the frame is fully expanded */}
            <div className="flex flex-col items-center justify-center gap-5 text-center px-6 select-none">
              <p className="text-xs font-mono uppercase tracking-[0.25em] text-amber-600/70">
                Every mouse movement, everywhere
              </p>
              <h1 className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-amber-500/60 leading-none drop-shadow-[0_0_60px_rgba(235,131,59,0.4)]">
                NeuroCursor
              </h1>
              <p className="text-sm text-stone-400 font-mono max-w-sm">
                Gesture control, made quiet.
              </p>
              <button
                onClick={() => setPhase('main')}
                className="mt-4 group flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500/12 border border-amber-500/30 text-amber-300 text-sm font-medium hover:bg-amber-500/20 hover:border-amber-500/50 transition-all duration-300 cursor-pointer"
              >
                <span>Enter Dashboard</span>
                <span className="text-amber-500 group-hover:translate-x-1 transition-transform duration-200">→</span>
              </button>
            </div>
          </ScrollExpand>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2: Main Dashboard (only renders after intro is dismissed)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-[#050403] text-stone-200 font-sans selection:bg-amber-500/20 overflow-y-auto">

      <Background />

      {/* Main Centered Container */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8 flex flex-col items-center gap-6">

        {/* Header */}
        <header className="w-full flex items-center justify-between pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <AppLogo />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-stone-100 leading-tight">
                NeuroCursor <span className="text-[11px] font-mono text-amber-600/80 font-normal">v2.0</span>
              </h1>
              <p className="text-[11px] text-stone-500 leading-tight">Gesture control, made quiet</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!engineStarted ? (
              /* Start Engine Button — engine is off until clicked */
              <button
                onClick={() => setEngineStarted(true)}
                className="group flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/12 border border-amber-500/30 text-amber-400 text-[11px] font-mono hover:bg-amber-500/20 hover:border-amber-500/50 transition-all duration-200 cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                Start Engine
              </button>
            ) : (
              /* Engine running status pill */
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-white/8 backdrop-blur-md">
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isConnected ? "bg-amber-500 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.7)]" : "bg-stone-600 animate-pulse"}`} />
                <span className="text-[11px] font-mono text-stone-400">
                  {isConnected ? "Engine live" : "Starting..."}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="w-full flex flex-col items-center gap-6">

          {/* Section Label */}
          <div className="w-full flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-700/90 mb-0.5">Your focus space</p>
              <h2 className="text-base font-medium text-stone-300">Camera preview</h2>
            </div>
            <p className="text-[10px] font-mono text-stone-600">USB-CAM 01 · 30 FPS</p>
          </div>

          {/* Webcam Viewport */}
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/5 shadow-[0_0_60px_-20px_rgba(180,100,30,0.18)]">

            {!engineStarted && (
              /* Placeholder when engine not started */
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#080604] z-20">
                <div className="w-12 h-12 rounded-full border border-amber-500/20 flex items-center justify-center">
                  <AppLogo />
                </div>
                <p className="text-stone-500 text-sm font-mono">Click "Start Engine" to activate camera</p>
              </div>
            )}

            {/* Video Feed — subtle warm tone */}
            {videoFrame && (
              <img
                src={videoFrame}
                alt="Webcam feed"
                className="w-full h-full object-cover transform -scale-x-100"
                style={{ filter: 'sepia(0.12) contrast(1.03) brightness(0.95) hue-rotate(-8deg)' }}
              />
            )}

            {/* Warm corner vignettes */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(120,50,10,0.18) 0%, transparent 55%), radial-gradient(ellipse at 100% 50%, rgba(120,50,10,0.18) 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(5,3,2,0.45) 0%, transparent 60%)' }} />

            {/* Canvas Overlay */}
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />

            {/* Top-Left Hand Badge */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/65 backdrop-blur-md border border-white/8 text-[11px] text-stone-400 font-mono">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isHandVisible ? "bg-amber-500" : "bg-stone-600"}`} />
              {isHandVisible ? "Hand tracked" : "No hand"}
            </div>

            {/* Top-Right Gesture Status */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/65 backdrop-blur-md border border-white/8 text-[11px] text-stone-400 font-mono capitalize">
              {engineData?.event ?? "waiting"}
            </div>
          </div>

          {/* Gesture Instructions — Static, purely informational */}
          <div className="w-full bg-[#0d0b09]/80 backdrop-blur-xl rounded-2xl border border-white/5 p-5">
            <div className="mb-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-700/80 mb-1">Gesture guide</p>
              <h3 className="text-sm font-medium text-stone-300">Hand controls</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors duration-200">
                <span className="text-xl block mb-3">☝️</span>
                <p className="text-[13px] font-medium text-stone-200 mb-1">Point & Move</p>
                <p className="text-[11px] text-stone-500 leading-snug">Index finger up — cursor follows your tip</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors duration-200">
                <span className="text-xl block mb-3">🤏</span>
                <p className="text-[13px] font-medium text-stone-200 mb-1">Pinch</p>
                <p className="text-[11px] text-stone-500 leading-snug">Thumb + index touch — left click</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors duration-200">
                <span className="text-xl block mb-3">✌️</span>
                <p className="text-[13px] font-medium text-stone-200 mb-1">Two fingers</p>
                <p className="text-[11px] text-stone-500 leading-snug">Raise index + middle — move up/down to scroll</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors duration-200">
                <span className="text-xl block mb-3">🖐️</span>
                <p className="text-[13px] font-medium text-stone-200 mb-1">Open palm</p>
                <p className="text-[11px] text-stone-500 leading-snug">All fingers up — toggles pause / resume</p>
              </div>
            </div>
          </div>

          {/* Settings Panel */}
          <div className="w-full bg-[#0d0b09]/80 backdrop-blur-xl rounded-2xl border border-white/5 p-6 mb-6">
            <div className="mb-6">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-700/80 mb-1">Make it yours</p>
              <h3 className="text-sm font-medium text-stone-300">Cursor feel &amp; sensitivity</h3>
            </div>

            <div className="space-y-7">
              {/* Slider: Cursor Smoothing */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[13px] font-medium text-stone-200">Cursor smoothing</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Filter micro-movements for steadier control</p>
                  </div>
                  <span className="text-amber-500 font-mono text-xs px-2 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 tabular-nums">{alpha.toFixed(2)}</span>
                </div>
                <input id="slider-smoothing" type="range" min={0.05} max={0.5} step={0.01} value={alpha} onChange={(e) => setAlpha(parseFloat(e.target.value))} className="w-full accent-amber-500 cursor-pointer" />
                <div className="flex justify-between text-[10px] text-stone-600 font-mono"><span>Smooth</span><span>Raw</span></div>
              </div>

              <div className="border-t border-white/5" />

              {/* Slider: Click Delay */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[13px] font-medium text-stone-200">Click delay</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Minimum time between repeated click gestures</p>
                  </div>
                  <span className="text-amber-500 font-mono text-xs px-2 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 tabular-nums">{debounceMs}ms</span>
                </div>
                <input id="slider-debounce" type="range" min={200} max={1500} step={50} value={debounceMs} onChange={(e) => setDebounceMs(parseInt(e.target.value))} className="w-full accent-amber-500 cursor-pointer" />
                <div className="flex justify-between text-[10px] text-stone-600 font-mono"><span>Quick</span><span>Slow</span></div>
              </div>

              <div className="border-t border-white/5" />

              {/* Slider: Scroll Speed */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[13px] font-medium text-stone-200">Scroll speed</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Scales how far each finger movement scrolls</p>
                  </div>
                  <span className="text-amber-500 font-mono text-xs px-2 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 tabular-nums">{scrollSpeed}×</span>
                </div>
                <input id="slider-scroll-speed" type="range" min={20} max={100} step={5} value={scrollSpeed} onChange={(e) => setScrollSpeed(parseInt(e.target.value))} className="w-full accent-amber-500 cursor-pointer" />
                <div className="flex justify-between text-[10px] text-stone-600 font-mono"><span>Slow</span><span>Fast</span></div>
              </div>
            </div>
          </div>

          {/* BlurText Banner at Bottom */}
          <div className="w-full py-16 flex justify-center items-center text-center border-t border-white/5">
            <BlurText
              text="Your Own Mouse"
              delay={150}
              animateBy="words"
              direction="top"
              className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-stone-100 via-stone-200 to-amber-500/80 justify-center text-center w-full"
            />
          </div>

          {/* Footer */}
          <footer className="w-full flex items-center justify-between text-[10px] text-stone-600 font-mono pb-8">
            <span>Camera input is private and processed locally</span>
            <span>NeuroCursor v2.0</span>
          </footer>

        </main>
      </div>
    </div>
  );
}

export default App;