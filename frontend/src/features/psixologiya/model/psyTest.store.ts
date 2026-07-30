import { create } from 'zustand';
import * as api from '@/shared/api/psixologiya';
import type { PsyMethod, PsyResult } from '@/shared/api/psixologiya';

/** Что видит проходящий: вопросы по одному, затем результат. */
export type TestPhase = 'loading' | 'running' | 'result' | 'error';

/** Ответ на один вопрос. `number[]` — у `multi_choice`, там выбор множественный. */
export type AnswerValue = boolean | number | string | number[] | null;

interface PsyTestState {
  phase: TestPhase;
  method: PsyMethod | null;
  index: number;
  answers: Record<number, AnswerValue>;
  result: PsyResult | null;
  error: string | null;
  submitting: boolean;

  start: (methodId: number) => Promise<void>;
  answer: (questionId: number, value: AnswerValue) => void;
  /** Переключает вариант в множественном выборе. */
  toggle: (questionId: number, value: number) => void;
  go: (index: number) => void;
  next: () => void;
  prev: () => void;
  finish: () => Promise<void>;
  reset: () => void;
}

const initial = {
  phase: 'loading' as TestPhase,
  method: null,
  index: 0,
  answers: {} as Record<number, AnswerValue>,
  result: null,
  error: null,
  submitting: false,
};

/** Пустой ответ: `0` и `false` — валидные ответы, поэтому проверяем именно null. */
export function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export const usePsyTestStore = create<PsyTestState>()((set, get) => ({
  ...initial,

  start: async (methodId) => {
    set({ ...initial });
    try {
      const method = await api.getMethod(methodId);
      set({ method, phase: 'running' });
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  answer: (questionId, value) =>
    set((s) => ({ answers: { ...s.answers, [questionId]: value } })),

  toggle: (questionId, value) =>
    set((s) => {
      const current = s.answers[questionId];
      const list = Array.isArray(current) ? current : [];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { answers: { ...s.answers, [questionId]: next } };
    }),

  go: (index) => {
    const total = get().method?.questions.length ?? 0;
    if (index < 0 || index >= total) return;
    set({ index });
  },

  next: () => get().go(get().index + 1),
  prev: () => get().go(get().index - 1),

  finish: async () => {
    const { method, answers } = get();
    if (!method || get().submitting) return;

    set({ submitting: true, error: null });
    try {
      const payload = method.questions
        .filter((q) => isAnswered(answers[q.id] ?? null))
        .map((q) => ({ questionId: q.id, value: answers[q.id] }));

      set({ result: await api.submitTest(method.id, payload), phase: 'result', submitting: false });
    } catch (e) {
      // Остаёмся на вопросах: ответы никуда не делись, отправку можно повторить.
      set({ submitting: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  reset: () => set({ ...initial }),
}));
