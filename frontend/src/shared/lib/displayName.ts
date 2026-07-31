/**
 * Название подразделения в человеческом виде.
 *
 * База хранит канонический нижний регистр (`normalized_name` в
 * `app/core/schemas.py`) — так одно и то же название нельзя завести дважды в
 * разном написании. Заглавные буквы — целиком забота показа, поэтому живут
 * здесь, а не в данных.
 */

/**
 * Служебные слова остаются строчными: «Konchilik Va Metallurgiya» читается
 * как ошибка, а не как название.
 */
const LOWER = new Set(['va', 'hamda', 'bilan', 'uchun', 'ham']);

export function displayName(name: string): string {
  if (!name) return '';

  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('uz');
      return index > 0 && LOWER.has(lower) ? lower : capitalize(word);
    })
    .join(' ');
}

/**
 * Заглавная только первая буква, остальные строчные — иначе введённое капсом
 * так капсом и осталось бы, а сохранилось бы всё равно в нижнем регистре, и
 * подсказка в форме врала бы. Небуквенный префикс пропускаем: «(kechki)»
 * должно стать «(Kechki)».
 */
function capitalize(word: string): string {
  const lower = word.toLocaleLowerCase('uz');
  const at = [...lower].findIndex((char) => char !== char.toLocaleUpperCase('uz'));
  if (at < 0) return lower;

  return lower.slice(0, at) + lower[at]!.toLocaleUpperCase('uz') + lower.slice(at + 1);
}
