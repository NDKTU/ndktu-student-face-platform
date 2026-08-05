import { roleColor, roleLabel } from '@/entities/access/model/roles';
import type {
  Employee,
  EmployeeDraft,
  EmployeeSensitive,
  EmployeeStatus,
} from '@/entities/employee/model/types';
import { initials } from '@/shared/lib/initials';
import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для справочника сотрудников.
 *
 * Роль сотрудника — не колонка, а связь его учётки с таблицей ролей, поэтому
 * она приезжает вложенной в `user`. Ярлык и цвет роли — значения интерфейса и
 * считаются здесь: сервер отдаёт только имя.
 */

interface ApiEmployee {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  third_name: string;
  full_name: string;
  phone_number: string | null;
  image_url: string | null;
  position_title: string | null;
  work_email: string | null;
  work_phone: string | null;
  gender: string | null;
  birth_date: string | null;
  hire_date: string | null;
  status: string;
  last_login_at: string | null;
  user: { id: number; username: string; roles: { id: number; name: string }[] } | null;
  department: { id: number; name: string } | null;
  /** Заполнено, если у сотрудника есть преподавательская запись. */
  teacher: { id: number; kafedra_id: number } | null;
}

interface ApiEmployeeSensitive {
  id: number;
  jshshir: string | null;
  passport: string | null;
  personal_phone: string | null;
  address: string | null;
}

const STATUSES: EmployeeStatus[] = ['Faol', 'Bloklangan', "Ta'tilda"];

function statusOf(raw: string | null): EmployeeStatus {
  return STATUSES.find((s) => s === raw) ?? 'Faol';
}

function toEmployee(row: ApiEmployee): Employee {
  const roleNames = (row.user?.roles ?? []).map((r) => r.name);
  const primary = roleNames[0] ?? '';

  return {
    id: row.id,
    userId: row.user_id,
    fish: row.full_name,
    roleNames,
    role: primary ? roleLabel(primary) : '',
    color: roleColor(primary),
    unit: row.department?.name ?? '',
    departmentId: row.department?.id ?? null,
    lavozim: row.position_title ?? '',
    holati: statusOf(row.status),
    // У сотрудника личного email в БД нет — под именем показываем рабочий.
    email: row.work_email ?? '',
    workEmail: row.work_email ?? '',
    login: row.user?.username ?? '',
    initials: initials(row.full_name),
    gender: row.gender === 'Ayol' ? 'Ayol' : 'Erkak',
    birth: row.birth_date ?? '',
    hire: row.hire_date ?? '',
    lastLogin: row.last_login_at ?? '—',
    workPhone: row.work_phone ?? '',
  };
}

/** ФИО на бэкенде разложено на три поля, а форма собирает его одной строкой. */
function splitName(fish: string | undefined) {
  const parts = (fish ?? '').trim().split(/\s+/);
  return {
    last_name: parts[0] ?? '',
    first_name: parts[1] ?? '',
    third_name: parts.slice(2).join(' '),
  };
}

function toBody(draft: EmployeeDraft) {
  return {
    ...splitName(draft.fish),
    phone_number: draft.workPhone || null,
    position_title: draft.lavozim || null,
    work_email: draft.workEmail || null,
    work_phone: draft.workPhone || null,
    gender: draft.gender || null,
    birth_date: draft.birth || null,
    hire_date: draft.hire || null,
    status: draft.holati || null,
    // undefined — «не трогать», null — «убрать из подразделения».
    ...(draft.departmentId !== undefined && { department_id: draft.departmentId }),
    jshshir: draft.jshshir || null,
    passport: draft.passport || null,
    personal_phone: draft.personalPhone || null,
    address: draft.address || null,
  };
}

/** Справочник целиком: пагинации на экране нет, сотрудников сотни, не тысячи. */
export async function getEmployees(): Promise<Employee[]> {
  const rows = await getAll<ApiEmployee>('/employee/', 'employees');
  return rows.map(toEmployee);
}

/** Создаёт и сотрудника, и его учётку с ролями — это один запрос на бэкенде. */
export async function createEmployee(draft: EmployeeDraft): Promise<Employee> {
  const created = await api.post<ApiEmployee>('/employee/', {
    ...toBody(draft),
    username: draft.login,
    password: draft.pwd,
    roles: (draft.roleNames ?? []).map((name) => ({ name })),
  });
  return toEmployee(created);
}

export async function updateEmployee(id: number, draft: EmployeeDraft): Promise<Employee> {
  return toEmployee(await api.put<ApiEmployee>(`/employee/${id}`, toBody(draft)));
}

/** Персональные данные. Требуют отдельного права, иначе 403. */
export async function getEmployeeSensitive(id: number): Promise<EmployeeSensitive> {
  const data = await api.get<ApiEmployeeSensitive>(`/employee/${id}/sensitive`);
  return {
    personalPhone: data.personal_phone ?? '',
    jshshir: data.jshshir ?? '',
    passport: data.passport ?? '',
    address: data.address ?? '',
  };
}

/**
 * Кандидаты на структурный пост: декан факультета или заведующий кафедрой.
 *
 * Фильтрует сервер, а не клиент: «кто уже занимает пост» знают только таблицы
 * faculties/kafedras, и вычислять это по загруженному дереву значило бы
 * повторять серверное правило второй раз и разойтись с ним.
 */
export type StructuralPost = 'dekan' | 'kafedra_mudiri';

export interface PostCandidate {
  userId: number;
  fullName: string;
}

/**
 * Кандидат на структурный пост — декана или заведующего кафедрой.
 *
 * Здесь id карточки сотрудника, а не учётки: посты ссылаются на employees.
 * На users ссылаться было нельзя — учётка есть и у студента, так что деканом
 * мог оказаться кто угодно, а ФИО оттуда всё равно не достать.
 * Для выбора преподавателя курса нужен наоборот userId — см. PostCandidate.
 */
export interface PostHolderCandidate {
  employeeId: number;
  fullName: string;
}

/**
 * Преподаватели для выбора владельца курса.
 *
 * Отбираем по наличию записи в `teachers`, а не по имени роли. Курс ссылается
 * на `users.id`, но журнал занятий требует именно преподавательскую запись:
 * без неё курс создастся, а вкладка «Dars jurnali» ответит 400 «User is not
 * registered as a teacher». Роль такой проверки не даёт и вдобавок
 * переименовывается — в базе она называется `Teacher`, а не `oqituvchi`.
 *
 * Дальше — две подстраховки на случай неполного справочника: роль и, если и
 * она пуста, все сотрудники. Все три ступени считаются по одной выборке.
 */
export async function getTeacherOptions(): Promise<PostCandidate[]> {
  const all = await getAll<ApiEmployee>('/employee/', 'employees');

  const registered = all.filter((row) => row.teacher);
  const byRole = all.filter((row) =>
    (row.user?.roles ?? []).some((r) => r.name.toLowerCase() === 'teacher'),
  );
  const rows = registered.length ? registered : byRole.length ? byRole : all;

  return rows.map((row) => ({ userId: row.user_id, fullName: row.full_name }));
}

export async function getPostCandidates(post: StructuralPost): Promise<PostHolderCandidate[]> {
  // Роль называется так же, как пост: отдельного справочника соответствий нет,
  // и заводить его ради двух значений незачем.
  const rows = await getAll<ApiEmployee>('/employee/', 'employees', {
    role: post,
    available_post: post,
  });

  return rows.map((row) => ({ employeeId: row.id, fullName: row.full_name }));
}
