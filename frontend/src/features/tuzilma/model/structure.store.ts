import { create } from 'zustand';
import type {
  Department,
  EduForm,
  Faculty,
  Group,
  RejaRow,
  Speciality,
} from '@/entities/university/model/types';
import * as api from '@/shared/api/tuzilma';

/** Один шаг drill-down: id и подпись для хлебных крошек. */
export interface DrillStep {
  id: number;
  name: string;
}

export type EntityDraft = Partial<{
  name: string;
  dekan: string;
  mudir: string;
  kod: string;
  shakl: EduForm;
  kurs: string;
  sardor: string;
}>;

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface StructureState {
  faculties: Faculty[];
  status: LoadStatus;
  error: string | null;
  drill: DrillStep[];
  selectedStudentId: number | null;
  /**
   * Учебный год плана по id специальности. В БД такого поля пока нет —
   * значение живёт только в сессии и переедет вместе с модулем «O'quv reja».
   */
  rejaYears: Record<number, string>;

  load: () => Promise<void>;
  /**
   * Подгружает состав группы: дерево несёт только их число. Вызывается при
   * заходе в группу, результат подкладывается в само дерево, чтобы карточка
   * и профиль студента читали его как раньше.
   */
  loadGroupStudents: (groupId: number) => Promise<void>;
  /**
   * Подгружает строки учебного плана: дерево несёт только их число.
   * Вызывается при выборе специальности на экране «O'quv reja».
   */
  loadReja: (specialityId: number) => Promise<void>;
  drillInto: (step: DrillStep) => void;
  popTo: (depth: number) => void;
  selectStudent: (id: number | null) => void;

  addEntity: (level: number, draft: EntityDraft) => Promise<void>;
  updateEntity: (level: number, id: number, draft: EntityDraft) => Promise<void>;
  removeEntity: (level: number, id: number) => Promise<void>;

  /** Пересоздаёт план специальности пустым (семестры 1–8 остаются, строк нет). */
  createRejaPlan: (specialityId: number, year: string, shakl: EduForm) => Promise<void>;
  addRejaRow: (specialityId: number, row: RejaRow) => Promise<void>;
  /** index — позиция строки в reja специальности, а не в срезе по семестру. */
  updateRejaRow: (specialityId: number, index: number, row: RejaRow) => Promise<void>;
  removeRejaRow: (specialityId: number, index: number) => Promise<void>;
  /** Очищает весь план специальности, сохраняя год и форму обучения. */
  clearRejaPlan: (specialityId: number) => Promise<void>;
  clearRejaSemester: (specialityId: number, semestr: number) => Promise<void>;
}

/** Текущий запрос дерева, чтобы параллельные вызовы load() не дублировали его. */
let inFlight: Promise<void> | null = null;

