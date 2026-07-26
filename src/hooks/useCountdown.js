import { useEffect, useState } from 'react';

// Berilgan ISO vaqtgacha teskari hisob. { remaining (sekund), mmss, expired }.
export function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const target = expiresAt ? new Date(expiresAt).getTime() : 0;
  const remaining = target ? Math.max(0, Math.floor((target - now) / 1000)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return { remaining, mmss: `${mm}:${ss}`, expired: Boolean(expiresAt) && remaining <= 0 };
}
