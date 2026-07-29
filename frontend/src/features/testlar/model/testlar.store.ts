import { create } from 'zustand';
import type { TestMeta } from '@/entities/test/model/types';
import * as api from '@/shared/api/testlar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TestlarState {
  tests: TestMeta[];
  status: LoadStatus;
  error: string | null;
  load: () => Promise<void>;
  add: (body: api.TestCreatePayload) => Promise<TestMeta>;
  update: (id: number, body: api.TestUpdatePayload) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

/** Текущий запрос списка, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useTestlarStore = create<TestlarState>()((set) => ({
  tests: [],
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ tests: await api.getTests(), status: 'ready' });
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
    const created = await api.createTest(body);
    // Новый тест — наверх списка: преподаватель должен сразу его увидеть.
    set((s) => ({ tests: [created, ...s.tests] }));
    return created;
  },

  update: async (id, body) => {
    const updated = await api.updateTest(id, body);
    set((s) => ({ tests: s.tests.map((t) => (t.id === id ? updated : t)) }));
  },

  remove: async (id) => {
    await api.deleteTest(id);
    set((s) => ({ tests: s.tests.filter((t) => t.id !== id) }));
  },
}));
