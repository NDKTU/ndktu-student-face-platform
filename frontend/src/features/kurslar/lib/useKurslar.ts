import { useEffect } from 'react';
import { useCoursesStore } from '../model/courses.store';

/** Подтягивает список курсов при первом обращении (как useTestlar/useSavollar). */
export function useKurslar() {
  const status = useCoursesStore((s) => s.status);
  const error = useCoursesStore((s) => s.error);
  const load = useCoursesStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
