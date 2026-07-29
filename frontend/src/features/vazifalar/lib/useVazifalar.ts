import { useEffect } from 'react';
import { useTasksStore } from '../model/tasks.store';

/**
 * Подтягивает список заданий при первом обращении.
 *
 * Что видно этой роли, решает сервер: преподаватель получает свои курсы,
 * студент — курсы своей группы. А вот собственную сдачу студента бэкенд в
 * список не кладёт, поэтому экран студента просит её отдельно (`withMine`).
 */
export function useVazifalar(withMine = false) {
  const status = useTasksStore((s) => s.status);
  const error = useTasksStore((s) => s.error);
  const load = useTasksStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load(withMine);
  }, [status, load, withMine]);

  return { status, error, reload: () => load(withMine) };
}
