import type { Role } from '@/entities/access/model/roles';

export type EmployeeStatus = 'Faol' | 'Bloklangan' | "Ta'tilda";

/**
 * Строка справочника сотрудников. Персональных данных здесь нет: сервер
 * отдаёт их отдельным запросом (`EmployeeSensitive`), поэтому попасть в общий
 * список они не могут.
 */
export interface Employee {
  id: number;
  fish: string;
  roleId: Role;
  /** Человекочитаемое название роли — выводится из roleId на клиенте. */
  role: string;
  /** Подразделение: ректорат, факультет, кафедра или группа (для студента). */
  unit: string;
  lavozim: string;
  holati: EmployeeStatus;
  email: string;
  workEmail: string;
  login: string;
  initials: string;
  color: string;

  gender: 'Erkak' | 'Ayol';
  birth: string;
  hire: string;
  lastLogin: string;
  workPhone: string;
}

/** Персональные данные сотрудника — их отдаёт только super_admin'у. */
export interface EmployeeSensitive {
  personalPhone: string;
  jshshir: string;
  passport: string;
  address: string;
}

/** Черновик формы сотрудника. */
export type EmployeeDraft = Partial<{
  fish: string;
  gender: Employee['gender'];
  birth: string;
  jshshir: string;
  passport: string;
  address: string;
  personalPhone: string;
  lavozim: string;
  unit: string;
  workPhone: string;
  workEmail: string;
  hire: string;
  login: string;
  pwd: string;
  roleId: Role;
  holati: EmployeeStatus;
}>;
