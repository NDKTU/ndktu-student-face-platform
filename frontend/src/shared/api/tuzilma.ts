import type {
  Department,
  EduForm,
  Faculty,
  FacultyColor,
  Group,
  RejaRow,
  Speciality,
  StatusTone,
  Student,
  StudentStatus,
} from '@/entities/university/model/types';
import { displayName } from '@/shared/lib/displayName';
import { initials } from '@/shared/lib/initials';
import { getAll, getList } from './envelope';
import { api, qs } from './http';

/**
 * Граница до бэкенда для модулей «Tuzilma» и «O'quv reja».
 *
 * Здесь и только здесь встречаются имена полей сервера. Дальше по коду живут
 * узбекские названия из прототипа: `kafedralar`, `mutaxassisliklar`, `guruhlar`.
 * Отдельно стоит запомнить, что «Department» в этих типах — это кафедра;
 * у бэкенда `Department` называется совсем другое (подразделение сотрудников).
 */

// ---------------------------------------------------------------- ответы API

interface ApiGroup {
  id: number;
  name: string;
  kurs: number | null;
  position: number;
  sardor_student_id: number | null;
  student_count: number;
}

interface ApiSpeciality {
  id: number;
  name: string;
  code: string | null;
  education_form: string | null;
  academic_year: string | null;
  position: number;
  curriculum_count: number;
  curriculum_credits: number;
  groups: ApiGroup[];
}

interface ApiKafedra {
  id: number;
  name: string;
  mudir_name: string | null;
  mudir_user_id: number | null;
  position: number;
  teacher_count: number;
  specialities: ApiSpeciality[];
}

interface ApiFaculty {
  id: number;
  name: string;
  code: string | null;
  dekan_name: string | null;
  dekan_user_id: number | null;
  color_bg: string | null;
  color_fg: string | null;
  position: number;
  kafedras: ApiKafedra[];
  orphan_groups: ApiGroup[];
}

interface ApiCurriculumRow {
  id: number;
  speciality_id: number;
  subject_id: number | null;
  subject_name: string;
  semester: number;
  credit: number;
  teacher_name: string | null;
  position: number;
}

/** Подпись, когда должности никто не занял. В прототипе это тоже прочерк. */
const EMPTY = '—';

/**
 * Запасная палитра факультета. Цвет теперь хранится в БД, но у записей,
 * заведённых раньше, он пустой — а карточки в дереве цветные всегда.
 * Берём по id, а не по кругу: цвет не должен меняться между загрузками.
 */
const FALLBACK_COLORS: FacultyColor[] = [
  { bg: '#EEF1FF', fg: '#2836C7' },
  { bg: '#E7F6F4', fg: '#0E7C86' },
  { bg: '#FDF1E3', fg: '#B45309' },
  { bg: '#F3EDFD', fg: '#6D28D9' },
  { bg: '#E9F7EF', fg: '#157A43' },
  { bg: '#FCECF1', fg: '#A33254' },
];

function facultyColor(faculty: ApiFaculty): FacultyColor {
  if (faculty.color_bg && faculty.color_fg) {
    return { bg: faculty.color_bg, fg: faculty.color_fg };
  }
  return FALLBACK_COLORS[faculty.id % FALLBACK_COLORS.length]!;
}

// ------------------------------------------------------------- преобразования

function toGroup(group: ApiGroup): Group {
  return {
    id: group.id,
    name: group.name,
    kurs: group.kurs ?? 1,
    sardor: EMPTY,
    // Состав группы приезжает отдельным запросом при раскрытии карточки.
    student_count: group.student_count,
  };
}

function toSpeciality(speciality: ApiSpeciality): Speciality {
  return {
    id: speciality.id,
    name: displayName(speciality.name),
    kod: speciality.code ?? '',
    shakl: (speciality.education_form as EduForm) ?? 'Kunduzgi',
    reja_yil: speciality.academic_year,
    guruhlar: speciality.groups.map(toGroup),
    // План грузится по требованию: в дереве от него нужно только число строк.
    reja: [],
    curriculum_count: speciality.curriculum_count,
    curriculum_credits: speciality.curriculum_credits,
  };
}

function toDepartment(kafedra: ApiKafedra): Department {
  return {
    id: kafedra.id,
    name: displayName(kafedra.name),
    mudir: kafedra.mudir_name ?? EMPTY,
    mudirUserId: kafedra.mudir_user_id,
    oqituvchilar: kafedra.teacher_count,
    teachers: [],
    mutaxassisliklar: kafedra.specialities.map(toSpeciality),
  };
}

function toFaculty(faculty: ApiFaculty): Faculty {
  return {
    id: faculty.id,
    name: displayName(faculty.name),
    dekan: faculty.dekan_name ?? EMPTY,
    dekanUserId: faculty.dekan_user_id,
    color: facultyColor(faculty),
    kafedralar: faculty.kafedras.map(toDepartment),
  };
}

