import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { availableMonitors } from "@tauri-apps/api/window";
import LightRays from "./LightRays";

interface EngineMessage {
  engineStatus?: string;
  event?: string;
  hand?: string;
  x?: number;
  y?: number;
  timestamp?: number;
  status?: string;
  message?: string;
}

// Gesture → colour mapping
const GESTURE_COLOR: Record<string, [number, number, number]> = {
  "pause":       [239,  68,  68],  // red    — cursor frozen (open palm toggle)
  "left-click":  [235, 131,  59],  // warm amber — pinch
  "scroll":      [168,  85, 247],  // purple — two fingers
};
const DEFAULT_COLOR: [number, number, number] = [235, 131, 59];

// 3D Black Cursor Logo Icon with glowing amber tip
const AppLogo = () => (
  <div className="relative w-8 h-8 flex items-center justify-center">
    <svg viewBox="0 0 24 24" className="w-7 h-7 filter drop-shadow-[0_0_10px_rgba(235,131,59,0.7)]" fill="none">
      {/* Outer shadow / bevel */}
      <path
        d="M3.5 2.5L19.5 12.5L12.5 14.5L8.5 21.5L3.5 2.5Z"
        fill="#090807"
        stroke="#443224"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Main black cursor body */}
      <path
        d="M3 2L19 12L12 14L8 21L3 2Z"
        fill="#1c1815"
        stroke="#eb833b"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* 3D bevel shading */}
      <path
        d="M3 2L12 14L8 21L3 2Z"
        fill="#100e0c"
      />
      {/* Glowing tip beacon */}
      <circle cx="3" cy="2" r="2.5" fill="#f97316" className="animate-pulse" />
      <circle cx="3" cy="2" r="1" fill="#fff" />
    </svg>
  </div>
);

