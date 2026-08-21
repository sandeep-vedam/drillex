'use client';
import { useRouter } from 'next/navigation';
import { Wordmark } from '@/components/Brand';
import { PasswordForm } from '@/components/PasswordForm';
export default function ForcedChange() {
  const r = useRouter();
  return (
    <main className="min-h-screen grid place-items-center p-8 bg-canvas">
      <div className="w-full max-w-[520px] card p-8 flex flex-col gap-6">
        <Wordmark />
        <div><div className="eyebrow">First sign-in</div><h1 className="font-display font-semibold text-[32px] text-navy-800 leading-tight">Set your personal password</h1><p className="text-muted text-[14px]">You signed in with a temporary password issued by your supervisor or administrator. Choose a password only you know.</p></div>
        <PasswordForm forced onDone={() => r.push('/dashboard')} />
      </div>
    </main>
  );
}
