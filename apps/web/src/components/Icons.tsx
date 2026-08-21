import type { SVGProps } from 'react';
const P = (p: SVGProps<SVGSVGElement>) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p} />;
export const I = {
  Dashboard: (p: SVGProps<SVGSVGElement>) => <P {...p}><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></P>,
  Asset: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M3 17h18M5 17V9l4-4h6l4 4v8"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/><path d="M9 9h6"/></P>,
  Drill: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M12 3v14M8 7l4-4 4 4M7 17h10l-2 4H9z"/></P>,
  Gauge: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M4 14a8 8 0 0 1 16 0"/><path d="M12 14l4-4"/><path d="M2 14h4M18 14h4"/></P>,
  Wrench: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M14.7 6.3a4 4 0 0 0 5 5L13 18l-3 3-4-4 3-3 6.7-6.7z"/><path d="M3 21l3-3"/></P>,
  Card: (p: SVGProps<SVGSVGElement>) => <P {...p}><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M7 13h6M7 16h4"/></P>,
  Box: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></P>,
  Report: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M5 3h10l4 4v14H5z"/><path d="M9 17v-4M12 17v-7M15 17v-2"/></P>,
  Bell: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></P>,
  Users: (p: SVGProps<SVGSVGElement>) => <P {...p}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-5"/></P>,
  Settings: (p: SVGProps<SVGSVGElement>) => <P {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></P>,
  Search: (p: SVGProps<SVGSVGElement>) => <P {...p}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></P>,
  Alert: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/></P>,
  Check: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M5 12l4 4L19 7"/></P>,
  Logout: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></P>,
  Sync: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M4 4v4h4M20 20v-4h-4"/></P>,
  Plus: (p: SVGProps<SVGSVGElement>) => <P {...p}><path d="M12 5v14M5 12h14"/></P>,
};
