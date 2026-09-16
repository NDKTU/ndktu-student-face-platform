import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getToken } from '@/services/tokenStorage';

// 15 минут. Должно быть <= серверного session_idle_minutes (30 мин), чтобы клиент
// выходил первым и мягко, до того как сервер инвалидирует скользящую сессию.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export function useIdleTimeout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Выход по бездействию проходит через общий logout() контекста: он отзывает
  // сессию на сервере (с токеном, снятым до очистки хранилища) и сбрасывает
  // user. Свой clearToken() здесь оставлял AuthContext.user заполненным —
  // токена нет, а приложение считает человека залогиненным.
  const handleLogout = useCallback(() => {
    logout();
    // Перенаправляем на логин с параметром, чтобы показать красивое сообщение
    navigate('/login?idle=1');
  }, [logout, navigate]);

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
