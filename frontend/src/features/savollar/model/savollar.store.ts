import { create } from 'zustand';
import type { Question } from '@/entities/question/model/types';
import * as api from '@/shared/api/savollar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SavollarState {
  questions: Question[];
  status: LoadStatus;
  error: string | null;
  load: () => Promise<void>;
  add: (body: api.QuestionCreatePayload) => Promise<void>;
  update: (id: number, body: api.QuestionUpdatePayload) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

/** Текущий запрос банка, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useSavollarStore = create<SavollarState>()((set) => ({
  questions: [],
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ questions: await api.getQuestions(), status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  // Мутации: сначала сервер, затем локальная заплатка его ответом.
  add: async (body) => {
    const created = await api.createQuestion(body);
    set((s) => ({ questions: [...s.questions, created] }));
  },

  update: async (id, body) => {
    const updated = await api.updateQuestion(id, body);
    set((s) => ({ questions: s.questions.map((q) => (q.id === id ? updated : q)) }));
  },

  remove: async (id) => {
    await api.deleteQuestion(id);
    set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }));
  },
}));
