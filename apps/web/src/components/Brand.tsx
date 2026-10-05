/** SR Drilling & Mining emblem (from srdmining.com), the parent brand Drillex runs under. */
export function Mark({ size = 32 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 256px PNG; next/image adds nothing here
  return <img src="/brand/sr-emblem.png" width={size} height={size} alt="" aria-hidden className="bg-white" />;
}
export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      <div className="leading-none">
        <div className={`font-brand text-[24px] tracking-wide ${light ? 'text-white' : 'text-navy-800'}`}>DRILLEX</div>
        <div className={`font-display text-[10px] tracking-[.2em] ${light ? 'text-gold' : 'text-muted'}`}>SR DRILLING &amp; MINING</div>
      </div>
    </div>
  );
}
