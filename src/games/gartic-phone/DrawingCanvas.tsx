"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

const COLORS = ["#17171b", "#ff5c4d", "#4dc9ff", "#3ee6a8", "#ffc24d", "#b06bff", "#ffffff"];
const SIZES = [3, 7, 14];

export function DrawingCanvas({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvasRef.current!.width,
      y: ((e.clientY - rect.top) / rect.height) * canvasRef.current!.height,
    };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current!.setPointerCapture(e.pointerId);
    draw(e);
  };

  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={480}
        height={360}
        className="w-full cursor-crosshair touch-none rounded-2xl border border-[var(--line)] bg-white"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={`Farbe ${c}`}
            className={cn(
              "h-9 w-9 cursor-pointer rounded-full border-2 transition-transform",
              color === c ? "scale-110 border-[var(--accent)]" : "border-[var(--line)]"
            )}
            style={{ background: c }}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-[var(--line)]" />
        {SIZES.map((s) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            aria-label={`Pinselgröße ${s}`}
            className={cn(
              "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border",
              size === s ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"
            )}
          >
            <span className="rounded-full bg-current" style={{ width: s + 3, height: s + 3 }} />
          </button>
        ))}
        <button onClick={clear} className="display ml-auto cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-bold">
          🗑️ Leeren
        </button>
      </div>
    </div>
  );
}
