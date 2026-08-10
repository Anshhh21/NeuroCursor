import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { availableMonitors } from "@tauri-apps/api/window";


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
  "left-click":  [ 59, 130, 246],  // blue   — pinch
  "scroll":      [168,  85, 247],  // purple — two fingers
};
const DEFAULT_COLOR: [number, number, number] = [239, 68, 68];

function App() {
  const [engineData, setEngineData] = useState<EngineMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  // Ref keeps the canvas draw-loop up to date without re-subscribing
  const engineDataRef  = useRef<EngineMessage | null>(null);
  const smoothXRef = useRef(0.5);  // Smoothed X position (0-1 range)
  const smoothYRef = useRef(0.5);  // Smoothed Y position (0-1 range)
  const lastGestureRef = useRef<{ event: string; time: number }>({ event: "", time: 0 });


  // Sync ref with state so the RAF loop always reads fresh data 
  useEffect(() => {
    engineDataRef.current = engineData;
  }, [engineData]);
  // Detects total virtual desktop size across all monitors
  const screenBoundsRef = useRef({ width: window.screen.width, height: window.screen.height, offsetX: 0, offsetY: 0 });

// monitor detection and logging
useEffect(() => {
  availableMonitors().then((monitors) => {
    if (monitors.length === 0) return;

    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;

    for (const m of monitors) {
      const sf = m.scaleFactor;
      const lx = m.position.x / sf;   // logical X of this monitor's top-left
      const ly = m.position.y / sf;
      const lw = m.size.width  / sf;  // logical width
      const lh = m.size.height / sf;

      left   = Math.min(left,   lx);
      top    = Math.min(top,    ly);
      right  = Math.max(right,  lx + lw);
      bottom = Math.max(bottom, ly + lh);
    }

    screenBoundsRef.current = {
      width:   right - left,   // Total virtual desktop width
      height:  bottom - top,
      offsetX: left,           // Will be NEGATIVE when laptop is left of external primary
      offsetY: top,
    };

    console.log("[Screens]", screenBoundsRef.current);
  }).catch(console.error);
}, []);


  //Webcam + Tauri IPC listener 
  useEffect(() => {
    let mediaStream: MediaStream | null = null;

    // Webcam
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        mediaStream = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => console.error("Webcam error:", err));

    // Engine events
    const unlisten = listen<string>("engine-event", async (event) => {
      try {
        const parsed: EngineMessage = JSON.parse(event.payload);
        setEngineData(parsed);
        setIsConnected(true);
    
       // OS Mouse Control 
      if (parsed.x !== undefined && parsed.y !== undefined && parsed.event !== "pause") {
        const ALPHA = 0.25;

        // Dead-zone remap: MediaPipe's practical range → full 0-1
        // Tune these constants if cursor still can't reach edges
        // mirroredX = (1 - X), so:
        const CAM_X_MIN = 1 - 0.9008;    // Left edge
        const CAM_X_MAX = 0.80;          // Right edge (lowered to make reaching the right screen easier)

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

      //Gesture Actions 
      const DEBOUNCE_MS = 800; // min ms between the same gesture firing again
      const now = Date.now();
      const last = lastGestureRef.current;

      if (parsed.event === "left-click" || parsed.event === "scroll") {
        // Fire only if gesture just changed, OR enough time has passed
        if (parsed.event !== last.event || now - last.time > DEBOUNCE_MS) {
          lastGestureRef.current = { event: parsed.event, time: now };

          if (parsed.event === "left-click") {
            await invoke("mouse_click", { button: "left" });
          } else if (parsed.event === "scroll") {
            await invoke("mouse_scroll", { length: -3 }); // negative = scroll up
          }
        }
      } else {
        // Gesture changed to something neutral — reset so next gesture fires cleanly
        if (parsed.event !== last.event) {
          lastGestureRef.current = { event: parsed.event ?? "", time: 0 };
        }
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
  

  //Canvas overlay: laser-dot draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId: number;

    // Keep canvas pixel dimensions in sync with its CSS size
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
        // Mirror X to match the CSS-mirrored video feed
        const cx = (1 - data.x) * canvas.width;
        const cy = data.y * canvas.height;
        const [r, g, b] = GESTURE_COLOR[data.event ?? ""] ?? DEFAULT_COLOR;

        // Outer glow
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
        glow.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Solid dot core
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
        ctx.shadowBlur  = 16;
        ctx.fill();
        ctx.shadowBlur  = 0;

        // Gesture label
        if (data.event && data.event !== "tracking") {
          ctx.font      = "bold 11px monospace";
          ctx.fillStyle = "white";
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur  = 4;
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
    <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-white font-sans p-6">

      {/* Header */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-4 px-4">
        <h1 className="text-2xl font-bold tracking-tight text-emerald-400">NeuroCursor v2</h1>
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-sm text-zinc-400 font-mono uppercase">
            {isConnected ? "Engine Live" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Video + Overlay */}
      <div className="relative w-full max-w-3xl aspect-video bg-zinc-900 rounded-2xl overflow-hidden border-2 border-zinc-800 shadow-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform -scale-x-100"
        />

        {/*
          Canvas overlay.
          <canvas> lives in the HTML compositing pipeline, so it always
          renders above the macOS hardware-accelerated <video> layer.
          No z-index tricks needed — canvas wins by design.
        */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 10 }}
        />

        {/* Live Debug Panel */}
        <div
          className="absolute bottom-4 left-4 bg-black/70 p-3 rounded-lg border border-zinc-700 font-mono text-xs text-zinc-300 pointer-events-none space-y-0.5"
          style={{ zIndex: 20 }}
        >
          <div>Gesture: <span className="text-emerald-400">{engineData?.event || "Waiting..."}</span></div>
          <div>Hand:    <span className="text-emerald-400">{engineData?.hand    || "None"}</span></div>
          <div>
            X: <span className="text-yellow-400">{engineData?.x?.toFixed(3) ?? "—"}</span>
            {"  "}
            Y: <span className="text-yellow-400">{engineData?.y?.toFixed(3) ?? "—"}</span>
          </div>
          <div>Dot: <span className={isHandVisible ? "text-emerald-400" : "text-red-400"}>{isHandVisible ? "YES ✓" : "NO ✗"}</span></div>
        </div>
      </div>
    </div>
  );
}

export default App;