import { create } from 'zustand';
import type { QuizQuestion, QuizResult, TestMeta } from '@/entities/test/model/types';
import { endTest, startTest, submitAnswer, type EndQuizPayload } from '@/shared/api/testlar';

type Phase = 'idle' | 'quiz' | 'result';

interface QuizState {
  phase: Phase;
  test: TestMeta | null;
  /** Идентификатор попытки: с ним уходят и ответы, и завершение. */
  resultId: number | null;
  questions: QuizQuestion[];
  index: number;
  answers: Record<number, number>;
  remaining: number;
  totalTime: number;
  result: QuizResult | null;

  /** «face» — на время теста включается видеонаблюдение. */
  proctoring: 'face' | 'standard';
  faceWsToken: string | null;
  referenceImageUrl: string | null;

  start: (test: TestMeta, pin: string) => Promise<void>;
  answer: (optionIndex: number) => void;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  tick: () => void;
  finish: (extra?: EndQuizPayload) => Promise<void>;
  reset: () => void;
}

const IDLE = {
  phase: 'idle' as Phase,
  test: null,
  resultId: null,
  questions: [],
  index: 0,
  answers: {},
  result: null,
  proctoring: 'standard' as const,
  faceWsToken: null,
  referenceImageUrl: null,
};

export const useQuizStore = create<QuizState>()((set, get) => ({
  ...IDLE,
  remaining: 0,
  totalTime: 0,

  // PIN проверяет сервер: неверный код или закрытый тест — ошибка наружу,
  // вызывающий показывает её тостом и оставляет модалку открытой.
  start: async (test, pin) => {
    const data = await startTest(test.id, pin);
    const totalTime = data.test.davomiylik * 60;
    set({
      phase: 'quiz',
      // Карточку теста берём из списка: в ответе на старт нет ни фана, ни группы.
      test: { ...test, davomiylik: data.test.davomiylik, savollar: data.questions.length },
      resultId: data.resultId,
      questions: data.questions,
      index: 0,
      answers: {},
      remaining: totalTime,
      totalTime,
      result: null,
      proctoring: data.proctoring,
      faceWsToken: data.faceWsToken,
      referenceImageUrl: data.referenceImageUrl,
    });
  },

  /**
   * Ответ уходит на сервер сразу, а не копится до конца: если студент закроет
   * вкладку или кончится время, уже отвеченное останется засчитанным.
   * Локально помечаем выбор до ответа сервера — иначе вариант «мигал» бы.
   */
  answer: (optionIndex) => {
    const { index, questions, resultId, answers } = get();
    const question = questions[index];
    if (!question) return;

    const previous = answers[index];
    set({ answers: { ...answers, [index]: optionIndex } });

    if (resultId === null || question.id === undefined) return;
    const text = question.options[optionIndex]?.text;
    if (text === undefined) return;

    void submitAnswer(resultId, question.id, text).catch(() => {
      // Не приняли — возвращаем прежний выбор, иначе экран показывал бы
      // ответ, которого на сервере нет.
      set((s) => {
        const next = { ...s.answers };
        if (previous === undefined) delete next[index];
        else next[index] = previous;
        return { answers: next };
      });
    });
  },

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

  /**
   * Завершение попытки. Ответы уже на сервере, здесь только подведение итога;
   * неотвеченные вопросы он засчитает как ошибки сам.
   */
  finish: async (extra) => {
    const { test, resultId, totalTime, remaining, phase } = get();
    if (!test || resultId === null || phase !== 'quiz') return;

    // Сразу уходим из фазы теста: таймер тикает раз в секунду и без этого
    // успел бы вызвать завершение второй раз.
    set({ phase: 'result', remaining: 0 });
    const result = await endTest(test.id, resultId, totalTime - remaining, extra);
    set({ result });
  },

  reset: () => set({ ...IDLE }),
}));
