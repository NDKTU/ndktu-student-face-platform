import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { userService } from '@/services/userService';
import { getToken, clearToken } from '@/services/tokenStorage';

// 15 минут. Должно быть <= серверного session_idle_minutes (30 мин), чтобы клиент
// выходил первым и мягко, до того как сервер инвалидирует скользящую сессию.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export function useIdleTimeout() {
  const navigate = useNavigate();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Функция для очистки сессии и редиректа
  const handleLogout = useCallback(() => {
    // Best-effort серверный отзыв сессии, затем очистка токена и редирект.
    userService.logout().catch(() => { /* токен всё равно очищаем ниже */ });
    clearToken();

    // Перенаправляем на логин с параметром, чтобы показать красивое сообщение
    navigate('/login?idle=1');
  }, [navigate]);

  // Сброс таймера при любой активности пользователя
  const resetTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
    }
    // Запускаем таймер заново
    idleTimer.current = setTimeout(handleLogout, IDLE_TIMEOUT_MS);
  }, [handleLogout]);

  useEffect(() => {
    // Проверяем, залогинен ли пользователь (есть ли токен)
    const token = getToken();
    if (!token) return;

    // Запускаем таймер первый раз при монтировании компонента
    resetTimer();

    // Список событий, которые считаются активностью пользователя
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    // Вешаем слушатели на document. passive: true улучшает производительность скролла
    events.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    // Очистка при размонтировании
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach(event => document.removeEventListener(event, resetTimer));
    };
  }, [resetTimer]);
}
