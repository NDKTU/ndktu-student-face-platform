import { useEffect } from 'react';
import { useCourseOptionsStore } from '../model/courseOptions.store';

/** Подтягивает справочники формы курса при первом обращении (как useKurslar). */
export function useCourseOptions() {
  const status = useCourseOptionsStore((s) => s.status);
  const load = useCourseOptionsStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status };
}
