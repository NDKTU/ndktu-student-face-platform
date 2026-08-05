export type VideoType = 'upload' | 'youtube';

export interface Resource {
  name: string;
  /** Ссылка на файл в uploads: сам файл в базе не лежит. */
  url: string;
  /** Готовая подпись («1.2 MB») — её показывают. */
  size: string;
  /**
   * Исходный размер в байтах. Нужен для обратной отправки: сервер хранит
   * число, а `size` — уже отформатированная строка, и вернуть её нельзя.
   */
  bytes: number | null;
}

/** Домашнее задание, привязанное к материалу (`Assignment.material_id`). */
export interface Homework {
  id: number;
  title: string;
  desc: string;
  /** `YYYY-MM-DD`: время суток задаёт слой API, тут только дата. */
  deadline: string;
  maxBall: number;
}

/**
 * Материал раздела: видео, ссылка или текст.
 *
 * Домашнее задание тут появляется опционально: на бэкенде оно живёт своей
 * таблицей и по-прежнему принадлежит курсу, но теперь может ссылаться и на
 * конкретный материал. Список заданий целиком ведёт раздел «Vazifalar».
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
  /** Догружается модалкой урока, в дереве курса всегда null. */
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
  /**
   * Те же группы, но с id: журнал занятий ведётся по конкретной группе, а не по
   * склеенной строке из таблицы.
   */
  guruhlar: { id: number; name: string }[];
  oqituvchi: string;
  fac: string;
  kaf: string;
  sem: number;
  /** Число разделов и материалов — приходит из счётчиков курса. */
  mavzular: number;
  darslar: number;

  // Идентификаторы для формы редактирования: показывать нужно имена, а
  // отправлять — id, и второй раз искать их по имени было бы гаданием.
  subjectId: number | null;
  teacherId: number | null;
  facultyId: number | null;
  kafedraId: number | null;
  groupIds: number[];
  /** Сырой номер семестра: у созданных из интерфейса курсов его нет. */
  semNumber: number | null;
}
