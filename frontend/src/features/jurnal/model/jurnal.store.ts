import { create } from 'zustand';
import * as api from '@/shared/api/jurnal';
import type { Attendance, JournalLesson, JournalRow } from '@/shared/api/jurnal';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface JurnalState {
  lessons: JournalLesson[];
  /** Журнал открытого занятия. Правки живут здесь до нажатия «Saqlash». */
  rows: JournalRow[];
  openLessonId: number | null;
  status: LoadStatus;
  error: string | null;
  /** Есть несохранённые правки: кнопка сохранения активна только тогда. */
  dirty: boolean;

  loadLessons: (courseId: number) => Promise<void>;
  openLesson: (lessonId: number) => Promise<void>;
  closeLesson: () => void;

  setAttendance: (userId: number, attendance: Attendance) => void;
  setGrade: (userId: number, grade: number | null) => void;
  setNotes: (userId: number, notes: string) => void;
  save: () => Promise<void>;

  addLesson: (body: api.JournalLessonPayload) => Promise<void>;
  removeLesson: (lessonId: number) => Promise<void>;
}

export const useJurnalStore = create<JurnalState>()((set, get) => ({
  lessons: [],
  rows: [],
  openLessonId: null,
  status: 'idle',
  error: null,
  dirty: false,

  loadLessons: async (courseId) => {
    set({ status: 'loading', error: null });
    try {
      set({ lessons: await api.getLessons(courseId), status: 'ready' });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  openLesson: async (lessonId) => {
    // Журнал грузится по требованию: занятий у курса десятки, а состав группы
    // нужен только для открытого.
    set({ openLessonId: lessonId, rows: [], dirty: false });
    set({ rows: await api.getJournal(lessonId) });
  },

  closeLesson: () => set({ openLessonId: null, rows: [], dirty: false }),

  // Правки складываются локально: отмечать посещаемость по одному студенту
  // означало бы запрос на каждый щелчок по всей группе.
  setAttendance: (userId, attendance) =>
    set((s) => ({
      rows: s.rows.map((row) => (row.userId === userId ? { ...row, attendance } : row)),
      dirty: true,
    })),

  setGrade: (userId, grade) =>
    set((s) => ({
      rows: s.rows.map((row) => (row.userId === userId ? { ...row, grade } : row)),
      dirty: true,
    })),

  setNotes: (userId, notes) =>
    set((s) => ({
      rows: s.rows.map((row) => (row.userId === userId ? { ...row, notes } : row)),
      dirty: true,
    })),

  save: async () => {
    const { openLessonId, rows } = get();
    if (openLessonId === null) return;

    // Ответ сервера кладём как есть: он вернёт и id сохранённых строк.
    set({ rows: await api.saveJournal(openLessonId, rows), dirty: false });
  },

  addLesson: async (body) => {
    const created = await api.createLesson(body);
    set((s) => ({ lessons: [created, ...s.lessons] }));
  },

  removeLesson: async (lessonId) => {
    await api.deleteLesson(lessonId);
    set((s) => ({
      lessons: s.lessons.filter((lesson) => lesson.id !== lessonId),
      // Если удалили открытое занятие — закрываем журнал, иначе он остался бы
      // висеть с чужими строками.
      ...(s.openLessonId === lessonId ? { openLessonId: null, rows: [], dirty: false } : {}),
    }));
  },
}));
