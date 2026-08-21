export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" fill="#E06A10" />
      <path d="M8 6h7a10 10 0 0 1 0 20H8V6zm5 5v10h2a5 5 0 0 0 0-10h-2z" fill="#0B1B30" />
    </svg>
  );
}
export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      <div className="leading-none">
        <div className={`font-display font-bold text-[20px] tracking-wide ${light ? 'text-white' : 'text-navy-800'}`}>DRILLEX</div>
        <div className={`font-display text-[10px] tracking-[.28em] ${light ? 'text-white/60' : 'text-muted'}`}>OPERATIONS</div>
      </div>
    </div>
  );
}
