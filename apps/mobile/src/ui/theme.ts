export const colors = {
  canvas: '#F2F5F9', surface: '#FFFFFF', ink: '#18232F', muted: '#5B6877', line: '#D6DEE8',
  // SR Drilling & Mining brand (srdmining.com): deep blue + gold. Gold is an accent for dark surfaces, fills and borders
  // only — as text on white it is unreadable (1.8:1), so warnings and highlighted text use the darker `hazard` amber (5.1:1).
  navy900: '#061F38', navy800: '#092F53', navy700: '#1C3954', navy100: '#E4EBF3',
  gold: '#F6B839', hazard: '#9A6100', ok: '#2E8B57', warn: '#D49A10', crit: '#C2342A', steel: '#5B6877',
  // Supervisor Mode banner and highlighted fields (client spec §7 "Warning" token). Use with dark text only.
  supervisor: '#F59E0B',
};
export const font = {
  // Barlow Condensed / IBM Plex are loaded on web; on mobile we use platform faces until custom fonts are linked.
  display: { fontWeight: '700' as const, letterSpacing: 0.3 },
  mono: { fontFamily: 'Menlo' },
};
export const space = (n: number) => n * 4;
