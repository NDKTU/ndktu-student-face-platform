import type { StudentTask, TaskRow, TaskStatus } from '../model/types';

export type TaskState = 'baholangan' | 'kechikkan' | 'tekshirilmoqda';

/** «Сейчас» прототипа — от него считается просрочка во всех модулях. */
const NOW = new Date(2026, 6, 18);

export function isOverdue(deadline: string): boolean {
  const [d, m, y] = deadline.split('.').map(Number);
  if (!d || !m || !y) return false;
  return new Date(y, m - 1, d) < NOW;
}

/** Состояние задания для админ-списка — по счётчикам, которые считает сервер. */
export function taskState(task: Pick<TaskRow, 'submitted' | 'graded' | 'deadline'>): TaskState {
  if (task.submitted > 0 && task.graded >= task.submitted) return 'baholangan';
  return isOverdue(task.deadline) ? 'kechikkan' : 'tekshirilmoqda';
}

/** Статус задания глазами студента: из его собственной сдачи и срока. */
export function studentStatus(task: TaskRow): TaskStatus {
  if (task.mySub?.status === 'baholangan') return 'baholangan';
  if (task.mySub?.status === 'topshirilgan') return 'topshirilgan';
  return isOverdue(task.deadline) ? 'kechikkan' : 'topshirilmagan';
}

/**
 * Строка списка глазами студента: своё состояние берётся из собственной сдачи.
 * Экран написан под StudentTask, поэтому адаптируем, а не переписываем его.
 */
export function toStudentTask(row: TaskRow): StudentTask {
  const sub = row.mySub;

  return {
    id: row.id,
    fan: row.fan,
    title: row.title,
    desc: row.desc,
    deadline: row.deadline,
    status: studentStatus(row),
    ball: sub?.ball ?? null,
    feedback: sub?.feedback ?? '',
    gradedAt: sub?.gradedAt ?? null,
    sub:
      sub && sub.submittedAt
        ? { files: sub.files, text: sub.text, links: sub.links, submittedAt: sub.submittedAt }
        : null,
  };
}
