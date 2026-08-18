/**
 * Пастельные плитки-инициалы для карточек справочников (стиль референс-дизайна).
 * Осознанное исключение из правила «только семантические токены»: это
 * декоративные аватары; dark:-варианты обязательны для тёмной темы.
 */
export const AVATAR_TILES = [
    'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    'bg-teal-500/15 text-teal-600 dark:text-teal-400',
    'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    'bg-rose-500/15 text-rose-600 dark:text-rose-400',
];

/** Цвет стабилен для записи: выбирается по id, а не по позиции в списке */
export const tileFor = (id: number) => AVATAR_TILES[id % AVATAR_TILES.length];

export const initialsOf = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('') || '?';
