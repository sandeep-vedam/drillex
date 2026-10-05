import type { MetadataRoute } from 'next';

// Home-screen install icons. The maskable one is the Android launcher's adaptive foreground (emblem on navy
// with safe-zone padding), so the web app and the Android app look the same on a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Drillex — SR Drilling & Mining',
    short_name: 'Drillex',
    start_url: '/',
    display: 'standalone',
    background_color: '#151549',
    theme_color: '#151549',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/sr-emblem.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-432.png', sizes: '432x432', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
