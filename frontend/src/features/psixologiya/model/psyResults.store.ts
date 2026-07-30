import { create } from 'zustand';
import * as api from '@/shared/api/psixologiya';
import type { PsyResult } from '@/shared/api/psixologiya';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export const PAGE_SIZE = 20;

interface PsyResultsState {
  results: PsyResult[];
  total: number;
  page: number;
  methodId: number | null;
  status: LoadStatus;
  error: string | null;
  /** Раскрытый результат: ответы грузятся только для него. */
  openId: number | null;
  open: PsyResult | null;

  load: () => Promise<void>;
  setMethodId: (id: number | null) => Promise<void>;
  setPage: (page: number) => Promise<void>;
  openResult: (id: number | null) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const usePsyResultsStore = create<PsyResultsState>()((set, get) => {
  async function fetchPage() {
    set({ status: 'loading', error: null });
    try {
      const { methodId, page } = get();
      const data = await api.getResults({
        methodId: methodId ?? undefined,
        page,
        limit: PAGE_SIZE,
      });
      set({ results: data.items, total: data.total, status: 'ready' });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    results: [],
    total: 0,
    page: 1,
    methodId: null,
    status: 'idle',
    error: null,
    openId: null,
    open: null,

    load: fetchPage,

    setMethodId: async (methodId) => {
      set({ methodId, page: 1, openId: null, open: null });
      await fetchPage();
    },

    setPage: async (page) => {
      set({ page, openId: null, open: null });
      await fetchPage();
    },

    openResult: async (id) => {
      if (id === null) {
        set({ openId: null, open: null });
        return;
      }
      // Список приходит без вопросов методики — без них ответы не расшифровать,
      // поэтому раскрытая строка догружается отдельно.
      set({ openId: id, open: null });
      const full = await api.getResult(id);
      // За время запроса могли раскрыть другую строку.
      if (get().openId === id) set({ open: full });
    },

    remove: async (id) => {
      await api.deleteResult(id);
      set((s) => ({
        results: s.results.filter((r) => r.id !== id),
        total: Math.max(0, s.total - 1),
        ...(s.openId === id ? { openId: null, open: null } : {}),
      }));
    },
  };
});
