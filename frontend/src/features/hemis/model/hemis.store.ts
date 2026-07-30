import { create } from 'zustand';
import * as api from '@/shared/api/hemis';
import type { HemisPreview } from '@/shared/api/hemis';

/**
 * Шаг мастера импорта.
 *
 * `credentials` — форма входа в HEMIS, `preview` — сверка с нашей базой,
 * `done` — результат. Возврата с `done` нет: импорт повторяют с начала, чтобы
 * не отправить его дважды по одному подтверждению.
 */
export type HemisStep = 'credentials' | 'preview' | 'done';

interface HemisState {
  step: HemisStep;
  login: string;
  /**
   * Пароль HEMIS. Живёт только в памяти вкладки: в URL он попал бы в историю
   * браузера и в логи прокси, в localStorage — пережил бы сеанс.
   */
  password: string;
  preview: HemisPreview | null;
  /** Ручное переопределение: null — брать факультет и группу из HEMIS. */
  facultyId: number | null;
  groupId: number | null;
  busy: boolean;
  error: string | null;
  result: string | null;

  setCredentials: (login: string, password: string) => void;
  setFacultyId: (id: number | null) => void;
  setGroupId: (id: number | null) => void;
  loadPreview: () => Promise<void>;
  sync: () => Promise<void>;
  reset: () => void;
}

const initial = {
  step: 'credentials' as HemisStep,
  login: '',
  password: '',
  preview: null,
  facultyId: null,
  groupId: null,
  busy: false,
  error: null,
  result: null,
};

export const useHemisStore = create<HemisState>()((set, get) => ({
  ...initial,

  setCredentials: (login, password) => set({ login, password, error: null }),
  setFacultyId: (facultyId) =>
    // Сменили факультет — прежняя группа могла принадлежать другому.
    set({ facultyId, groupId: null }),
  setGroupId: (groupId) => set({ groupId }),

  loadPreview: async () => {
    const { login, password } = get();
    set({ busy: true, error: null });
    try {
      const preview = await api.previewHemis({ login, password });
      set({
        preview,
        // Совпадения из нашей базы подставляем сразу: чаще всего их и надо
        // оставить, а расхождение видно рядом в сверке.
        facultyId: preview.facultyId,
        groupId: preview.groupId,
        step: 'preview',
        busy: false,
      });
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  sync: async () => {
    const { login, password, facultyId, groupId } = get();
    set({ busy: true, error: null });
    try {
      const result = await api.syncHemis({ login, password }, { facultyId, groupId });
      // Пароль стираем сразу после импорта: дальше он не нужен.
      set({ step: 'done', busy: false, password: '', result: result.message });
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  reset: () => set({ ...initial }),
}));
