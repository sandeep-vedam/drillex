import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';

/** SRS §2.2: session locks after 15 minutes of inactivity. Any touch resets the timer; backgrounding counts as inactivity. */
export const IDLE_MS = 15 * 60 * 1000;
type Ctx = { locked: boolean; lock: () => void; unlock: () => void; touch: () => void };
const C = createContext<Ctx>({ locked: false, lock: () => {}, unlock: () => {}, touch: () => {} });
export const useIdleLock = () => useContext(C);

export function IdleLockProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [locked, setLocked] = useState(false);
  const last = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!enabled) return;
    timer.current = setTimeout(() => setLocked(true), IDLE_MS);
  }, [enabled]);
  const touch = useCallback(() => { last.current = Date.now(); arm(); }, [arm]);

  useEffect(() => { arm(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [arm]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && enabled && Date.now() - last.current > IDLE_MS) setLocked(true);
      if (st === 'active') arm();
    });
    return () => sub.remove();
  }, [arm, enabled]);

  return (
    <C.Provider value={{ locked, lock: () => setLocked(true), unlock: () => { setLocked(false); touch(); }, touch }}>
      <View style={{ flex: 1 }} onStartShouldSetResponderCapture={() => { touch(); return false; }}>{children}</View>
    </C.Provider>
  );
}
