import { useEffect } from 'react';
import { useSavollarStore } from '../model/savollar.store';

/** Подтягивает банк вопросов при первом обращении (как useFanlar/useStructure). */
export function useSavollar() {
  const status = useSavollarStore((s) => s.status);
  const error = useSavollarStore((s) => s.error);
  const load = useSavollarStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
