export type EmployeeStatus = 'Faol' | 'Bloklangan' | "Ta'tilda";

/**
 * Строка справочника сотрудников. Персональных данных здесь нет: сервер
 * отдаёт их отдельным запросом (`EmployeeSensitive`), поэтому попасть в общий
 * список они не могут.
 */
export interface Employee {
  id: number;
  fish: string;
  /** Учётка сотрудника: по ней он входит. */
  userId: number;
  /**
   * Роли — свободные строки из БД, их заводит администратор. Сотрудник может
   * иметь несколько; `role` — подпись первой, для бейджа в списке.
   */
  roleNames: string[];
  role: string;
  /** Название подразделения — для показа и фильтра. */
  unit: string;
  /** Оно же ссылкой: форма правит id, `unit` — только подпись. */
  departmentId: number | null;
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

/** Персональные данные сотрудника — за отдельным правом read:employee_sensitive. */
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
  departmentId: number | null;
  workPhone: string;
  workEmail: string;
  hire: string;
  login: string;
  pwd: string;
  roleNames: string[];
  holati: EmployeeStatus;
}>;
