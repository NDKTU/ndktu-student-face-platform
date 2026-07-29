import type {
  SubmissionFile,
  TaskDetail,
  TaskRow,
  TaskSubmissionRow,
} from '@/entities/task/model/types';
import { initials } from '@/shared/lib/initials';
import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для заданий.
 *
 * Список уже урезан сервером под владельца токена: репозиторий отдаёт
 * преподавателю его курсы, студенту — курсы его группы. Сдачи в список не
 * входят: их приносит отдельный запрос при открытии задания.
 */

interface ApiAssignmentCourse {
  id: number;
  name: string;
  subject_name: string | null;
  teacher_name: string | null;
  faculty_name: string | null;
  group_names: string[];
}

interface ApiAssignment {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  deadline: string;
  max_grade: number;
  course: ApiAssignmentCourse | null;
  stats: { total_students: number; submitted: number; graded: number; late: number } | null;
}

interface ApiSubmissionFile {
  name: string;
  url: string;
  size: number | null;
  type: string | null;
}

interface ApiSubmission {
  id: number;
  assignment_id: number;
  user_id: number;
  submitted_text: string | null;
  submitted_files: ApiSubmissionFile[];
  submitted_at: string | null;
  status: string;
  grade: number | null;
  feedback: string | null;
  graded_at: string | null;
  user: { id: number; username: string; full_name: string | null } | null;
}

/** «2026-07-29T13:00:00+05:00» → «29.07.2026»: в интерфейсе даты без времени. */
function toDate(iso: string | null): string {
  if (!iso) return '';
  const [date] = iso.split('T');
  const parts = date?.split('-');
  return parts?.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : (date ?? '');
}

function toFiles(files: ApiSubmissionFile[]): SubmissionFile[] {
  // В прототипе тип файла один, поэтому в UI-типе он и остался литералом.
  return (files ?? []).map((f) => ({ name: f.name, type: 'pdf' }));
}

/**
 * Статусы бэкенда шире, чем показывает экран: draft и returned он не
 * различает, для него это «ещё не сдано».
 */
function toStatus(raw: string): TaskSubmissionRow['status'] {
  if (raw === 'graded') return 'baholangan';
  if (raw === 'submitted' || raw === 'late') return 'topshirilgan';
  return 'topshirilmagan';
}

function toSubmission(sub: ApiSubmission): TaskSubmissionRow {
  const fish = sub.user?.full_name ?? sub.user?.username ?? '';
  return {
    id: sub.id,
    userId: sub.user_id,
    fish,
    initials: initials(fish),
    status: toStatus(sub.status),
    ball: sub.grade,
    feedback: sub.feedback ?? '',
    submittedAt: sub.submitted_at ? toDate(sub.submitted_at) : null,
    gradedAt: sub.graded_at ? toDate(sub.graded_at) : null,
    text: sub.submitted_text ?? '',
    files: toFiles(sub.submitted_files),
    links: [],
  };
}

function toRow(a: ApiAssignment): TaskRow {
  return {
    id: a.id,
    fan: a.course?.subject_name ?? a.course?.name ?? '',
    guruh: (a.course?.group_names ?? []).join(', '),
    oqituvchi: a.course?.teacher_name ?? '',
    fac: a.course?.faculty_name ?? '',
    title: a.title,
    desc: a.description ?? '',
    deadline: toDate(a.deadline),
    students: a.stats?.total_students ?? 0,
    submitted: a.stats?.submitted ?? 0,
    graded: a.stats?.graded ?? 0,
    // Своя сдача приезжает отдельным запросом — в списке её нет.
    mySub: null,
  };
}

export interface SubmitPayload {
  text: string;
  links: string[];
  files: SubmissionFile[];
}

export async function getTasks(): Promise<TaskRow[]> {
  const assignments = await getAll<ApiAssignment>('/assignment/', 'assignments');
  return assignments.map(toRow);
}

/**
 * То же, но со своей сдачей по каждому заданию — список студента показывает
 * её состояние прямо в строке. Бэкенд отдаёт сдачу только поштучно, поэтому
 * забираем их параллельно; заданий у студента десятки, не тысячи.
 */
export async function getStudentTasks(): Promise<TaskRow[]> {
  const rows = await getTasks();
  const mine = await Promise.all(rows.map((row) => getMySubmission(row.id)));
  return rows.map((row, i) => ({ ...row, mySub: mine[i] ?? null }));
}

/** Задание вместе со сдачами — экран проверки работ. */
export async function getTask(id: number): Promise<TaskDetail> {
  const [assignment, submissions] = await Promise.all([
    api.get<ApiAssignment>(`/assignment/${id}`),
    api.get<{ submissions: ApiSubmission[] }>(`/assignment/${id}/submissions`),
  ]);

  const { students, submitted, graded, mySub, ...rest } = toRow(assignment);
  void submitted;
  void graded;
  void mySub;

  return { ...rest, students, subs: submissions.submissions.map(toSubmission) };
}

/** Своя сдача студента. 404 означает «ещё не сдавал» — это не ошибка. */
export async function getMySubmission(taskId: number): Promise<TaskSubmissionRow | null> {
  try {
    return toSubmission(await api.get<ApiSubmission>(`/assignment/${taskId}/my-submission`));
  } catch {
    return null;
  }
}

export async function gradeSubmission(
  taskId: number,
  userId: number,
  ball: number,
  feedback: string,
): Promise<TaskSubmissionRow> {
  const graded = await api.put<ApiSubmission>(
    `/assignment/${taskId}/submission/${userId}/grade`,
    { grade: ball, feedback },
  );
  return toSubmission(graded);
}

export async function submitWork(
  taskId: number,
  body: SubmitPayload,
): Promise<TaskSubmissionRow> {
  const submitted = await api.post<ApiSubmission>(`/assignment/${taskId}/submit`, {
    submitted_text: body.text,
    // Загрузка файлов идёт через /resource/upload и сюда приходит уже ссылкой;
    // до этого экрана она ещё не добралась, поэтому список пуст.
    submitted_files: [],
  });
  return toSubmission(submitted);
}

/** Работа, ждущая проверки, вместе с контекстом задания. */
export interface PendingSubmission {
  id: number;
  taskId: number;
  fish: string;
  initials: string;
  fan: string;
  guruh: string;
  title: string;
}

interface ApiPending {
  id: number;
  assignment_id: number;
  assignment_title: string;
  full_name: string;
  subject_name: string | null;
  group_names: string[];
}

/** Плоский список работ на проверке — для домашней страницы преподавателя. */
export async function getPending(limit = 20): Promise<PendingSubmission[]> {
  const data = await api.get<{ submissions: ApiPending[] }>(`/assignment/pending?limit=${limit}`);
  return data.submissions.map((s) => ({
    id: s.id,
    taskId: s.assignment_id,
    fish: s.full_name,
    initials: initials(s.full_name),
    fan: s.subject_name ?? '',
    guruh: s.group_names.join(', '),
    title: s.assignment_title,
  }));
}
