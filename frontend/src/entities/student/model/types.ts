import type { StatusTone, StudentStatus } from '@/entities/university/model/types';

/** Откуда пришла запись студента: из синхронизации HEMIS или заведена вручную. */
export type StudentSource = 'HEMIS' | "Qo'lda";

/** Плоская строка реестра студентов — то, что показывает вкладка «Talabalar». */
export interface StudentRow {
  id: number;
  fish: string;
  /** Логин учётки. У студента нет поля email — под именем показываем его. */
  login: string;
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
  login: string;
  phone: string;
  lang: string;
  eduType: string;
  semestr: string;
  pay: string;
  /** «2-kurs» — выводится сервером из курса группы. */
  kursLevel: string;
}

/** Персональные данные студента — за отдельным правом read:student_sensitive. */
export interface StudentSensitive {
  jshshir: string;
  passport: string;
  vil: string;
  tum: string;
  address: string;
  soc: string;
  /** Льгота / категория. */
  pov: string;
}
