import { create } from 'zustand';
import type { AdminCourse, Course, Lesson } from '@/entities/course/model/types';
import * as api from '@/shared/api/kurslar';

/** Черновик темы. */
export interface TopicDraft {
  name: string;
  /** Позиция (1-based) — куда вставить/переместить тему. */
  order: string;
}

/**
 * Черновик материала. Домашнего задания здесь нет: на бэкенде задания привязаны
 * к курсу отдельной таблицей, и ведёт их раздел «Vazifalar».
 */
export interface LessonDraft {
  title: string;
  videoType: Lesson['videoType'];
  videoSrc: string;
  dur: string;
  desc: string;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CoursesState {
  list: AdminCourse[];
  byId: Record<number, Course>;
  status: LoadStatus;
  error: string | null;

  load: () => Promise<void>;
  loadCourse: (courseId: number) => Promise<void>;

  addTopic: (courseId: number, draft: TopicDraft) => Promise<void>;
  editTopic: (courseId: number, topicId: number, draft: TopicDraft) => Promise<void>;
  removeTopic: (courseId: number, topicId: number) => Promise<void>;
  addLesson: (courseId: number, topicId: number, draft: LessonDraft) => Promise<void>;
  editLesson: (
    courseId: number,
    topicId: number,
    lessonId: number,
    draft: LessonDraft,
  ) => Promise<void>;
  removeLesson: (courseId: number, topicId: number, lessonId: number) => Promise<void>;
  reorderTopics: (courseId: number, fromId: number, toId: number) => Promise<void>;
  reorderLessons: (
    courseId: number,
    topicId: number,
    fromId: number,
    toId: number,
  ) => Promise<void>;
  setCompleted: (courseId: number, lessonId: number, completed: boolean) => Promise<void>;
}

/** Текущий запрос списка, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useCoursesStore = create<CoursesState>()((set, get) => ({
  list: [],
  byId: {},
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ list: await api.getCourses(), status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  loadCourse: async (courseId) => {
    const course = await api.getCourse(courseId);
    set((s) => ({ byId: { ...s.byId, [courseId]: course } }));
  },

  // Мутации: сервер применяет изменение и пересчитывает номера/порядок,
  // после чего курс перечитывается — так клиенту не нужно дублировать эту логику.
  addTopic: async (courseId, draft) => {
    await api.createTopic(courseId, draft);
    await refresh(set, courseId);
  },

  editTopic: async (courseId, topicId, draft) => {
    await api.updateTopic(topicId, draft);
    await refresh(set, courseId);
  },

  removeTopic: async (courseId, topicId) => {
    await api.deleteTopic(topicId);
    await refresh(set, courseId);
  },

  addLesson: async (courseId, topicId, draft) => {
    await api.createLesson(topicId, draft);
    await refresh(set, courseId);
  },

  editLesson: async (courseId, _topicId, lessonId, draft) => {
    await api.updateLesson(lessonId, draft);
    await refresh(set, courseId);
  },

  removeLesson: async (courseId, _topicId, lessonId) => {
    await api.deleteLesson(lessonId);
    await refresh(set, courseId);
  },

  // Drag-and-drop даёт пару «что» и «куда»; серверу уходит готовый порядок.
  reorderTopics: async (courseId, fromId, toId) => {
    const course = get().byId[courseId];
    if (!course || fromId === toId) return;

    const order = move(
      course.mavzular.map((m) => m.id),
      fromId,
      toId,
    );
    if (!order) return;

    await api.reorderTopics(order);
    await refresh(set, courseId);
  },

  reorderLessons: async (courseId, topicId, fromId, toId) => {
    const topic = get().byId[courseId]?.mavzular.find((m) => m.id === topicId);
    if (!topic || fromId === toId) return;

    const order = move(
      topic.darslar.map((d) => d.id),
      fromId,
      toId,
    );
    if (!order) return;

    await api.reorderMaterials(order);
    await refresh(set, courseId);
  },

  /** Отметка «прошёл материал». Своя, а не курса — поэтому только перечитываем. */
  setCompleted: async (courseId, lessonId, completed) => {
    await api.setLessonCompleted(lessonId, completed);
    await refresh(set, courseId);
  },
}));

/** Перечитывает курс и обновляет счётчики в списке. */
async function refresh(
  set: (fn: (s: CoursesState) => Partial<CoursesState>) => void,
  courseId: number,
): Promise<void> {
  const course = await api.getCourse(courseId);

  set((s) => ({
    byId: { ...s.byId, [courseId]: course },
    list: s.list.map((c) =>
      c.id === courseId
        ? { ...c, mavzular: course.mavzular.length, darslar: course.total }
        : c,
    ),
  }));
}

/** Переставляет элемент fromId на позицию toId. */
function move(ids: number[], fromId: number, toId: number): number[] | null {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0) return null;

  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
