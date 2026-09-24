'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Technician sign-off for a job card (SRS §7.6): draw with mouse, pen or finger. Calls onChange with a PNG data URL
 * once something is drawn, and with null when cleared.
 */
export function SignaturePad({ onChange, label = 'Technician signature' }: { onChange: (dataUrl: string | null) => void; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0B1B30';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true;
    const ctx = e.currentTarget.getContext('2d')!; const [x, y] = point(e); ctx.beginPath(); ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d')!; const [x, y] = point(e); ctx.lineTo(x, y); ctx.stroke();
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return; drawing.current = false;
    setSigned(true); onChange(e.currentTarget.toDataURL('image/png'));
  }
  function clear() {
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d')!; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
    setSigned(false); onChange(null);
  }

  return (
    <div className="flex flex-col gap-1.5 text-[13px] font-medium">
      <div className="flex items-center justify-between">{label}{signed && <button type="button" onClick={clear} className="text-crit text-[12px] font-semibold">Clear</button>}</div>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className={`h-32 w-full touch-none bg-white border ${signed ? 'border-ok' : 'border-line'} cursor-crosshair`} aria-label={label} />
      {!signed && <span className="text-[12px] text-muted font-normal">Sign in the box above.</span>}
    </div>
  );
}
