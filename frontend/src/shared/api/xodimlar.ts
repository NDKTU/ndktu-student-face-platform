import { ROLE_COLORS, ROLE_LABELS, type Role } from '@/entities/access/model/roles';
import type {
  Employee,
  EmployeeDraft,
  EmployeeSensitive,
  EmployeeStatus,
} from '@/entities/employee/model/types';
import { api } from './http';

const BASE = '/foydalanuvchilar/xodimlar';

/** То, что реально приходит с сервера: без ярлыка роли и цвета. */
interface EmployeeRow {
  id: number;
  fish: string;
  roleId: Role;
  unit: string;
  lavozim: string;
  holati: EmployeeStatus;
  email: string;
  workEmail: string;
  login: string;
  initials: string;
  gender: Employee['gender'];
  birth: string;
  hire: string;
  lastLogin: string;
  workPhone: string;
}

/** Ярлык роли и цвет — UI-значения, они выводятся из roleId здесь, а не на сервере. */
function toEmployee(row: EmployeeRow): Employee {
  return { ...row, role: ROLE_LABELS[row.roleId], color: ROLE_COLORS[row.roleId] };
}

export const getEmployees = () =>
  api.get<EmployeeRow[]>(BASE).then((rows) => rows.map(toEmployee));

export const createEmployee = (draft: EmployeeDraft) =>
  api.post<EmployeeRow>(BASE, draft).then(toEmployee);

export const updateEmployee = (id: number, draft: EmployeeDraft) =>
  api.patch<EmployeeRow>(`${BASE}/${id}`, draft).then(toEmployee);

/** Персональные данные. Отдаются только super_admin'у, иначе 403. */
export const getEmployeeSensitive = (id: number) =>
  api.get<EmployeeSensitive>(`${BASE}/${id}/maxfiy`);