function toRejaRow(row: ApiCurriculumRow): RejaRow {
  return {
    id: row.id,
    fan: row.subject_name,
    semestr: row.semester,
    kredit: row.credit,
    oqituvchi: row.teacher_name ?? EMPTY,
  };
}

// ------------------------------------------------------------------- запросы

export interface FacultyPayload {
  name?: string;
  /**
   * Кого назначить деканом. `null` — снять, `undefined` — не трогать: сервер
   * различает «прислали null» и «поля не было», и только так пост очищается.
   */
  dekanUserId?: number | null;
  /** Снимок ФИО: дерево показывает его, не заглядывая в справочник сотрудников. */
  dekanName?: string | null;
}

export interface DepartmentPayload {
  name?: string;
  mudirUserId?: number | null;
  mudirName?: string | null;
}

/** Ключ попадает в тело, только если его действительно правили. */
function post(key: string, value: number | string | null | undefined) {
  return value === undefined ? {} : { [key]: value };
}

export interface SpecialityPayload {
  name?: string;
  kod?: string;
  shakl?: EduForm;
  reja_yil?: string;
}

export interface GroupPayload {
  name?: string;
  kurs?: number;
}

export interface RejaRowPayload {
  fan?: string;
  semestr?: number;
  kredit?: number;
  oqituvchi?: string;
}

export async function getTree(): Promise<Faculty[]> {
  const data = await api.get<{ faculties: ApiFaculty[] }>('/organization/tree');
  return data.faculties.map(toFaculty);
}

// --- Fakultet ---------------------------------------------------------------

export async function createFaculty(body: FacultyPayload): Promise<Faculty> {
  const created = await api.post<{ id: number; name: string }>('/faculty/', {
    name: body.name,
    ...post('dekan_user_id', body.dekanUserId),
    ...post('dekan_name', body.dekanName),
  });
  return {
    id: created.id,
    // Сервер приводит название к нижнему регистру — показываем не то, что
    // ввели, а то, что действительно сохранилось.
    name: displayName(created.name),
    dekan: body.dekanName || EMPTY,
    dekanUserId: body.dekanUserId ?? null,
    color: FALLBACK_COLORS[created.id % FALLBACK_COLORS.length]!,
    kafedralar: [],
  };
}

export async function updateFaculty(id: number, body: FacultyPayload): Promise<Partial<Faculty>> {
  const updated = await api.put<{ id: number; name: string }>(`/faculty/${id}`, {
    ...post('name', body.name),
    ...post('dekan_user_id', body.dekanUserId),
    ...post('dekan_name', body.dekanName),
  });
  return {
    id: updated.id,
    name: displayName(updated.name),
    ...(body.dekanUserId !== undefined && {
      dekan: body.dekanName || EMPTY,
      dekanUserId: body.dekanUserId,
    }),
  };
}

export const deleteFaculty = (id: number, force = false) =>
  api.delete(`/faculty/${id}${qs({ force: force || undefined })}`);

// --- Kafedra (в типах фронта — Department) ----------------------------------

export async function createDepartment(
  facultyId: number,
  body: DepartmentPayload,
): Promise<Department> {
  const created = await api.post<{ id: number; name: string }>('/kafedra/', {
    name: body.name,
    faculty_id: facultyId,
    ...post('mudir_user_id', body.mudirUserId),
    ...post('mudir_name', body.mudirName),
  });
  return {
    id: created.id,
    name: displayName(created.name),
    mudir: body.mudirName || EMPTY,
    mudirUserId: body.mudirUserId ?? null,
    oqituvchilar: 0,
    teachers: [],
    mutaxassisliklar: [],
  };
}

export async function updateDepartment(
  id: number,
  body: DepartmentPayload,
): Promise<Partial<Department>> {
  const updated = await api.put<{ id: number; name: string }>(`/kafedra/${id}`, {
    ...post('name', body.name),
    ...post('mudir_user_id', body.mudirUserId),
    ...post('mudir_name', body.mudirName),
  });
  return {
    id: updated.id,
    name: displayName(updated.name),
    ...(body.mudirUserId !== undefined && {
      mudir: body.mudirName || EMPTY,
      mudirUserId: body.mudirUserId,
    }),
  };
}

export const deleteDepartment = (id: number, force = false) =>
  api.delete(`/kafedra/${id}${qs({ force: force || undefined })}`);

// --- Mutaxassislik ----------------------------------------------------------

export async function createSpeciality(
  kafedraId: number,
  body: SpecialityPayload,
): Promise<Speciality> {
  const created = await api.post<{ id: number; name: string }>('/speciality/', {
    name: body.name,
    kafedra_id: kafedraId,
    code: body.kod || null,
    education_form: body.shakl || null,
  });
  return {
    id: created.id,
    name: displayName(created.name),
    kod: body.kod ?? '',
    shakl: body.shakl ?? 'Kunduzgi',
    reja_yil: body.reja_yil ?? null,
    guruhlar: [],
    reja: [],
    curriculum_count: 0,
    curriculum_credits: 0,
  };
}

