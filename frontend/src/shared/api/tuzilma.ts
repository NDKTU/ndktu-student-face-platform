import type {
  EduForm,
  Faculty,
  FacultyColor,
  Group,
  Kafedra,
  RejaRow,
  Speciality,
  StatusTone,
  Student,
  StudentStatus,
} from '@/entities/university/model/types';
import { displayName, groupName } from '@/shared/lib/displayName';
import { initials } from '@/shared/lib/initials';
import { getAll, getList } from './envelope';
import { api, qs } from './http';

/**
 * Граница до бэкенда для модулей «Tuzilma» и «O'quv reja».
 *
 * Здесь и только здесь встречаются имена полей сервера. Дальше по коду живут
 * узбекские названия из прототипа: `kafedralar`, `mutaxassisliklar`, `guruhlar`.
 * Кафедра здесь и называется Kafedra. Раньше тип звался Department — так же,
 * как у бэкенда называется подразделение сотрудников, и на этом путались.
 */

// ---------------------------------------------------------------- ответы API

interface ApiGroup {
  id: number;
  name: string;
  kurs: number | null;
  position: number;
  sardor_student_id: number | null;
  sardor_name?: string | null;
  education_form: EduForm | null;
  student_count: number;
}

interface ApiSpeciality {
  id: number;
  name: string;
  code: string | null;
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
  mudir_employee_id: number | null;
  position: number;
  teacher_count: number;
  specialities: ApiSpeciality[];
}

interface ApiFaculty {
  id: number;
  name: string;
  code: string | null;
  dekan_name: string | null;
  dekan_employee_id: number | null;
  color_bg: string | null;
  color_fg: string | null;
  position: number;
  kafedras: ApiKafedra[];
}

interface ApiCurriculumRow {
  id: number;
  speciality_id: number;
  subject_id: number | null;
  subject_name: string;
  semester: number;
  credit: number;
  teacher_id: number | null;
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
    name: groupName(group.name),
    shakl: group.education_form,
    kurs: group.kurs ?? 1,
    sardor: group.sardor_name || EMPTY,
    sardorStudentId: group.sardor_student_id,
    // Состав группы приезжает отдельным запросом при раскрытии карточки.
    student_count: group.student_count,
  };
}

function toSpeciality(speciality: ApiSpeciality): Speciality {
  return {
    id: speciality.id,
    name: displayName(speciality.name),
    kod: speciality.code ?? '',
    reja_yil: speciality.academic_year,
    guruhlar: speciality.groups.map(toGroup),
    // План грузится по требованию: в дереве от него нужно только число строк.
    reja: [],
    curriculum_count: speciality.curriculum_count,
    curriculum_credits: speciality.curriculum_credits,
  };
}

function toKafedra(kafedra: ApiKafedra): Kafedra {
  return {
    id: kafedra.id,
    name: displayName(kafedra.name),
    mudir: kafedra.mudir_name ?? EMPTY,
    mudirEmployeeId: kafedra.mudir_employee_id,
    oqituvchilar: kafedra.teacher_count,
    mutaxassisliklar: kafedra.specialities.map(toSpeciality),
  };
}

function toFaculty(faculty: ApiFaculty): Faculty {
  return {
    id: faculty.id,
    name: displayName(faculty.name),
    dekan: faculty.dekan_name ?? EMPTY,
    dekanEmployeeId: faculty.dekan_employee_id,
    color: facultyColor(faculty),
    kafedralar: faculty.kafedras.map(toKafedra),
  };
}

function toRejaRow(row: ApiCurriculumRow): RejaRow {
  return {
    id: row.id,
    fan: row.subject_name,
    semestr: row.semester,
    kredit: row.credit,
    oqituvchi: row.teacher_name ?? EMPTY,
    teacherId: row.teacher_id,
  };
}

// ------------------------------------------------------------------- запросы

