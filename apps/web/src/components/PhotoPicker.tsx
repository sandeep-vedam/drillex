'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';

// The API stores jpg, png and pdf only, and caps a single file at 8 MB — rejected client-side so a
// 10 MB photo fails on the spot instead of after a slow base64 upload.
const ACCEPTED = ['image/jpeg', 'image/png'];
const MAX_BYTES = 8 * 1024 * 1024;

export type PendingPhoto = { key: string; name: string; contentType: string; base64: string; dataUrl: string };
export type AssetPhoto = { id: string; kind: string; url: string; createdAt: string };

const readFile = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error(`${f.name} could not be read`));
  r.readAsDataURL(f);
});

export async function readPhotoFiles(files: FileList | null): Promise<{ photos: PendingPhoto[]; errors: string[] }> {
  const photos: PendingPhoto[] = []; const errors: string[] = [];
  for (const f of Array.from(files ?? [])) {
    if (!ACCEPTED.includes(f.type)) { errors.push(`${f.name}: only JPEG and PNG images can be uploaded`); continue; }
    if (f.size > MAX_BYTES) { errors.push(`${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB is over the 8 MB limit`); continue; }
    try {
      const dataUrl = await readFile(f);
      photos.push({ key: `${f.name}-${f.lastModified}-${f.size}`, name: f.name, contentType: f.type, base64: dataUrl.split(',')[1] ?? '', dataUrl });
    } catch (e) { errors.push((e as Error).message); }
  }
  return { photos, errors };
}

/** Uploads one at a time: the JSON body limit is per request, and base64 makes each photo ~1.33× its file size. */
export async function uploadPhotos(assetId: string, photos: PendingPhoto[]) {
  for (const p of photos) {
    await api('/attachments', { method: 'POST', body: JSON.stringify({ ownerType: 'Asset', ownerId: assetId, kind: 'PHOTO', contentType: p.contentType, base64: p.base64 }) });
  }
}

export function PhotoPicker({ photos, onChange, disabled, label = 'Add photos' }: { photos: PendingPhoto[]; onChange: (p: PendingPhoto[]) => void; disabled?: boolean; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  async function pick(files: FileList | null) {
    const { photos: picked, errors: errs } = await readPhotoFiles(files);
    setErrors(errs);
    const seen = new Set(photos.map((p) => p.key));
    onChange([...photos, ...picked.filter((p) => !seen.has(p.key))]);
    if (input.current) input.current.value = ''; // so re-picking the same file still fires onChange
  }
  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.key} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt={p.name} className="h-20 w-20 object-cover border border-line" />
            <button type="button" onClick={() => onChange(photos.filter((x) => x.key !== p.key))} className="absolute -top-2 -right-2 h-5 w-5 bg-crit text-white text-[12px] leading-none" aria-label={`Remove ${p.name}`}>✕</button>
          </div>
        ))}
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="h-20 w-20 border border-dashed border-line text-[12px] text-muted hover:border-navy-600 hover:text-ink">+ {label}</button>
      </div>
      {errors.map((e) => <p key={e} role="alert" className="text-[12px] text-crit">{e}</p>)}
    </div>
  );
}
