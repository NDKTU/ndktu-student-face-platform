export type TaskStatus = 'baholangan' | 'topshirilgan' | 'topshirilmagan' | 'kechikkan';

/** Файл, приложенный к сдаче. */
export interface SubmissionFile {
  name: string;
  type: 'pdf';
}

/** Сдача студента по заданию. */
export interface Submission {
  files: SubmissionFile[];
  text: string;
  links: string[];
  submittedAt: string;
}

/** Задание в списке студента. */
export interface StudentTask {
  id: number;
  fan: string;
  title: string;
  desc: string;
  deadline: string;
  status: TaskStatus;
  ball: number | null;
  feedback: string;
  gradedAt: string | null;
  sub: Submission | null;
}

/** Сдача студента в том виде, как её отдаёт бэкенд. */
export interface TaskSubmissionRow {
  id: number;
  fish: string;
  initials: string;
  status: 'baholangan' | 'topshirilgan' | 'topshirilmagan';
  ball: number | null;
  feedback: string;
  submittedAt: string | null;
  gradedAt: string | null;
  text: string;
  files: SubmissionFile[];
  links: string[];
}

/** Строка списка заданий: без сдач, но со счётчиками. */
export interface TaskRow {
  id: number;
  fan: string;
  guruh: string;
  oqituvchi: string;
  fac: string;
  title: string;
  desc: string;
  deadline: string;
  students: number;
  submitted: number;
  graded: number;
  /** Своя сдача — приходит, когда список запрошен с ?fish=. */
  mySub: TaskSubmissionRow | null;
}

/** Задание со сдачами — экран проверки работ. */
export interface TaskDetail extends Omit<TaskRow, 'submitted' | 'graded' | 'mySub'> {
  subs: TaskSubmissionRow[];
}
