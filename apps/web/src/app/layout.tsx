import './globals.css';
import type { ReactNode } from 'react';
import { Barlow_Condensed, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';

const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata = { title: 'Drillex Ops', description: 'Operations & equipment management' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}><body>{children}</body></html>;
}
