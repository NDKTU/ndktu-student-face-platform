import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/api/http';

export type AsyncStatus = 'loading' | 'ready' | 'denied' | 'error';

export interface AsyncData<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
}

/**
 * Одноразовая загрузка по ключу — для данных, которые нужны только открытой
 * карточке и не заслуживают собственного стора.
 *
 * 403 — отдельный статус, а не ошибка: «нет доступа» экран показывает иначе,
 * чем «сервер не ответил», и различать их по тексту сообщения было бы хрупко.
 */
export function useAsyncData<T>(
  key: number | null,
  load: (key: number) => Promise<T>,
): AsyncData<T> {
  const [state, setState] = useState<AsyncData<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  // `load` приходит из модуля API и стабилен между рендерами, но линтеру это
  // неизвестно — держим его в ref, чтобы перезапрос шёл только по смене key.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    // null — «пока не надо»: вызывающий уже знает, что данные не нужны.
    if (key === null) return;

    let alive = true;
    setState({ status: 'loading', data: null, error: null });

    loadRef
      .current(key)
      .then((data) => {
        if (alive) setState({ status: 'ready', data, error: null });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const denied = e instanceof ApiError && e.status === 403;
        setState({
          status: denied ? 'denied' : 'error',
          data: null,
          error: e instanceof Error ? e.message : String(e),
        });
      });

    // Карточку могли закрыть до ответа — тогда обновлять состояние нельзя.
    return () => {
      alive = false;
    };
  }, [key]);

  return state;
}
