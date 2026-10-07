import { useEffect, useState } from 'react';
export function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!until) return;
    const tick = () => { const time = Date.now(); setNow(time); if (time >= until) setUntil(0); };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return [Math.max(0, Math.ceil((until - now) / 1000)), seconds => { const time = Date.now(); setNow(time); setUntil(time + seconds * 1000); }];
}
