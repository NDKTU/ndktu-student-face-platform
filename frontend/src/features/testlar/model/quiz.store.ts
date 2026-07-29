import { create } from 'zustand';
import type { QuizQuestion, QuizResult, TestMeta } from '@/entities/test/model/types';
import { startTest, submitTest } from '@/shared/api/testlar';

type Phase = 'idle' | 'quiz' | 'result';

interface QuizState {
  phase: Phase;
  test: TestMeta | null;
  questions: QuizQuestion[];
  index: number;
  answers: Record<number, number>;
  remaining: number;
  totalTime: number;
  result: QuizResult | null;

  start: (test: TestMeta, pin: string) => Promise<void>;
  answer: (optionIndex: number) => void;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  tick: () => void;
  finish: () => Promise<void>;
  reset: () => void;
}

export const useQuizStore = create<QuizState>()((set, get) => ({
  phase: 'idle',
  test: null,
  questions: [],
  index: 0,
  answers: {},
  remaining: 0,
  totalTime: 0,
  result: null,

  // PIN проверяет сервер: неверный код или закрытый тест — ошибка наружу,
  // вызывающий показывает её тостом и оставляет модалку открытой.
  start: async (test, pin) => {
    const data = await startTest(test.id, pin);
    const totalTime = data.test.davomiylik * 60;
    set({
      phase: 'quiz',
      test: data.test,
      questions: data.questions,
      index: 0,
      answers: {},
      remaining: totalTime,
      totalTime,
      result: null,
    });
  },

  answer: (optionIndex) =>
    set((s) => ({ answers: { ...s.answers, [s.index]: optionIndex } })),

  goTo: (index) => set({ index }),
  next: () => set((s) => ({ index: Math.min(s.index + 1, s.questions.length - 1) })),
  prev: () => set((s) => ({ index: Math.max(s.index - 1, 0) })),

  // Тик таймера: при достижении нуля тест сдаётся автоматически.
  tick: () => {
    const { remaining, phase } = get();
    if (phase !== 'quiz') return;
    if (remaining <= 1) {
      void get().finish();
    } else {
      set({ remaining: remaining - 1 });
    }
  },

  // Балл считает сервер — у клиента правильных ответов больше нет.
  finish: async () => {
    const { test, answers, totalTime, remaining } = get();
    if (!test) return;

    // Имя сдающего сервер берёт из токена — клиент его больше не передаёт.
    const result = await submitTest(test.id, answers, totalTime - remaining);
    set({ phase: 'result', remaining: 0, result });
  },

  reset: () =>
    set({ phase: 'idle', test: null, questions: [], index: 0, answers: {}, result: null }),
}));
