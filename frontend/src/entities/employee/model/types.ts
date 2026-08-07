/**
 * Пол. Дубль GENDERS из `core/database/enums.py` — там ENUM базы.
 * Статуса сотрудника здесь нет: столбец `status` убран, он никогда не влиял
 * на вход, хотя комментарий в модели это обещал.
 */
export type Gender = 'Erkak' | 'Ayol';

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
   * Роли — свободные строки из БД, их заводит администратор. Связь
   * many-to-many: декан одновременно преподаватель, и показывать надо обе.
   * `roleNames` — сырые имена для отправки на сервер, `roleLabels` — их подписи.
   */
  roleNames: string[];
  roleLabels: string[];
  /** Название подразделения — для показа и фильтра. */
  unit: string;
  /** Оно же ссылкой: форма правит id, `unit` — только подпись. */
  departmentId: number | null;
  /** Название должности — для показа и фильтра. */
  lavozim: string;
  /** Она же ссылкой: должность стала справочником, а не свободной строкой. */
  jobTitleId: number | null;
  email: string;
  workEmail: string;
  login: string;
  initials: string;
  color: string;

  gender: Gender;
  birth: string;
  hire: string;
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
  jobTitleId: number | null;
  workPhone: string;
  workEmail: string;
  hire: string;
  login: string;
  pwd: string;
  roleNames: string[];
}>;
