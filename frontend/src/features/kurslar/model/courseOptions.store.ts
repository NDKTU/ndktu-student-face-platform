import { create } from 'zustand';
import { getFanlar } from '@/shared/api/fanlar';
import { getGroupOptions } from '@/shared/api/hemis';
import { getFacultyOptions } from '@/shared/api/reyting';
import { getTeacherOptions } from '@/shared/api/xodimlar';
import type { LoadStatus } from './courses.store';

/**
 * Справочники для формы курса: преподаватели, фаны, группы, факультеты.
 *
 * Отдельный стор, а не `useAsyncData`: те же четыре списка нужны и форме
 * создания, и форме редактирования, и запрашивать их дважды незачем.
 */

export interface OptionRow {
  id: number;
  name: string;
}

export interface GroupOption extends OptionRow {
  facultyId: number | null;
}

interface CourseOptionsState {
  subjects: OptionRow[];
  teachers: OptionRow[];
  groups: GroupOption[];
  faculties: OptionRow[];
  status: LoadStatus;
  error: string | null;
  load: () => Promise<void>;
}

/** Текущий запрос, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useCourseOptionsStore = create<CourseOptionsState>()((set) => ({
  subjects: [],
  teachers: [],
  groups: [],
  faculties: [],
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      // Каждый список падает сам за себя: право читать сотрудников отдельно
      // от права читать фаны, и 403 на одном не должен гасить всю форму.
      const [subjects, teachers, groups, faculties] = await Promise.all([
        getFanlar()
          .then((rows) => rows.map((r) => ({ id: r.id, name: r.fan })))
          .catch(() => null),
        getTeacherOptions()
          .then((rows) => rows.map((r) => ({ id: r.userId, name: r.fullName })))
          .catch(() => null),
        getGroupOptions()
          .then((rows) => rows.map((r) => ({ id: r.id, name: r.name, facultyId: r.facultyId })))
          .catch(() => null),
        getFacultyOptions()
          .then((rows) => rows.map((r) => ({ id: r.id, name: r.name })))
          .catch(() => null),
      ]);

      const allFailed = !subjects && !teachers && !groups && !faculties;
      set({
        subjects: subjects ?? [],
        teachers: teachers ?? [],
        groups: groups ?? [],
        faculties: faculties ?? [],
        status: allFailed ? 'error' : 'ready',
        error: allFailed ? 'load' : null,
      });
      inFlight = null;
    })();

    return inFlight;
  },
}));
