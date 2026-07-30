import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для HEMIS.
 *
 * HEMIS — внешняя система университета. Бэкенд ходит в неё под логином самого
 * студента: своего сервисного доступа у нас нет, поэтому и просмотр, и импорт
 * требуют его пароля. Пароль поэтому нигде не сохраняется — ни в URL, ни в
 * localStorage, — а живёт в состоянии формы до конца операции.
 */

export interface HemisCredentials {
  login: string;
  password: string;
}

/** Профиль, как его отдаёт HEMIS. Ключи — те, что читает бэкенд при импорте. */
export interface HemisProfile {
  fullName: string;
  studentIdNumber: string;
  image: string;
  university: string;
  faculty: string;
  group: string;
  specialty: string;
  level: string;
  semester: string;
  educationForm: string;
  educationType: string;
  paymentForm: string;
  educationLang: string;
  studentStatus: string;
  gender: string;
  phone: string;
  address: string;
  birthDate: string;
}

export interface HemisQuizResult {
  id: number;
  quiz: string;
  subject: string;
  grade: number | null;
  createdAt: string;
}

export interface HemisPreview {
  profile: HemisProfile;
  /** id найденных совпадений в нашей базе; null — совпадения нет. */
  userId: number | null;
  facultyId: number | null;
  groupId: number | null;
  userExists: boolean;
  facultyExists: boolean;
  groupExists: boolean;
  /** Имя, под которым группа будет создана, если её не нашли. */
  suggestedGroup: string;
  existingResults: HemisQuizResult[];
}

interface ApiPreview {
  hemis_data: Record<string, unknown>;
  user_id: number | null;
  faculty_id: number | null;
  group_id: number | null;
  user_exists: boolean;
  faculty_exists: boolean;
  group_exists: boolean;
  suggested_group: string;
  existing_results: {
    id: number;
    quiz: { title: string } | null;
    subject: { name: string } | null;
    grade: number | null;
    created_at: string;
  }[];
}

/**
 * Половина полей HEMIS приходит объектом `{code, name}`, половина — строкой.
 * Разбираем это здесь: экрану нужен текст.
 */
function name(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'name' in value) {
    const inner = (value as { name?: unknown }).name;
    return typeof inner === 'string' ? inner : '';
  }
  return '';
}

/** `birth_date` в HEMIS — unix-секунды. */
function birthDate(value: unknown): string {
  const ts = typeof value === 'number' ? value : 0;
  if (!ts) return '';
  const date = new Date(ts * 1000);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('uz-UZ');
}

function toProfile(raw: Record<string, unknown>): HemisProfile {
  return {
    fullName: name(raw.full_name),
    studentIdNumber: name(raw.student_id_number),
    image: name(raw.image),
    university: name(raw.university),
    faculty: name(raw.faculty),
    group: name(raw.group),
    specialty: name(raw.specialty),
    level: name(raw.level),
    semester: name(raw.semester),
    educationForm: name(raw.educationForm),
    educationType: name(raw.educationType),
    paymentForm: name(raw.paymentForm),
    educationLang: name(raw.educationLang),
    studentStatus: name(raw.studentStatus),
    gender: name(raw.gender),
    phone: name(raw.phone),
    address: name(raw.address),
    birthDate: birthDate(raw.birth_date),
  };
}

/** Просмотр перед импортом: что придёт и что из этого уже есть у нас. */
export async function previewHemis(credentials: HemisCredentials): Promise<HemisPreview> {
  const data = await api.post<ApiPreview>('/hemis/preview', credentials);

  return {
    profile: toProfile(data.hemis_data),
    userId: data.user_id,
    facultyId: data.faculty_id,
    groupId: data.group_id,
    userExists: data.user_exists,
    facultyExists: data.faculty_exists,
    groupExists: data.group_exists,
    suggestedGroup: data.suggested_group,
    existingResults: data.existing_results.map((r) => ({
      id: r.id,
      quiz: r.quiz?.title ?? '',
      subject: r.subject?.name ?? '',
      grade: r.grade,
      createdAt: r.created_at,
    })),
  };
}

export interface HemisSyncResult {
  success: boolean;
  message: string;
  userId: number | null;
}

/**
 * Импорт. `facultyId`/`groupId` — ручное переопределение: без них бэкенд
 * заведёт факультет и группу по именам из HEMIS.
 */
export async function syncHemis(
  credentials: HemisCredentials,
  override: { facultyId?: number | null; groupId?: number | null } = {},
): Promise<HemisSyncResult> {
  const data = await api.post<{ success: boolean; message: string; user_id: number | null }>(
    '/hemis/sync',
    {
      ...credentials,
      faculty_id: override.facultyId ?? null,
      group_id: override.groupId ?? null,
    },
  );

  return { success: data.success, message: data.message, userId: data.user_id };
}

/**
 * Вход студента через HEMIS. Возвращает наш собственный токен: бэкенд заводит
 * или обновляет учётную запись по данным HEMIS и выдаёт обычную сессию.
 */
export async function hemisLogin(credentials: HemisCredentials): Promise<string> {
  const data = await api.post<{ type: string; access_token: string }>('/hemis/login', credentials);
  return data.access_token;
}

/** Группы для ручного переопределения; фильтруются факультетом. */
export async function getGroupOptions(facultyId?: number | null) {
  const rows = await getAll<{ id: number; name: string; faculty_id: number }>('/group/', 'groups', {
    faculty_id: facultyId ?? undefined,
  });
  return rows.map((row) => ({ id: row.id, name: row.name, facultyId: row.faculty_id }));
}
