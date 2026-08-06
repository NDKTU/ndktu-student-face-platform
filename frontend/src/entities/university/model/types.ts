/**
 * Форма обучения. Дубль ENUM'а education_form в базе и Literal'а в
 * organization_structure/group/schemas.py — менять нужно все три места.
 *
 * Sirtqi показываем, но не предлагаем: заочное обучение прекращено, а записи
 * прошлых лет должны читаться. Список для выбора — FORMS_SELECTABLE.
 */
export type EduForm = 'Kunduzgi' | 'Kechki' | 'Masofaviy' | 'Sirtqi';

export const EDU_FORMS_SELECTABLE: readonly EduForm[] = ['Kunduzgi', 'Kechki', 'Masofaviy'];

/** Статус студента и его цветовой тон на бейдже. */
export type StudentStatus = 'Faol' | "Akademik ta'til" | "Ta'til";
export type StatusTone = 'ok' | 'warn' | 'muted';

export interface Student {
  id: number;
  /** Пол: влияет на формирование ФИО ("... o'g'li" / "... qizi"). */
  gender: 'm' | 'f';
  fish: string;
  /** Студенческий ID: год поступления + код факультета + номер. */
  sid: string;
  holati: StudentStatus;
  tone: StatusTone;
  initials: string;
}

/** Строка учебного плана: один предмет в одном семестре. */
export interface RejaRow {
  /** Приходит от сервера; в мок-генераторе (сид) его нет. */
  id?: number;
  fan: string;
  semestr: number;
  kredit: number;
  /** ФИО ведущего — сервер собирает его из карточки сотрудника. Только показ. */
  oqituvchi: string;
  /** Кто именно ведёт: ссылка на карточку преподавателя. Её и правит форма. */
  teacherId: number | null;
}

export interface Group {
  id: number;
  /** Например DI-24-01: префикс специальности, год, номер. */
  name: string;
  /**
   * Форма обучения. Свойство группы, а не специальности: у направления
   * name UNIQUE, и двух строк под кундузги и сиртки оно не даёт.
   */
  shakl: EduForm | null;
  kurs: number;
  sardor: string;
  sardorStudentId?: number | null;
  /**
   * Сколько студентов в группе. Дерево структуры несёт только число: сам
   * список — это больше тысячи строк на реальных данных, и тянуть его в
   * каждый обход дерева нельзя.
   */
  student_count: number;
  /**
   * Состав группы. Приходит не из дерева, а отдельным запросом при раскрытии
   * карточки — поэтому опционален. Ещё его заполняют мок-генераторы экранов,
   * не переведённых на API.
   */
  students?: Student[];
}

export interface Speciality {
  id: number;
  name: string;
  /** Код направления по классификатору, 8 цифр. */
  kod: string;
  /** Учебный год плана («2025/2026»); у сгенерированных планов его нет. */
  reja_yil?: string | null;
  guruhlar: Group[];
  /** Строки плана. Пусто до тех пор, пока экран «O'quv reja» их не загрузит. */
  reja: RejaRow[];
  /** Сколько строк в плане — известно сразу, из дерева. */
  curriculum_count: number;
  /** Сумма кредитов плана — тоже из дерева: строк там нет, считать не из чего. */
  curriculum_credits: number;
}

/**
 * Кафедра. Раньше тип назывался Department — так же, как у бэкенда называется
 * совсем другая сущность (подразделение сотрудников вроде бухгалтерии), и на
 * этом успели запутаться.
 */
export interface Kafedra {
  id: number;
  name: string;
  /** ФИО заведующего. Приходит с сервера join'ом из employees, форма его не шлёт. */
  mudir: string;
  /** Карточка сотрудника, а не учётка: у студента учётка тоже есть. */
  mudirEmployeeId: number | null;
  /** Штатная численность преподавателей кафедры. */
  oqituvchilar: number;
  mutaxassisliklar: Speciality[];
}

export interface FacultyColor {
  bg: string;
  fg: string;
}

export interface Faculty {
  id: number;
  name: string;
  /** ФИО декана. Приходит с сервера join'ом из employees, форма его не шлёт. */
  dekan: string;
  /** Карточка сотрудника, а не учётка. */
  dekanEmployeeId: number | null;
  color: FacultyColor;
  kafedralar: Kafedra[];
}

export interface Person {
  gender: 'm' | 'f';
  first: string;
  sur: string;
  base: string;
  /** «Фамилия Имя Отчество o'g'li» — полная форма. */
  full: string;
  /** «Фамилия И.» — краткая форма для таблиц. */
  short: string;
  /** «Имя Фамилия» — для подписей. */
  display: string;
}

/** Предмет в глобальном каталоге: одна строка на уникальное название. */
export interface Subject {
  fan: string;
  kafedra: string;
  kredit: number;
  semestr: number;
  oqituvchi: string;
}

/** Сводные показатели для дашборда. */
export interface UniversityTotals {
  faculties: number;
  departments: number;
  teachers: number;
  students: number;
}

/** Уровни drill-down в модуле «Tuzilma». */
export const STRUCTURE_LEVELS = ['faculty', 'kafedra', 'speciality', 'group'] as const;
export type StructureLevel = (typeof STRUCTURE_LEVELS)[number];