function App() {
  const [engineData, setEngineData] = useState<EngineMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Settings state — loaded from localStorage so they survive app restarts
  const [alpha, setAlpha]           = useState(() => parseFloat(localStorage.getItem('nc_alpha')       ?? '0.25'));
  const [debounceMs, setDebounceMs] = useState(() => parseInt(localStorage.getItem('nc_debounceMs')   ?? '800'));
  const [scrollSpeed, setScrollSpeed] = useState(() => parseInt(localStorage.getItem('nc_scrollSpeed') ?? '50'));

  // Refs so the event-listener closure always reads fresh values
  const alphaRef       = useRef(parseFloat(localStorage.getItem('nc_alpha')       ?? '0.25'));
  const debounceMsRef  = useRef(parseInt(localStorage.getItem('nc_debounceMs')   ?? '800'));
  const scrollSpeedRef = useRef(parseInt(localStorage.getItem('nc_scrollSpeed') ?? '50'));
  const lastScrollYRef = useRef<number | null>(null);

  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const engineDataRef  = useRef<EngineMessage | null>(null);
  const smoothXRef     = useRef(0.5);
  const smoothYRef     = useRef(0.5);
  const lastGestureRef = useRef<{ event: string; time: number }>({ event: "", time: 0 });

  // Sync ref with state
  useEffect(() => {
    engineDataRef.current = engineData;
  }, [engineData]);

  const screenBoundsRef = useRef({ width: window.screen.width, height: window.screen.height, offsetX: 0, offsetY: 0 });
  
  // Persist settings
  useEffect(() => { alphaRef.current = alpha;             localStorage.setItem('nc_alpha',       alpha.toString()); },       [alpha]);
  useEffect(() => { debounceMsRef.current = debounceMs;   localStorage.setItem('nc_debounceMs',  debounceMs.toString()); },  [debounceMs]);
  useEffect(() => { scrollSpeedRef.current = scrollSpeed; localStorage.setItem('nc_scrollSpeed', scrollSpeed.toString()); }, [scrollSpeed]);
  
  // Monitor detection
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

      screenBoundsRef.current = {
        width:   right - left,
        height:  bottom - top,
        offsetX: left,
        offsetY: top,
      };

      console.log("[Screens]", screenBoundsRef.current);
    }).catch(console.error);
  }, []);

  // Webcam + Tauri IPC listener 
  useEffect(() => {
    let mediaStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        mediaStream = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => console.error("Webcam error:", err));

    const unlisten = listen<string>("engine-event", async (event) => {
      try {
        const parsed: EngineMessage = JSON.parse(event.payload);
        setEngineData(parsed);
        setIsConnected(true);
    
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
      if (mediaStream) {
        (mediaStream as MediaStream).getTracks().forEach((track) => track.stop());
      }
      unlisten.then((fn) => fn());
    };
  }, []);

  // Canvas overlay: laser-dot draw loop
  useEffect(() => {
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

        // Outer glow
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
        glow.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Solid core
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.shadowColor = `rgba(${r},${g},${b},0.95)`;
        ctx.shadowBlur  = 18;
        ctx.fill();
        ctx.shadowBlur  = 0;

        // Gesture label
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
  }, []);

  const isHandVisible = engineData?.x !== undefined && engineData?.y !== undefined;

  return (
    <div className="relative min-h-screen bg-[#050403] text-stone-200 font-sans selection:bg-amber-500/20 overflow-y-auto">
      
      {/* Background Ambient LightRays */}
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

      {/* Main Centered Container */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8 flex flex-col items-center gap-6">

        {/* Top Header */}
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-white/8 backdrop-blur-md">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isConnected ? "bg-amber-500 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.7)]" : "bg-stone-600"}`} />
              <span className="text-[11px] font-mono text-stone-400">
                {isConnected ? "Engine live" : "Connecting..."}
              </span>
            </div>
          </div>
        </header>

        {/* Centered Main Section */}
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
            
            {/* Video Feed — subtle warm tone */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
              style={{ filter: 'sepia(0.12) contrast(1.03) brightness(0.95) hue-rotate(-8deg)' }}
            />

            {/* Warm corner vignettes — very subtle */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(120,50,10,0.18) 0%, transparent 55%), radial-gradient(ellipse at 100% 50%, rgba(120,50,10,0.18) 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(5,3,2,0.45) 0%, transparent 60%)' }} />

            {/* Canvas Overlay */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none z-10"
            />

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
          <div className="w-full bg-[#0d0b09]/80 backdrop-blur-xl rounded-2xl border border-white/5 p-6 mb-12">
            <div className="mb-6">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-700/80 mb-1">Make it yours</p>
              <h3 className="text-sm font-medium text-stone-300">Cursor feel &amp; sensitivity</h3>
            </div>

            <div className="space-y-7">

              {/* Slider 1: Cursor Smoothing */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[13px] font-medium text-stone-200">Cursor smoothing</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Filter micro-movements for steadier control</p>
                  </div>
                  <span className="text-amber-500 font-mono text-xs px-2 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 tabular-nums">
                    {alpha.toFixed(2)}
                  </span>
                </div>
                <input
                  id="slider-smoothing"
                  type="range"
                  min={0.05} max={0.5} step={0.01}
                  value={alpha}
                  onChange={(e) => setAlpha(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-600 font-mono">
                  <span>Smooth</span>
                  <span>Raw</span>
                </div>
              </div>

              <div className="border-t border-white/5" />

              {/* Slider 2: Click Delay */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[13px] font-medium text-stone-200">Click delay</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Minimum time between repeated click gestures</p>
                  </div>
                  <span className="text-amber-500 font-mono text-xs px-2 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 tabular-nums">
                    {debounceMs}ms
                  </span>
                </div>
                <input
                  id="slider-debounce"
                  type="range"
                  min={200} max={1500} step={50}
                  value={debounceMs}
                  onChange={(e) => setDebounceMs(parseInt(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-600 font-mono">
                  <span>Quick</span>
                  <span>Slow</span>
                </div>
              </div>

              <div className="border-t border-white/5" />

              {/* Slider 3: Scroll Speed */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[13px] font-medium text-stone-200">Scroll speed</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Scales how far each finger movement scrolls</p>
                  </div>
                  <span className="text-amber-500 font-mono text-xs px-2 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 tabular-nums">
                    {scrollSpeed}×
                  </span>
                </div>
                <input
                  id="slider-scroll-speed"
                  type="range"
                  min={20} max={100} step={5}
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(parseInt(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-600 font-mono">
                  <span>Slow</span>
                  <span>Fast</span>
                </div>
              </div>

            </div>
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