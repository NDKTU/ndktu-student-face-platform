import { useEffect } from 'react';
import { useRollarStore } from '../model/rollar.store';

/** Подтягивает матрицу прав при первом обращении (как useFanlar/useTestlar). */
export function useRollar() {
  const status = useRollarStore((s) => s.status);
  const error = useRollarStore((s) => s.error);
  const load = useRollarStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
