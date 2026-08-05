import { useEffect } from 'react';
import { useBolimlarStore } from '../model/bolimlar.store';

/** Подтягивает справочник подразделений при первом обращении (как useRollar). */
export function useBolimlar() {
  const bolimlar = useBolimlarStore((s) => s.bolimlar);
  const status = useBolimlarStore((s) => s.status);
  const error = useBolimlarStore((s) => s.error);
  const load = useBolimlarStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { bolimlar, status, error, reload: load };
}
