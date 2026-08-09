import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

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
  "pause":       [234, 179,   8],
  "right-click": [ 59, 130, 246],
  "scroll":      [168,  85, 247],
};
const DEFAULT_COLOR: [number, number, number] = [239, 68, 68];

function App() {
  const [engineData, setEngineData] = useState<EngineMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  // Ref keeps the canvas draw-loop up to date without re-subscribing
  const engineDataRef  = useRef<EngineMessage | null>(null);

  // ── Sync ref with state so the RAF loop always reads fresh data ──────────
  useEffect(() => {
    engineDataRef.current = engineData;
  }, [engineData]);

  // ── Webcam + Tauri IPC listener ──────────────────────────────────────────
  useEffect(() => {
    // Webcam
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => console.error("Webcam error:", err));

    // Engine events
    const unlisten = listen<string>("engine-event", (event) => {
      try {
        const parsed: EngineMessage = JSON.parse(event.payload);
        setEngineData(parsed);
        setIsConnected(true);
      } catch (err) {
        console.error("Failed to parse engine JSON:", err);
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // ── Canvas overlay: laser-dot draw loop ─────────────────────────────────
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