import { useEffect } from 'react';
import { useStudentsStore } from '../model/students.store';

/** Подтягивает реестр студентов при первом обращении. */
export function useTalabalar() {
  const status = useStudentsStore((s) => s.status);
  const error = useStudentsStore((s) => s.error);
  const load = useStudentsStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
