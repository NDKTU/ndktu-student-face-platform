import type { TaskStatus } from '../model/types';

/** Подпись и цвет чипа статуса. Оформление, а не данные. */
export function taskStatusMeta(status: TaskStatus): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'baholangan':
      return { label: 'Baholangan', bg: 'var(--color-success-tint)', fg: 'var(--color-success)' };
    case 'topshirilgan':
      return { label: 'Topshirilgan', bg: 'var(--color-brand-soft)', fg: 'var(--color-brand)' };
    case 'kechikkan':
      return { label: 'Kechikkan', bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' };
    default:
      return { label: 'Topshirilmagan', bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' };
  }
}