export interface FacultyPayload {
  name?: string;
  /**
   * Кого назначить деканом. `null` — снять, `undefined` — не трогать: сервер
   * различает «прислали null» и «поля не было», и только так пост очищается.
   */
  dekanEmployeeId?: number | null;
  /**
   * ФИО из пикера. На сервер НЕ уходит — там его больше негде хранить, имя
   * берётся join'ом из employees. Нужно только чтобы карточка обновилась
   * сразу, не дожидаясь перезагрузки дерева.
   */
  dekanName?: string | null;
}

export interface KafedraPayload {
  name?: string;
  mudirEmployeeId?: number | null;
  /** См. FacultyPayload.dekanName — тоже только для мгновенного показа. */
  mudirName?: string | null;
}

/** Ключ попадает в тело, только если его действительно правили. */
function post(key: string, value: number | string | null | undefined) {
  return value === undefined ? {} : { [key]: value };
}

export interface SpecialityPayload {
  name?: string;
  kod?: string;
  reja_yil?: string;
}

export interface GroupPayload {
  name?: string;
  shakl?: EduForm | null;
  kurs?: number;
  sardorStudentId?: number | null;
  sardorName?: string | null;
}

/** Преподаватель в выпадающем списке строки плана. */
export interface CurriculumTeacher {
  id: number;
  fullName: string;
}

/**
 * Преподаватели кафедры — кандидаты в ведущие по строке плана.
 *
 * Берём с `/teacher/`, а не из дерева: дерево несёт только счётчик
 * `teacher_count`, а плану нужен `teachers.id`, на который и ссылается
 * `curriculum.teacher_id`.
 */
export async function fetchKafedraTeachers(kafedraId: number): Promise<CurriculumTeacher[]> {
  const rows = await getAll<{ id: number; employee: { full_name: string } | null }>(
    '/teacher/',
    'teachers',
    { kafedra_id: kafedraId },
  );
  return rows
    .map((row) => ({ id: row.id, fullName: displayName(row.employee?.full_name ?? '') }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export interface RejaRowPayload {
  fan?: string;
  semestr?: number;
  kredit?: number;
  /** id карточки преподавателя. Раньше сюда уходила строка «Karimov A.» —
   *  сокращение, которое не уникально и ни с чем не связано. */
  teacherId?: number | null;
}

export async function getTree(): Promise<Faculty[]> {
  const data = await api.get<{ faculties: ApiFaculty[] }>('/organization/tree');
  return data.faculties.map(toFaculty);
}

// --- Fakultet ---------------------------------------------------------------

export async function createFaculty(body: FacultyPayload): Promise<Faculty> {
  const created = await api.post<{ id: number; name: string }>('/faculty/', {
    name: body.name,
    ...post('dekan_employee_id', body.dekanEmployeeId),
  });
  return {
    id: created.id,
    // Сервер приводит название к нижнему регистру — показываем не то, что
    // ввели, а то, что действительно сохранилось.
    name: displayName(created.name),
    dekan: body.dekanName || EMPTY,
    dekanEmployeeId: body.dekanEmployeeId ?? null,
    color: FALLBACK_COLORS[created.id % FALLBACK_COLORS.length]!,
    kafedralar: [],
  };
}

export async function updateFaculty(id: number, body: FacultyPayload): Promise<Partial<Faculty>> {
  const updated = await api.put<{ id: number; name: string }>(`/faculty/${id}`, {
    ...post('name', body.name),
    ...post('dekan_employee_id', body.dekanEmployeeId),
  });
  return {
    id: updated.id,
    name: displayName(updated.name),
    ...(body.dekanEmployeeId !== undefined && {
      dekan: body.dekanName || EMPTY,
      dekanEmployeeId: body.dekanEmployeeId,
    }),
  };
}

export const deleteFaculty = (id: number, force = false) =>
  api.delete(`/faculty/${id}${qs({ force: force || undefined })}`);

// --- Kafedra ----------------------------------------------------------------

export async function createKafedra(
  facultyId: number,
  body: KafedraPayload,
): Promise<Kafedra> {
  const created = await api.post<{ id: number; name: string }>('/kafedra/', {
    name: body.name,
    faculty_id: facultyId,
    ...post('mudir_employee_id', body.mudirEmployeeId),
  });
  return {
    id: created.id,
    name: displayName(created.name),
    mudir: body.mudirName || EMPTY,
    mudirEmployeeId: body.mudirEmployeeId ?? null,
    oqituvchilar: 0,
    mutaxassisliklar: [],
  };
}

export async function updateKafedra(
  id: number,
  body: KafedraPayload,
): Promise<Partial<Kafedra>> {
  const updated = await api.put<{ id: number; name: string }>(`/kafedra/${id}`, {
    ...post('name', body.name),
    ...post('mudir_employee_id', body.mudirEmployeeId),
  });
  return {
    id: updated.id,
    name: displayName(updated.name),
    ...(body.mudirEmployeeId !== undefined && {
      mudir: body.mudirName || EMPTY,
      mudirEmployeeId: body.mudirEmployeeId,
    }),
  };
}

export const deleteKafedra = (id: number, force = false) =>
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
  });
  return {
    id: created.id,
    name: displayName(created.name),
    kod: body.kod ?? '',
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
    ...post('academic_year', body.reja_yil),
  });
  return {
    id: updated.id,
    name: displayName(updated.name),
    ...(body.kod !== undefined && { kod: body.kod }),
    ...(body.reja_yil !== undefined && { reja_yil: body.reja_yil }),
  };
}

