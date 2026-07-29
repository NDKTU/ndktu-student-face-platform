import type { SubmissionStatus, TaskState } from '@/entities/task/model/types';

/** Цвет чипа сводного статуса задания. */
export const STATE_TONE: Record<TaskState, { bg: string; fg: string }> = {
  baholangan: { bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
  kechikkan: { bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' },
  tekshirilmoqda: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
};

/** Цвет чипа статуса сдачи студента. */
export const SUB_TONE: Record<SubmissionStatus, { bg: string; fg: string }> = {
  baholangan: { bg: 'var(--color-success-tint)', fg: 'var(--color-success)' },
  topshirilgan: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand)' },
  topshirilmagan: { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' },
};
