import { buildUniversity } from '@/entities/university/mock/build';
import { buildAdminCourses, shortFaculty } from '@/entities/course/mock/adminCourses';
import { hashStr, initials } from '@/entities/university/mock/rng';

export type SubmissionStatus = 'baholangan' | 'topshirilgan' | 'topshirilmagan';

export interface AdminSubmission {
  id: string;
  fish: string;
  initials: string;
  status: SubmissionStatus;
  ball: number | null;
  feedback: string;
  submittedAt: string | null;
  files: { name: string; type: 'pdf' }[];
  text: string;
}

export interface AdminTask {
  id: number;
  fan: string;
  guruh: string;
  oqituvchi: string;
  fac: string;
  title: string;
  deadline: string;
  students: number;
  subs: AdminSubmission[];
}

/** Крайние сроки — [будущие…, прошедшие…], как POOL в прототипе. */
const DEADLINE_POOL = ['24.07.2026', '29.07.2026', '05.08.2026', '01.08.2026', '10.07.2026', '12.07.2026'];
/** «Сейчас» для расчёта просрочки (в прототипе ~18.07.2026, ср. last login). */
const NOW = new Date(2026, 6, 18);

const FEEDBACKS = ['Yaxshi ish.', "Toʻliq bajarilgan.", 'Bir nechta xatolik bor.', "Aʼlo darajada."];
const SUBMITTED_GRADED = ['12.07.2026 09:12', '13.07.2026 20:41', '14.07.2026 11:05'];
const SUBMITTED_PENDING = ['15.07.2026 08:30', '16.07.2026 22:14', '17.07.2026 13:47'];
const PENDING_TEXTS = ['', "Savol boʻlsa yozing."];

// Имена. В прототипе — из общего RNG (по порядку); здесь детерминированы
// по хэшу id сдачи, пол согласован с суффиксом.
const MALE_FIRST = ['Doston', 'Sardor', 'Javohir', 'Alisher', 'Elyor', 'Bekzod', 'Sanjar', 'Kamron'];
const FEMALE_FIRST = ['Nozima', 'Malika', 'Gulbahor', 'Sevara', 'Madina', 'Nilufar', 'Feruza', 'Sabina'];
const SURNAME = ['Tursunov', 'Saidov', 'Mirzayev', 'Abdullayev', 'Ergashev', 'Umarov', 'Karimov', 'Xolmatov'];

function pick<T>(arr: readonly T[], seed: string): T {
  return arr[hashStr(seed) % arr.length]!;
}

function personName(seed: string): string {
  const h = hashStr(seed);
  const female = h % 2 === 0;
  const first = (female ? FEMALE_FIRST : MALE_FIRST)[h % 8]!;
  const base = SURNAME[(h >>> 3) % SURNAME.length]!;
  const surname = female ? `${base}a` : base;
  const father = MALE_FIRST[(h >>> 5) % MALE_FIRST.length]!;
  return `${surname} ${first} ${father}${female ? ' qizi' : " o'g'li"}`;
}

/** Порт genSubs: статус и балл детерминированы по хэшу (совпадают с прототипом). */
function buildSubmissions(taskId: string, count: number): AdminSubmission[] {
  const subs: AdminSubmission[] = [];
  for (let k = 0; k < count; k++) {
    const rr = (hashStr(taskId + k) % 100) / 100;
    const fish = personName(`${taskId}_p${k}`);
    const base = { id: `${taskId}_s${k}`, fish, initials: initials(fish) };

    if (rr < 0.46) {
      subs.push({
        ...base,
        status: 'baholangan',
        ball: 60 + (hashStr(`${taskId}${k}b`) % 41),
        feedback: pick(FEEDBACKS, `${taskId}${k}f`),
        submittedAt: pick(SUBMITTED_GRADED, `${taskId}${k}d`),
        files: [{ name: 'topshiriq.pdf', type: 'pdf' }],
        text: 'Bajarildi.',
      });
    } else if (rr < 0.7) {
      subs.push({
        ...base,
        status: 'topshirilgan',
        ball: null,
        feedback: '',
        submittedAt: pick(SUBMITTED_PENDING, `${taskId}${k}d`),
        files: [{ name: `ish_${k + 1}.pdf`, type: 'pdf' }],
        text: pick(PENDING_TEXTS, `${taskId}${k}t`),
      });
    } else {
      subs.push({ ...base, status: 'topshirilmagan', ball: null, feedback: '', submittedAt: null, files: [], text: '' });
    }
  }
  return subs;
}

/**
 * Порт allTasks: по одному заданию с первых 30 курсов админ-каталога.
 * Счётчики и баллы детерминированы (совпадают с прототипом); каждое третье
 * задание — с автопроверкой (topshirilgan → baholangan).
 */
export function buildAdminTasks(): AdminTask[] {
  const { faculties } = buildUniversity();
  const { courses, byId, seedById } = buildAdminCourses(faculties);
  const tasks: AdminTask[] = [];
  let aci = 0;

  for (const meta of courses) {
    if (aci >= 30) break;
    const course = byId[meta.id];
    if (!course) continue;
    const lesson = course.mavzular.flatMap((m) => m.darslar).find((d) => d.uy);
    if (!lesson) continue;

    aci++;
    const id = aci;
    // Хэш-зерно берётся не из id, а из зерна курса: id стал числом,
    // и эталонные счётчики сдач привязаны к прежней строке.
    const seed = `atask_${seedById[meta.id]}`;
    const students = 20 + (hashStr(seed) % 9);
    const subs = buildSubmissions(seed, students);

    // Каждое третье задание полностью проверено.
    if (aci % 3 === 0) {
      subs.forEach((s) => {
        if (s.status === 'topshirilgan') {
          s.status = 'baholangan';
          s.ball = 65 + (hashStr(s.id) % 31);
          s.feedback = pick(['Yaxshi ish.', "Toʻliq bajarilgan.", "Aʼlo darajada."], `${s.id}ag`);
        }
      });
    }

    tasks.push({
      id,
      fan: meta.fan,
      guruh: meta.guruh,
      oqituvchi: meta.oqituvchi,
      fac: meta.fac,
      title: lesson.title,
      deadline: DEADLINE_POOL[aci % 6]!,
      students,
      subs,
    });
  }

  return tasks;
}

export type TaskState = 'baholangan' | 'kechikkan' | 'tekshirilmoqda';

function isOverdue(deadline: string): boolean {
  const [d, m, y] = deadline.split('.').map(Number);
  if (!d || !m || !y) return false;
  return new Date(y, m - 1, d) < NOW;
}

/** Сводный статус задания. Порт aTaskStatus. */
export function taskState(task: AdminTask): TaskState {
  const submitted = task.subs.filter((s) => s.status !== 'topshirilmagan').length;
  const graded = task.subs.filter((s) => s.status === 'baholangan').length;
  if (submitted > 0 && graded >= submitted) return 'baholangan';
  return isOverdue(task.deadline) ? 'kechikkan' : 'tekshirilmoqda';
}

export { shortFaculty };
