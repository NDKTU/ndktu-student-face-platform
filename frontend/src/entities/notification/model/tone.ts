import type { NotificationType } from './notifications';

/** Цвет иконки уведомления по типу. Перенесено из notifTone() прототипа. */
const TONES: Record<string, { bg: string; fg: string }> = {
  submit: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand-ink)' },
  grade: { bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
  test: { bg: 'var(--color-violet-soft)', fg: 'var(--color-violet)' },
  lesson: { bg: 'var(--color-info-soft)', fg: 'var(--color-info)' },
  deadline: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
  user: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand-ink)' },
  plan: { bg: 'var(--color-violet-soft)', fg: 'var(--color-violet)' },
  guruh: { bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
  fan: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand-ink)' },
  kurs: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
  system: { bg: 'var(--color-surface-muted)', fg: 'var(--color-ink-muted)' },
};

export function notificationTone(type: NotificationType) {
  return TONES[type] ?? TONES.system!;
}

/**
 * Контуры иконок из glyph() прототипа. Ключи — типы уведомлений;
 * неизвестный тип получает иконку system.
 */
export const NOTIFICATION_GLYPHS: Record<string, string[]> = {
  submit: [
    'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z',
    'M8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2',
    'm9.5 13 2 2 4-4',
  ],
  grade: ['M12 3 5 6v5c0 4.4 3 7.4 7 8.8 4-1.4 7-4.4 7-8.8V6z', 'm9 12 2 2 4-4'],
  test: [
    'M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M13 3v5h5',
    'm9.3 14 1.7 1.7 3.2-3.4',
  ],
  lesson: [
    'M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5V18a1 1 0 0 1-1 1h-5.5a1.5 1.5 0 0 0-2.9 0H5a1 1 0 0 1-1-1z',
    'M12 6v13',
  ],
  deadline: ['M12 8v4l2.5 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6'],
  plan: ['M3.5 4.5h17v16h-17z', 'M3.5 9h17', 'M8 3v3.5', 'M16 3v3.5'],
  guruh: [
    'M9 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5',
    'M16 3.2a3 3 0 0 1 0 5.8',
    'M18.5 20c0-2.4-.8-4.1-2.1-5.1',
  ],
  fan: [
    'M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5V18a1 1 0 0 1-1 1h-5.5a1.5 1.5 0 0 0-2.9 0H5a1 1 0 0 1-1-1z',
    'M12 6v13',
  ],
  kurs: ['M3 4h7v7H3z', 'M14 4h7v7h-7z', 'M3 15h7v5H3z', 'M14 15h7v5h-7z'],
  system: [
    'M12 9v4',
    'M12 17h.01',
    'M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  ],
};

export function notificationGlyph(type: NotificationType): string[] {
  return NOTIFICATION_GLYPHS[type] ?? NOTIFICATION_GLYPHS.system!;
}
