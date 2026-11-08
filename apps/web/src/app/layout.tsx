import './globals.css';
import type { ReactNode } from 'react';
import { Barlow, Barlow_Condensed, Bebas_Neue, JetBrains_Mono } from 'next/font/google';

const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
// The same faces as srdmining.com: Barlow for text, Barlow Condensed for headings, Bebas Neue for the wordmark.
const sans = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const brand = Bebas_Neue({ subsets: ['latin'], weight: '400', variable: '--font-brand' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata = { title: 'SR Drilling & Mining', description: 'SR Drilling & Mining — operations & equipment management', icons: { icon: '/brand/sr-emblem.png', apple: '/brand/apple-touch-icon.png' } };
export const viewport = { themeColor: '#151549' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${display.variable} ${sans.variable} ${brand.variable} ${mono.variable}`}><body>{children}</body></html>;
}
