import { create } from 'zustand';
import type { TaskDetail, TaskRow } from '@/entities/task/model/types';
import * as api from '@/shared/api/vazifalar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Данные формы сдачи (одна ссылка и одно имя файла — как в форме). */
export interface SubmitDraft {
  file: string;
  text: string;
  link: string;
}

interface TasksState {
  tasks: TaskRow[];
  byId: Record<number, TaskDetail>;
  status: LoadStatus;
  error: string | null;

  /** withMine — подтянуть свою сдачу по каждому заданию (экран студента). */
  load: (withMine?: boolean) => Promise<void>;
  loadTask: (taskId: number) => Promise<void>;
  grade: (taskId: number, submissionId: number, ball: number, feedback: string) => Promise<void>;
  submit: (taskId: number, draft: SubmitDraft) => Promise<void>;
}

/** Текущий запрос списка, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useTasksStore = create<TasksState>()((set, get) => ({
  tasks: [],
  byId: {},
  status: 'idle',
  error: null,

  load: async (withMine = false) => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        // Что видно этой роли, решает сервер. А вот свою сдачу он в список
        // не кладёт — её добираем отдельно и только на экране студента.
        const tasks = withMine ? await api.getStudentTasks() : await api.getTasks();
        set({ tasks, status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  loadTask: async (taskId) => {
    const task = await api.getTask(taskId);
    set((s) => ({ byId: { ...s.byId, [taskId]: task } }));
  },

  grade: async (taskId, submissionId, ball, feedback) => {
    // Бэкенд адресует сдачу парой (задание, пользователь) — id самой сдачи он
    // не принимает, поэтому автора находим в уже загруженном задании.
    const submission = get().byId[taskId]?.subs.find((x) => x.id === submissionId);
    if (!submission) return;

    const updated = await api.gradeSubmission(taskId, submission.userId, ball, feedback);

    set((s) => {
      const task = s.byId[taskId];
      const subs = task?.subs.map((x) => (x.id === submissionId ? updated : x)) ?? [];
      const graded = subs.filter((x) => x.status === 'baholangan').length;
      const submitted = subs.filter((x) => x.status !== 'topshirilmagan').length;

      return {
        byId: task ? { ...s.byId, [taskId]: { ...task, subs } } : s.byId,
        // Счётчики в списке пересчитываем локально: перезапрашивать весь
        // список ради одной оценки не нужно.
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, graded, submitted } : t)),
      };
    });
  },

  submit: async (taskId, draft) => {
    const created = await api.submitWork(taskId, {
      text: draft.text.trim(),
      links: draft.link.trim() ? [draft.link.trim()] : [],
      files: draft.file.trim() ? [{ name: draft.file.trim(), type: 'pdf' }] : [],
    });

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              mySub: created,
              submitted: t.mySub ? t.submitted : t.submitted + 1,
              graded: t.mySub?.status === 'baholangan' ? t.graded - 1 : t.graded,
            }
          : t,
      ),
    }));
  },
}));
