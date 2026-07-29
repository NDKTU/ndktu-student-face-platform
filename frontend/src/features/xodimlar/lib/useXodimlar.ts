import { useEffect } from 'react';
import { useEmployeesStore } from '../model/employees.store';

/** Подтягивает справочник сотрудников при первом обращении. */
export function useXodimlar() {
  const status = useEmployeesStore((s) => s.status);
  const error = useEmployeesStore((s) => s.error);
  const load = useEmployeesStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
