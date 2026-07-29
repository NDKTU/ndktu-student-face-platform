import { useEffect } from 'react';
import { useTestlarStore } from '../model/testlar.store';

/** Подтягивает список тестов при первом обращении (как useSavollar/useFanlar). */
export function useTestlar() {
  const status = useTestlarStore((s) => s.status);
  const error = useTestlarStore((s) => s.error);
  const load = useTestlarStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