export async function updateSpeciality(
  id: number,
  body: SpecialityPayload,
): Promise<Partial<Speciality>> {
  const updated = await api.put<{ id: number; name: string }>(`/speciality/${id}`, {
    // Через тот же `post`: раньше пустые ключи улетали как `undefined` и
    // JSON.stringify их выбрасывал — работало, но случайно.
    ...post('name', body.name),
    ...post('code', body.kod),
    ...post('education_form', body.shakl),
    ...post('academic_year', body.reja_yil),
  });
  return {
    id: updated.id,
    name: displayName(updated.name),
    ...(body.kod !== undefined && { kod: body.kod }),
    ...(body.shakl !== undefined && { shakl: body.shakl }),
    ...(body.reja_yil !== undefined && { reja_yil: body.reja_yil }),
  };
}

export const deleteSpeciality = (id: number) => api.delete(`/speciality/${id}`);

// --- Guruh ------------------------------------------------------------------

export async function createGroup(
  specialityId: number,
  facultyId: number,
  body: GroupPayload,
): Promise<Group> {
  const created = await api.post<{ id: number; name: string }>('/group/', {
    name: body.name,
    speciality_id: specialityId,
    // faculty_id у группы на бэкенде обязателен, а в интерфейсе его не
    // спрашивают: он однозначно известен из пути drill-down.
    faculty_id: facultyId,
    kurs: body.kurs ?? null,
  });
  return {
    id: created.id,
    name: created.name,
    kurs: body.kurs ?? 1,
    sardor: EMPTY,
    student_count: 0,
  };
}

export async function updateGroup(id: number, body: GroupPayload): Promise<Partial<Group>> {
  const updated = await api.put<{ id: number; name: string }>(`/group/${id}`, {
    name: body.name,
    kurs: body.kurs,
  });
  return {
    id: updated.id,
    name: updated.name,
    ...(body.kurs !== undefined && { kurs: body.kurs }),
  };
}

export const deleteGroup = (id: number, force = false) =>
  api.delete(`/group/${id}${qs({ force: force || undefined })}`);

// --- O'quv reja (curriculum) ------------------------------------------------

/** План специальности целиком. Дерево его не несёт — только число строк. */
export async function getReja(specialityId: number): Promise<RejaRow[]> {
  const rows = await getAll<ApiCurriculumRow>('/curriculum/', 'curriculum', {
    speciality_id: specialityId,
  });
  return rows.map(toRejaRow);
}

export async function createRejaRow(
  specialityId: number,
  body: RejaRowPayload,
): Promise<RejaRow> {
  const created = await api.post<ApiCurriculumRow>('/curriculum/', {
    speciality_id: specialityId,
    subject_name: body.fan,
    semester: body.semestr,
    credit: body.kredit,
    teacher_name: body.oqituvchi === EMPTY ? null : body.oqituvchi,
  });
  return toRejaRow(created);
}

export async function updateRejaRow(rowId: number, body: RejaRowPayload): Promise<RejaRow> {
  const updated = await api.put<ApiCurriculumRow>(`/curriculum/${rowId}`, {
    subject_name: body.fan,
    semester: body.semestr,
    credit: body.kredit,
    teacher_name: body.oqituvchi === EMPTY ? null : body.oqituvchi,
  });
  return toRejaRow(updated);
}

export const deleteRejaRow = (rowId: number) => api.delete(`/curriculum/${rowId}`);

/** Без semestr чистит весь план специальности, с ним — один семестр. */
export const clearReja = (specialityId: number, semestr?: number) =>
  api.delete(`/curriculum/${qs({ speciality_id: specialityId, semester: semestr })}`);

// --- Guruh talabalari -------------------------------------------------------

interface ApiGroupStudent {
  id: number;
  full_name: string;
  student_id_number: string | null;
  student_status: string | null;
  gender: string | null;
}

/** Статусы бэкенда — свободные строки; в бейдже у них три цвета. */
function statusOf(raw: string | null): { holati: StudentStatus; tone: StatusTone } {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('akademik')) return { holati: "Akademik ta'til", tone: 'warn' };
  if (value.includes("ta'til") || value.includes('tatil')) return { holati: "Ta'til", tone: 'muted' };
  return { holati: 'Faol', tone: 'ok' };
}

/** Состав группы. Отдельный запрос: в дереве от группы нужно только число. */
export async function getGroupStudents(groupId: number): Promise<Student[]> {
  const page = await getList<ApiGroupStudent>(`/group/${groupId}/students`, 'students', {
    limit: 200,
  });

  return page.items.map((student) => {
    const { holati, tone } = statusOf(student.student_status);
    return {
      id: student.id,
      gender: student.gender === 'f' ? 'f' : 'm',
      fish: student.full_name,
      sid: student.student_id_number ?? '',
      holati,
      tone,
      initials: initials(student.full_name),
    };
  });
}
