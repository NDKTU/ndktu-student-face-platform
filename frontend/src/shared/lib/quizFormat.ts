/**
 * Мелочи экрана тестов: обратный отсчёт и код доступа. Жили в мок-генераторе,
 * но данными не являются и переживают его удаление.
 */

/** Форматирует секунды в MM:SS. */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds | 0);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Шестизначный PIN. Считается на клиенте: бэкенд принимает его в теле запроса
 * на создание теста и сам не придумывает.
 */
export function generatePin(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}
