import { create } from 'zustand';
import * as api from '@/shared/api/psixologiya';
import type { MethodDraft, PsyMethod, QuestionDraft } from '@/shared/api/psixologiya';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface MethodsState {
  methods: PsyMethod[];
  status: LoadStatus;
  error: string | null;

  load: () => Promise<void>;
  reload: () => Promise<void>;

  addMethod: (draft: MethodDraft) => Promise<PsyMethod>;
  editMethod: (id: number, draft: Partial<MethodDraft>) => Promise<void>;
  removeMethod: (id: number) => Promise<void>;

  addQuestion: (methodId: number, draft: QuestionDraft) => Promise<void>;
  editQuestion: (methodId: number, questionId: number, draft: QuestionDraft) => Promise<void>;
  removeQuestion: (methodId: number, questionId: number) => Promise<void>;
}

/** Текущий запрос, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

export const useMethodsStore = create<MethodsState>()((set) => {
  /** Точечно заменить методику в списке, не перезагружая весь список. */
  function patch(id: number, change: (method: PsyMethod) => PsyMethod) {
    set((s) => ({ methods: s.methods.map((m) => (m.id === id ? change(m) : m)) }));
  }

  async function fetchAll() {
    set({ status: 'loading', error: null });
    try {
      const data = await api.getMethods(1, 100);
      set({ methods: data.items, status: 'ready' });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    methods: [],
    status: 'idle',
    error: null,

    load: async () => {
      if (inFlight) return inFlight;
      inFlight = fetchAll().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    reload: fetchAll,

    addMethod: async (draft) => {
      const created = await api.createMethod(draft);
      set((s) => ({ methods: [...s.methods, created] }));
      return created;
    },

    editMethod: async (id, draft) => {
      const updated = await api.updateMethod(id, draft);
      // Ответ на PUT приходит без вопросов — оставляем те, что уже есть,
      // иначе открытый список вопросов опустел бы после правки названия.
      patch(id, (m) => ({ ...updated, questions: updated.questions.length ? updated.questions : m.questions }));
    },

    removeMethod: async (id) => {
      await api.deleteMethod(id);
      set((s) => ({ methods: s.methods.filter((m) => m.id !== id) }));
    },

    addQuestion: async (methodId, draft) => {
      const created = await api.createQuestion(methodId, draft);
      patch(methodId, (m) => ({ ...m, questions: [...m.questions, created].sort(byOrder) }));
    },

    editQuestion: async (methodId, questionId, draft) => {
      const updated = await api.updateQuestion(questionId, draft);
      patch(methodId, (m) => ({
        ...m,
        questions: m.questions.map((q) => (q.id === questionId ? updated : q)).sort(byOrder),
      }));
    },

    removeQuestion: async (methodId, questionId) => {
      await api.deleteQuestion(questionId);
      patch(methodId, (m) => ({ ...m, questions: m.questions.filter((q) => q.id !== questionId) }));
    },
  };
});

/** Следующий свободный номер вопроса: `order` задаёт и порядок, и ключ скоринга. */
export function nextOrder(method: PsyMethod | undefined): number {
  if (!method || method.questions.length === 0) return 1;
  return Math.max(...method.questions.map((q) => q.order)) + 1;
}
