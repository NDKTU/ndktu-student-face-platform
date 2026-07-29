/** Форма обучения. */
export type EduForm = 'Kunduzgi' | 'Sirtqi';

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
  oqituvchi: string;
}

export interface Group {
  id: number;
  /** Например DI-24-01: префикс специальности, год, номер. */
  name: string;
  kurs: number;
  sardor: string;
  students: Student[];
}

export interface Speciality {
  id: number;
  name: string;
  /** Код направления по классификатору, 8 цифр. */
  kod: string;
  shakl: EduForm;
  /** Учебный год плана («2025/2026»); у сгенерированных планов его нет. */
  reja_yil?: string | null;
  guruhlar: Group[];
  reja: RejaRow[];
}

export interface Department {
  id: number;
  name: string;
  mudir: string;
  /** Штатная численность преподавателей кафедры. */
  oqituvchilar: number;
  /** Пул преподавателей, из которого назначаются предметы в учебном плане. */
  teachers: Person[];
  mutaxassisliklar: Speciality[];
}

export interface FacultyColor {
  bg: string;
  fg: string;
}

export interface Faculty {
  id: number;
  name: string;
  dekan: string;
  color: FacultyColor;
  kafedralar: Department[];
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
export const STRUCTURE_LEVELS = ['faculty', 'department', 'speciality', 'group'] as const;
export type StructureLevel = (typeof STRUCTURE_LEVELS)[number];
