export type VideoType = 'upload' | 'youtube';

export interface Resource {
  name: string;
  type: 'pdf' | 'pptx' | 'docx' | 'zip';
  size: string;
}

/** Домашнее задание, прикреплённое к уроку. */
export interface Homework {
  text: string;
  deadline: string;
  /** Проставляется, когда по заданию заводится запись в модуле Vazifalar. */
  taskId?: number;
}

export interface Lesson {
  id: number;
  no: number;
  title: string;
  videoType: VideoType;
  videoSrc: string;
  poster: string;
  dur: string;
  done: boolean;
  desc: string;
  resurslar: Resource[];
  uy: Homework | null;
}

export interface Topic {
  id: number;
  no: number;
  title: string;
  darslar: Lesson[];
}

export interface Course {
  fan: string;
  oqituvchi: string;
  semestr: number;
  mavzular: Topic[];
  /** Всего уроков в курсе. */
  total: number;
  /** Сколько уроков пройдено (для студента). */
  doneCount: number;
}

/** Строка списка курсов: без дерева, только счётчики тем и уроков. */
export interface AdminCourse {
  id: number;
  fan: string;
  guruh: string;
  oqituvchi: string;
  fac: string;
  kaf: string;
  sem: number;
  mavzular: number;
  darslar: number;
}
