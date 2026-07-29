import { useEffect } from 'react';
import { useSessionStore } from '../model/session.store';

/**
 * Как часто перечитывать профиль. Администратор мог поменять роль или права
 * прямо сейчас — без этого пользователю пришлось бы перезаходить, чтобы
 * увидеть новый раздел (или перестать видеть отобранный).
 */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Поддерживает `/user/me` в актуальном состоянии. Монтируется один раз, в
 * корне приложения.
 *
 * Событие `app:refresh-me` шлёт транспорт, когда сервер ответил 403: чаще
 * всего это и означает, что права только что изменились.
 */
export function useSessionSync() {
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const refresh = () => void useSessionStore.getState().refreshMe();

    window.addEventListener('app:refresh-me', refresh);
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener('app:refresh-me', refresh);
      clearInterval(timer);
    };
  }, [status]);
}
