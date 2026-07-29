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
