import { create } from 'zustand';
import * as api from '@/shared/api/reyting';
import type { FacultyRank, KafedraRank, TeacherRank } from '@/shared/api/reyting';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Какой из трёх рейтингов открыт. */
export type RankingTab = 'oqituvchilar' | 'fakultetlar' | 'kafedralar';

export const PAGE_SIZE = 20;

interface TeacherFilters {
  facultyId: number | null;
  kafedraId: number | null;
  search: string;
}

interface RankingSlice<T> {
  items: T[];
  total: number;
  page: number;
  status: LoadStatus;
  error: string | null;
}

interface ReytingState {
  tab: RankingTab;
  oqituvchilar: RankingSlice<TeacherRank>;
  fakultetlar: RankingSlice<FacultyRank>;
  kafedralar: RankingSlice<KafedraRank>;
  filters: TeacherFilters;

  setTab: (tab: RankingTab) => void;
  /** Меняет фильтр и сразу перезагружает: страница сбрасывается на первую. */
  setFilter: <K extends keyof TeacherFilters>(key: K, value: TeacherFilters[K]) => Promise<void>;
  clearFilters: () => Promise<void>;
  setPage: (page: number) => Promise<void>;
  load: (tab?: RankingTab) => Promise<void>;
}

const emptySlice = <T,>(): RankingSlice<T> => ({
  items: [],
  total: 0,
  page: 1,
  status: 'idle',
  error: null,
});

export const useReytingStore = create<ReytingState>()((set, get) => {
  /** Один загрузчик на все три вкладки: отличается только запрос. */
  async function fetchTab(tab: RankingTab) {
    const slice = get()[tab];
    set({ [tab]: { ...slice, status: 'loading', error: null } } as Partial<ReytingState>);

    try {
      const { filters } = get();
      const page = get()[tab].page;
      const data =
        tab === 'oqituvchilar'
          ? await api.getTeacherRanking({
              facultyId: filters.facultyId ?? undefined,
              kafedraId: filters.kafedraId ?? undefined,
              search: filters.search.trim() || undefined,
              page,
              limit: PAGE_SIZE,
            })
          : tab === 'fakultetlar'
            ? await api.getFacultyRanking(page, PAGE_SIZE)
            : await api.getKafedraRanking(page, PAGE_SIZE);

      set({
        [tab]: { items: data.items, total: data.total, page, status: 'ready', error: null },
      } as Partial<ReytingState>);
    } catch (e) {
      set({
        [tab]: {
          ...get()[tab],
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        },
      } as Partial<ReytingState>);
    }
  }

  return {
    tab: 'oqituvchilar',
    oqituvchilar: emptySlice<TeacherRank>(),
    fakultetlar: emptySlice<FacultyRank>(),
    kafedralar: emptySlice<KafedraRank>(),
    filters: { facultyId: null, kafedraId: null, search: '' },

    setTab: (tab) => set({ tab }),

    setFilter: async (key, value) => {
      const filters = { ...get().filters, [key]: value };
      // Сменили факультет — прежняя кафедра могла принадлежать другому.
      if (key === 'facultyId') filters.kafedraId = null;

      set({
        filters,
        oqituvchilar: { ...get().oqituvchilar, page: 1 },
      });
      await fetchTab('oqituvchilar');
    },

    clearFilters: async () => {
      set({
        filters: { facultyId: null, kafedraId: null, search: '' },
        oqituvchilar: { ...get().oqituvchilar, page: 1 },
      });
      await fetchTab('oqituvchilar');
    },

    setPage: async (page) => {
      const tab = get().tab;
      set({ [tab]: { ...get()[tab], page } } as Partial<ReytingState>);
      await fetchTab(tab);
    },

    load: async (tab) => {
      await fetchTab(tab ?? get().tab);
    },
  };
});
