import { create } from 'zustand';
import type { Employee, EmployeeDraft } from '@/entities/employee/model/types';
import * as api from '@/shared/api/xodimlar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface EmployeesState {
  employees: Employee[];
  status: LoadStatus;
  error: string | null;
  selectedId: number | null;

  select: (id: number | null) => void;
  load: () => Promise<void>;
  add: (draft: EmployeeDraft) => Promise<void>;
  update: (id: number, draft: EmployeeDraft) => Promise<void>;
}

/** Текущий запрос, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useEmployeesStore = create<EmployeesState>()((set) => ({
  employees: [],
  status: 'idle',
  error: null,
  selectedId: null,

  select: (selectedId) => set({ selectedId }),

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ employees: await api.getEmployees(), status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  add: async (draft) => {
    const created = await api.createEmployee(draft);
    set((s) => ({ employees: [...s.employees, created] }));
  },

  update: async (id, draft) => {
    const updated = await api.updateEmployee(id, draft);
    set((s) => ({ employees: s.employees.map((e) => (e.id === id ? updated : e)) }));
  },
}));

/** Подразделения для селекта формы — из того, что уже есть в справочнике. */
export function unitOptions(employees: Employee[]): string[] {
  return [...new Set(employees.map((e) => e.unit).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
