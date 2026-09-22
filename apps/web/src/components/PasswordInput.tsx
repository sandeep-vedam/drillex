'use client';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { I } from './Icons';

/** Password field with a reveal toggle — same markup as the other labelled inputs, plus the eye button. */
export function PasswordInput({ label, children, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; children?: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium">{label}
      <span className="relative block">
        <input {...rest} type={shown ? 'text' : 'password'} className="input pr-11" />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          onMouseDown={(e) => e.preventDefault()} // keep the caret in the field when toggling
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute right-0 top-0 h-full px-3 flex items-center text-muted hover:text-ink focus-visible:outline-none focus-visible:text-navy-800"
        >
          {shown ? <I.EyeOff /> : <I.Eye />}
        </button>
      </span>
      {children}
    </label>
  );
}