export const useStructureStore = create<StructureState>()((set, get) => ({
  faculties: [],
  status: 'idle',
  error: null,
  drill: [],
  selectedStudentId: null,
  rejaYears: {},

  load: async () => {
    // Потребителей дерева несколько, а в dev-режиме эффекты вызываются дважды:
    // без этого стража на старте уходило бы два одинаковых запроса.
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        const faculties = await api.getTree();
        // Учебный год плана хранится на мутахассислике — восстанавливаем карту,
        // иначе после перезагрузки год в форме «Yangi o'quv reja» сбрасывался бы.
        set({ faculties, status: 'ready', rejaYears: collectRejaYears(faculties) });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  loadGroupStudents: async (groupId) => {
    // Повторно не ходим: состав группы за время просмотра не меняется, а
    // возврат по хлебным крошкам иначе перезапрашивал бы его каждый раз.
    if (findGroup(get().faculties, groupId)?.students) return;

    const students = await api.getGroupStudents(groupId);
    set((s) => ({
      faculties: mapGroup(s.faculties, groupId, (group) => ({ ...group, students })),
    }));
  },

  loadReja: async (specialityId) => {
    const rows = await api.getReja(specialityId);
    set((s) => ({
      faculties: mapSpeciality(s.faculties, specialityId, (sp) => ({
        ...sp,
        reja: rows,
        curriculum_count: rows.length,
      })),
    }));
  },

  drillInto: (step) => set((s) => ({ drill: [...s.drill, step], selectedStudentId: null })),

  popTo: (depth) => set((s) => ({ drill: s.drill.slice(0, depth), selectedStudentId: null })),

  selectStudent: (selectedStudentId) => set({ selectedStudentId }),

  // Мутации: сначала сервер, потом локальная заплатка его ответом. Так порядок
  // и id совпадают с базой, а полное дерево не перекачивается на каждую правку.
  addEntity: async (level, draft) => {
    const { drill } = get();
    const created = await createOnServer(level, drill, draft);
    set((s) => ({
      faculties: mapContainer(s.faculties, s.drill, level, (items) => [...items, created]),
    }));
  },

  updateEntity: async (level, id, draft) => {
    const updated = await updateOnServer(level, id, draft);
    set((s) => ({
      faculties: mapContainer(s.faculties, s.drill, level, (items) =>
        // Сервер возвращает запись без вложенных коллекций, поэтому берём
        // их из текущего состояния — иначе поддерево «схлопнулось» бы.
        items.map((item) => (item.id === id ? mergeEntity(item, updated) : item)),
      ),
    }));
  },

  removeEntity: async (level, id) => {
    await removeOnServer(level, id);
    set((s) => ({
      faculties: mapContainer(s.faculties, s.drill, level, (items) =>
        items.filter((item) => item.id !== id),
      ),
      // Если удалили запись, внутрь которой мы провалились, — выходим наверх.
      drill: s.drill.some((step) => step.id === id)
        ? s.drill.slice(0, s.drill.findIndex((step) => step.id === id))
        : s.drill,
    }));
  },

  createRejaPlan: async (specialityId, year, shakl) => {
    await api.updateSpeciality(specialityId, { shakl, reja_yil: year });
    await api.clearReja(specialityId);
    set((s) => ({
      rejaYears: { ...s.rejaYears, [specialityId]: year },
      faculties: mapSpeciality(s.faculties, specialityId, (sp) => ({
        ...sp,
        shakl,
        reja_yil: year,
        reja: [],
        curriculum_count: 0,
      })),
    }));
  },

  addRejaRow: async (specialityId, row) => {
    const created = await api.createRejaRow(specialityId, row);
    set((s) => ({
      faculties: mapSpeciality(s.faculties, specialityId, (sp) => ({
        ...sp,
        reja: [...sp.reja, created],
        curriculum_count: sp.curriculum_count + 1,
      })),
    }));
  },

  updateRejaRow: async (specialityId, index, row) => {
    const current = findReja(get().faculties, specialityId, index);
    if (!current?.id) return;
    const updated = await api.updateRejaRow(current.id, row);
    set((s) => ({
      faculties: mapSpeciality(s.faculties, specialityId, (sp) => ({
        ...sp,
        reja: sp.reja.map((r, i) => (i === index ? updated : r)),
      })),
    }));
  },

  removeRejaRow: async (specialityId, index) => {
    const current = findReja(get().faculties, specialityId, index);
    if (!current?.id) return;
    await api.deleteRejaRow(current.id);
    set((s) => ({
      faculties: mapSpeciality(s.faculties, specialityId, (sp) => ({
        ...sp,
        reja: sp.reja.filter((_, i) => i !== index),
        curriculum_count: Math.max(0, sp.curriculum_count - 1),
      })),
    }));
  },

  clearRejaPlan: async (specialityId) => {
    await api.clearReja(specialityId);
    set((s) => ({
      faculties: mapSpeciality(s.faculties, specialityId, (sp) => ({
        ...sp,
        reja: [],
        curriculum_count: 0,
      })),
    }));
  },

  clearRejaSemester: async (specialityId, semestr) => {
    await api.clearReja(specialityId, semestr);
    set((s) => ({
      faculties: mapSpeciality(s.faculties, specialityId, (sp) => ({
        ...sp,
        reja: sp.reja.filter((r) => r.semestr !== semestr),
        curriculum_count: sp.reja.filter((r) => r.semestr !== semestr).length,
      })),
    }));
  },
}));

type Entity = Faculty | Department | Speciality | Group;

/** Родитель создаваемой записи — это предыдущий шаг drill-пути. */
function createOnServer(level: number, drill: DrillStep[], draft: EntityDraft): Promise<Entity> {
  const name = draft.name?.trim();

  switch (level) {
    case 0:
      return api.createFaculty({ name, dekan: draft.dekan?.trim() });
    case 1:
      return api.createDepartment(drill[0]!.id, { name, mudir: draft.mudir?.trim() });
    case 2:
      return api.createSpeciality(drill[1]!.id, {
        name,
        kod: draft.kod?.trim(),
        shakl: draft.shakl,
      });
    default:
      // faculty_id у группы обязателен на бэкенде. В форме его не спрашивают:
      // это самый первый шаг drill-пути, по которому мы сюда и пришли.
      return api.createGroup(drill[2]!.id, drill[0]!.id, {
        name,
        kurs: draft.kurs ? Number(draft.kurs) : undefined,
      });
  }
}

function updateOnServer(
  level: number,
  id: number,
  draft: EntityDraft,
): Promise<Partial<Entity>> {
  const name = draft.name?.trim();

  switch (level) {
    case 0:
      return api.updateFaculty(id, { name, dekan: draft.dekan?.trim() });
    case 1:
      return api.updateDepartment(id, { name, mudir: draft.mudir?.trim() });
    case 2:
      return api.updateSpeciality(id, { name, kod: draft.kod?.trim(), shakl: draft.shakl });
    default:
      return api.updateGroup(id, {
        name,
        kurs: draft.kurs ? Number(draft.kurs) : undefined,
      });
  }
}

function removeOnServer(level: number, id: number): Promise<void> {
  switch (level) {
    case 0:
      return api.deleteFaculty(id);
    case 1:
      return api.deleteDepartment(id);
    case 2:
      return api.deleteSpeciality(id);
    default:
      return api.deleteGroup(id);
  }
}

/** Ищет группу по id во всём дереве — drill-путь для этого знать не обязательно. */
function findGroup(faculties: Faculty[], groupId: number): Group | undefined {
  for (const faculty of faculties) {
    for (const department of faculty.kafedralar) {
      for (const speciality of department.mutaxassisliklar) {
        const group = speciality.guruhlar.find((g) => g.id === groupId);
        if (group) return group;
      }
    }
  }
  return undefined;
}

/** Обновляет группу по id, не завися от drill-пути. */
function mapGroup(
  faculties: Faculty[],
  groupId: number,
  update: (group: Group) => Group,
): Faculty[] {
  return faculties.map((faculty) => ({
    ...faculty,
    kafedralar: faculty.kafedralar.map((department) => ({
      ...department,
      mutaxassisliklar: department.mutaxassisliklar.map((speciality) => ({
        ...speciality,
        guruhlar: speciality.guruhlar.map((group) =>
          group.id === groupId ? update(group) : group,
        ),
      })),
    })),
  }));
}

/** Собирает {specialityId: reja_yil} со всего дерева для восстановления после загрузки. */
function collectRejaYears(faculties: Faculty[]): Record<number, string> {
  const years: Record<number, string> = {};
  for (const faculty of faculties) {
    for (const department of faculty.kafedralar) {
      for (const speciality of department.mutaxassisliklar) {
        if (speciality.reja_yil) years[speciality.id] = speciality.reja_yil;
      }
    }
  }
  return years;
}

/** Скалярные поля берём от сервера, вложенные коллекции — из текущего состояния. */
function mergeEntity(current: Entity, updated: Partial<Entity>): Entity {
  const nested = Object.fromEntries(
    Object.entries(current).filter(([, value]) => Array.isArray(value)),
  );
  return { ...current, ...updated, ...nested } as Entity;
}

function findReja(
  faculties: Faculty[],
  specialityId: number,
  index: number,
): RejaRow | undefined {
  for (const faculty of faculties) {
    for (const department of faculty.kafedralar) {
      for (const speciality of department.mutaxassisliklar) {
        if (speciality.id === specialityId) return speciality.reja[index];
      }
    }
  }
  return undefined;
}

/**
 * Обновляет специальность по id, не завися от drill-пути: страница «O'quv reja»
 * работает вне drill-down структуры и своего пути не имеет.
 */
function mapSpeciality(
  faculties: Faculty[],
  specialityId: number,
  update: (speciality: Speciality) => Speciality,
): Faculty[] {
  return faculties.map((faculty) => ({
    ...faculty,
    kafedralar: faculty.kafedralar.map((department) => ({
      ...department,
      mutaxassisliklar: department.mutaxassisliklar.map((speciality) =>
        speciality.id === specialityId ? update(speciality) : speciality,
      ),
    })),
  }));
}

/**
 * Иммутабельно заменяет коллекцию на нужном уровне вложенности.
 * Прототип правил массивы на месте и звал forceUpdate — здесь так нельзя:
 * React не увидит изменения, а откатить такое редактирование невозможно.
 */
function mapContainer(
  faculties: Faculty[],
  drill: DrillStep[],
  level: number,
  update: (items: Entity[]) => Entity[],
): Faculty[] {
  if (level === 0) return update(faculties) as Faculty[];

  return faculties.map((faculty) => {
    if (faculty.id !== drill[0]?.id) return faculty;
    if (level === 1) {
      return { ...faculty, kafedralar: update(faculty.kafedralar) as Department[] };
    }

    return {
      ...faculty,
      kafedralar: faculty.kafedralar.map((department) => {
        if (department.id !== drill[1]?.id) return department;
        if (level === 2) {
          return {
            ...department,
            mutaxassisliklar: update(department.mutaxassisliklar) as Speciality[],
          };
        }

        return {
          ...department,
          mutaxassisliklar: department.mutaxassisliklar.map((speciality) =>
            speciality.id === drill[2]?.id
              ? { ...speciality, guruhlar: update(speciality.guruhlar) as Group[] }
              : speciality,
          ),
        };
      }),
    };
  });
}
