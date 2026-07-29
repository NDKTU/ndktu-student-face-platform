import { create } from 'zustand';
import type { StudentRow } from '@/entities/student/model/types';
import * as api from '@/shared/api/talabalar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface StudentsState {
  students: StudentRow[];
  status: LoadStatus;
  error: string | null;
  selectedId: number | null;

  select: (id: number | null) => void;
  load: () => Promise<void>;
}

/** Текущий запрос, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useStudentsStore = create<StudentsState>()((set) => ({
  students: [],
  status: 'idle',
  error: null,
  selectedId: null,

  select: (selectedId) => set({ selectedId }),

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ students: await api.getStudents(), status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

}));
