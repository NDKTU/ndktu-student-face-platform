import type { EmployeeStatus } from '@/entities/employee/model/types';

/** Цвет бейджа статуса сотрудника. Перенесено из holCol() прототипа. */
export function employeeStatusTone(status: EmployeeStatus) {
  if (status === 'Faol') return { bg: 'var(--color-success-tint)', fg: 'var(--color-success)' };
  if (status === 'Bloklangan') return { bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' };
  return { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' };
}
