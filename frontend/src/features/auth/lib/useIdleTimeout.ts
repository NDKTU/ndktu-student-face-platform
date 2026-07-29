import { useEffect, useRef } from 'react';
import { useSessionStore } from '../model/session.store';

/**
 * 15 минут — заведомо меньше серверного `session_idle_minutes` (30 мин по
 * умолчанию). Клиент должен выходить первым и по-человечески: иначе сервер
 * молча инвалидирует скользящую сессию, и следующее же действие пользователя
 * упрётся в 401 без объяснения.
 */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Что считаем активностью. */
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

export function useIdleTimeout() {
  const status = useSessionStore((s) => s.status);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => useSessionStore.getState().signOut('idle'),
        IDLE_TIMEOUT_MS,
      );
    };

    reset();
    // passive: слушатели вешаются на mousemove и scroll, блокировать прокрутку
    // они не должны.
    ACTIVITY_EVENTS.forEach((event) =>
      document.addEventListener(event, reset, { passive: true }),
    );

    return () => {
      if (timer.current) clearTimeout(timer.current);
      ACTIVITY_EVENTS.forEach((event) => document.removeEventListener(event, reset));
    };
  }, [status]);
}
