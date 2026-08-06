import { useEffect } from 'react';
import { useLavozimlarStore } from '../model/lavozimlar.store';

/** Подтягивает справочник подразделений при первом обращении (как useRollar). */
export function useLavozimlar() {
  const lavozimlar = useLavozimlarStore((s) => s.lavozimlar);
  const status = useLavozimlarStore((s) => s.status);
  const error = useLavozimlarStore((s) => s.error);
  const load = useLavozimlarStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { lavozimlar, status, error, reload: load };
}