export const deleteSpeciality = (id: number) => api.delete(`/speciality/${id}`);

// --- Guruh ------------------------------------------------------------------

export async function createGroup(specialityId: number, body: GroupPayload): Promise<Group> {
  const created = await api.post<ApiGroup>('/group/', {
    name: body.name,
    speciality_id: specialityId,
    kurs: body.kurs ?? null,
    ...post('education_form', body.shakl),
    ...post('sardor_student_id', body.sardorStudentId),
  });
  return {
    id: created.id,
    name: groupName(created.name),
    shakl: body.shakl ?? null,
    kurs: body.kurs ?? 1,
    sardor: body.sardorName || created.sardor_name || EMPTY,
    sardorStudentId: body.sardorStudentId ?? created.sardor_student_id,
    student_count: created.student_count ?? 0,
  };
}

export async function updateGroup(id: number, body: GroupPayload): Promise<Partial<Group>> {
  const updated = await api.put<ApiGroup>(`/group/${id}`, {
    ...post('name', body.name),
    ...post('kurs', body.kurs),
    ...post('education_form', body.shakl),
    ...post('sardor_student_id', body.sardorStudentId),
  });
  return {
    id: updated.id,
    name: groupName(updated.name),
    ...(body.kurs !== undefined && { kurs: body.kurs }),
    ...(body.shakl !== undefined && { shakl: body.shakl }),
    ...(body.sardorStudentId !== undefined && {
      sardorStudentId: body.sardorStudentId,
      sardor: body.sardorName || updated.sardor_name || EMPTY,
    }),
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
    teacher_id: body.teacherId ?? null,
  });
  return toRejaRow(created);
}

export async function updateRejaRow(rowId: number, body: RejaRowPayload): Promise<RejaRow> {
  const updated = await api.put<ApiCurriculumRow>(`/curriculum/${rowId}`, {
    subject_name: body.fan,
    semester: body.semestr,
    credit: body.kredit,
    teacher_id: body.teacherId ?? null,
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

export interface SardorCandidate {
  id: number;
  fullName: string;
}

export async function getSardorCandidates(groupId?: number): Promise<SardorCandidate[]> {
  try {
    if (groupId) {
      const students = await getGroupStudents(groupId);
      if (students.length > 0) {
        return students.map((s) => ({ id: s.id, fullName: s.fish }));
      }
    }
    const page = await getList<{ id: number; full_name: string }>('/students/', 'students', {
      limit: 200,
    });
    return page.items.map((s) => ({ id: s.id, fullName: s.full_name }));
  } catch {
    return [];
  }
}
