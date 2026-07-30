export type VideoType = 'upload' | 'youtube';

export interface Resource {
  name: string;
  /** Ссылка на файл в uploads: сам файл в базе не лежит. */
  url: string;
  size: string;
}

/**
 * Материал раздела: видео, ссылка или текст.
 *
 * Домашнего задания здесь больше нет: на бэкенде задания живут своей таблицей
 * и привязаны к курсу, а не к материалу, — их ведёт раздел «Vazifalar».
 */
export interface Lesson {
  id: number;
  no: number;
  title: string;
  videoType: VideoType;
  videoSrc: string;
  poster: string;
  dur: string;
  /** Прошёл ли материал тот, кто смотрит. У преподавателя всегда false. */
  done: boolean;
  desc: string;
  resurslar: Resource[];
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
  /** Число разделов и материалов — приходит из счётчиков курса. */
  mavzular: number;
  darslar: number;
}
