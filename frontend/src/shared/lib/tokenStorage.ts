/**
 * Единая точка хранения access-токена.
 *
 * localStorage, а не sessionStorage: бэкенд держит одну активную сессию на
 * пользователя (`user:session:{id}` → `jti` в Redis, вход с другого устройства
 * перезаписывает `jti`). С sessionStorage вторая вкладка получила бы свой токен
 * и вытеснила первую. Общий localStorage означает один токен и один `jti` на
 * весь браузер.
 *
 * Ключ `token` достался от старого интерфейса, который жил на том же origin.
 * Менять его не нужно и сейчас: у уже вошедших пользователей это разлогинило бы
 * сессию без всякой пользы.
 */
const TOKEN_KEY = 'token';

/**
 * Некоторые браузеры и профили (строгая защита от отслеживания в Firefox,
 * приватный режим, политики на данные сайта) бросают SecurityError на любое
 * обращение к localStorage. getToken() вызывается на каждом запросе, поэтому
 * неперехваченное исключение здесь роняло бы всё приложение.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Хранилище недоступно: сессия не переживёт перезагрузку, но приложение
    // продолжит работать — это лучше, чем белый экран.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // no-op
  }
}
