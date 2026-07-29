import type { StatusTone, StudentStatus } from '@/entities/university/model/types';

/** Откуда пришла запись студента: из синхронизации HEMIS или заведена вручную. */
export type StudentSource = 'HEMIS' | "Qo'lda";

/** Плоская строка реестра студентов — то, что показывает вкладка «Talabalar». */
export interface StudentRow {
  id: number;
  fish: string;
  email: string;
  gender: 'm' | 'f';
  /** Студенческий ID: год поступления + код факультета + номер. */
  sid: string;
  guruh: string;
  fakultet: string;
  mutaxassislik: string;
  kurs: number;
  /** Форма обучения специальности — показывается чипом в карточке. */
  shakl: string;
  holati: StudentStatus;
  tone: StatusTone;
  initials: string;
  manba: StudentSource;
}

/** Анкета студента, вкладка «Umumiy». Приезжает отдельным запросом. */
export interface StudentProfile {
  birth: string;
  email: string;
  phone: string;
  lang: string;
  eduType: string;
  semestr: string;
  pay: string;
  /** «2-kurs» — выводится сервером из курса группы. */
  kursLevel: string;
}

/** Персональные данные студента — их отдают super_admin'у и admin'у. */
export interface StudentSensitive {
  jshshir: string;
  country: string;
  vil: string;
  tum: string;
  address: string;
  soc: string;
  pov: string;
}

/** Черновик формы «Yangi talaba». */
export interface StudentDraft {
  familiya: string;
  ism: string;
  otasi: string;
  jinsi: 'Erkak' | 'Ayol';
  birth: string;

  sid: string;
  fakultet: string;
  mutaxassislik: string;
  guruh: string;
  kurs: string;
  semestr: string;
  shakl: string;
  eduType: string;
  lang: string;
  pay: string;
  holati: StudentStatus;

  jshshir: string;
  manzil: string;

  email: string;
  phone: string;
}
