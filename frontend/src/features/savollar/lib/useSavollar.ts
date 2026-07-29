import { useEffect } from 'react';
import { useSavollarStore } from '../model/savollar.store';

/**
 * Подтягивает банк вопросов выбранного предмета и перезапрашивает его при
 * смене предмета. `null` — предмет ещё не выбран (у преподавателя может не
 * быть ни одного закрепления), тогда запроса нет.
 */
export function useSavollar(subjectId: number | null) {
  const status = useSavollarStore((s) => s.status);
  const error = useSavollarStore((s) => s.error);
  const loaded = useSavollarStore((s) => s.subjectId);
  const load = useSavollarStore((s) => s.load);

  useEffect(() => {
    if (subjectId === null) return;
    if (status === 'idle' || loaded !== subjectId) void load(subjectId);
  }, [subjectId, status, loaded, load]);

  return {
    status,
    error,
    reload: () => (subjectId === null ? Promise.resolve() : load(subjectId)),
  };
}
