/**
 * Единая точка хранения access-токена.
 *
 * localStorage, а не sessionStorage — по двум причинам, и обе обязательные:
 *
 * 1. Бэкенд держит одну активную сессию на пользователя (`user:session:{id}` →
 *    `jti` в Redis, вход с другого устройства перезаписывает `jti`). С
 *    sessionStorage вторая вкладка получила бы свой токен и вытеснила первую.
 *    Общий localStorage означает один токен и один `jti` на весь браузер.
 *
 * 2. Пока идёт миграция, старый интерфейс живёт на том же origin по /legacy/ и
 *    делит с новым это же хранилище. Ключ здесь совпадает с ключом старого
 *    приложения намеренно: два разных ключа дали бы два токена, гонку за один
 *    серверный `jti` и случайные 401 в том из них, куда вошли раньше.
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
