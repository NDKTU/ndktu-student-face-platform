import { useEffect } from 'react';
import { useFanlarStore } from '../model/fanlar.store';

/**
 * Подтягивает каталог фанов при первом обращении. Потребителей два — страница
 * «Fanlar» и «O'quv reja» (там из фанов берутся подсказки к полю «Fan»),
 * поэтому запрос стартует только из состояния `idle`.
 */
export function useFanlar() {
  const status = useFanlarStore((s) => s.status);
  const error = useFanlarStore((s) => s.error);
  const load = useFanlarStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { status, error, reload: load };
}
