import { useEffect } from 'react';
import { useStructureStore } from '../model/structure.store';

/**
 * Подтягивает дерево структуры при первом обращении. Страниц-потребителей три
 * (Tuzilma, O'quv reja, Dashboard), а загрузка должна быть одна — поэтому
 * запрос стартует только из состояния `idle`.
 */
export function useStructure() {
  const status = useStructureStore((s) => s.status);
  const error = useStructureStore((s) => s.error);
  const load = useStructureStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
