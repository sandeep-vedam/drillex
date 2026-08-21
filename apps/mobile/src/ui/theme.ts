export const colors = {
  canvas: '#F2F5F9', surface: '#FFFFFF', ink: '#18232F', muted: '#5B6877', line: '#D6DEE8',
  navy900: '#0B1B30', navy800: '#132B4A', navy700: '#1C3557', navy100: '#E3EAF3',
  hazard: '#E06A10', ok: '#2E8B57', warn: '#D49A10', crit: '#C2342A', steel: '#5B6877',
};
export const font = {
  // Barlow Condensed / IBM Plex are loaded on web; on mobile we use platform faces until custom fonts are linked.
  display: { fontWeight: '700' as const, letterSpacing: 0.3 },
  mono: { fontFamily: 'Menlo' },
};
export const space = (n: number) => n * 4;
