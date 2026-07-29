import { useEffect } from 'react';
import { useTasksStore } from '../model/tasks.store';

/**
 * Подтягивает список заданий при первом обращении.
 * Фильтровать здесь нечего: сервер отдаёт только то, что положено владельцу
 * токена, и студенту сразу кладёт его собственную сдачу в каждую строку.
 */
export function useVazifalar() {
  const status = useTasksStore((s) => s.status);
  const error = useTasksStore((s) => s.error);
  const load = useTasksStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
