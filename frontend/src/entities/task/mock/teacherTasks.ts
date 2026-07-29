import { hashStr, initials } from '@/entities/university/mock/rng';
import { buildCourse } from '@/entities/course/mock/buildCourse';

export type SubmissionStatus = 'baholangan' | 'topshirilgan' | 'topshirilmagan';

export interface StudentSubmission {
  id: string;
  fish: string;
  initials: string;
  status: SubmissionStatus;
  ball: number | null;
  feedback: string;
  submittedAt: string | null;
  text: string;
}

export interface TeacherTask {
  id: string;
  fan: string;
  guruh: string;
  title: string;
  desc: string;
  deadline: string;
  students: number;
  subs: StudentSubmission[];
}

/** Предметы преподавателя и их группы. */
const TEACHER_SUBJECTS = [
  { id: 'ts1', fan: 'Kon jinslari mexanikasi', groups: ['KI-24-01', 'KI-24-02', 'KI-23-01'] },
  { id: 'ts2', fan: 'Portlatish ishlari texnologiyasi', groups: ['KI-23-01', 'KI-23-02'] },
  { id: 'ts3', fan: 'Kon aerologiyasi va ventilyatsiya', groups: ['KI-24-01', 'KI-24-02'] },
  { id: 'ts4', fan: 'Oliy matematika', groups: ['KI-24-01', 'MT-24-01', 'GD-24-01'] },
];

const FUTURE = ['24.07.2026', '29.07.2026', '05.08.2026', '01.08.2026'];
const FEEDBACKS = ['Yaxshi ish.', "Toʻliq bajarilgan.", 'Bir nechta xatolik bor.', "Aʼlo darajada."];
const SUBMITTED_AT = ['12.07.2026 09:12', '13.07.2026 20:41', '14.07.2026 11:05'];

// Имена для сдач. В прототипе они идут из общего RNG (зависят от порядка);
// здесь берутся детерминированно по хэшу id сдачи — порядок не важен.
const FIRST = ['Aziz', 'Bekzod', 'Sardor', 'Jasur', 'Diyor', 'Otabek', 'Nilufar', 'Malika', 'Sevara', 'Madina'];
const LAST = ['Karimov', 'Rahimov', 'Yusupov', 'Qodirov', 'Abdullayev', 'Mirzayev', 'Tursunova', 'Saidova'];

function personFor(seed: string): string {
  const h = hashStr(seed);
  return `${LAST[h % LAST.length]!} ${FIRST[(h >>> 3) % FIRST.length]!}`;
}

/**
 * Строит задания преподавателя со сдачами студентов. Статус и оценка каждой
 * сдачи выводятся из хэша её id — генератор детерминирован и не зависит
 * от порядка построения (в отличие от прототипа, где имена шли из общего RNG).
 */
export function buildTeacherTasks(): TeacherTask[] {
  const tasks: TeacherTask[] = [];

  TEACHER_SUBJECTS.forEach((subject) => {
    subject.groups.forEach((guruh) => {
      const studentCount = 22 + (hashStr(guruh + subject.id) % 9);
      const course = buildCourse(subject.fan, 'Jasur Bozorov', 3, guruh + subject.id);
      let per = 0;

      for (const topic of course.mavzular) {
        for (const lesson of topic.darslar) {
          if (!lesson.uy || per >= 2) continue;
          per++;
          const id = `ttask_${subject.id}_${guruh}_${lesson.id}`;

          const subs: StudentSubmission[] = Array.from({ length: studentCount }, (_, k) => {
            const subId = `${id}_s${k}`;
            const roll = (hashStr(subId) % 100) / 100;
            const fish = personFor(subId);
            const base = { id: subId, fish, initials: initials(fish) };

            if (roll < 0.46) {
              return {
                ...base,
                status: 'baholangan' as const,
                ball: 60 + (hashStr(`${subId}b`) % 41),
                feedback: FEEDBACKS[hashStr(subId) % FEEDBACKS.length]!,
                submittedAt: SUBMITTED_AT[hashStr(subId) % SUBMITTED_AT.length]!,
                text: 'Bajarildi.',
              };
            }
            if (roll < 0.7) {
              return {
                ...base,
                status: 'topshirilgan' as const,
                ball: null,
                feedback: '',
                submittedAt: SUBMITTED_AT[hashStr(`${subId}s`) % SUBMITTED_AT.length]!,
                text: '',
              };
            }
            return { ...base, status: 'topshirilmagan' as const, ball: null, feedback: '', submittedAt: null, text: '' };
          });

          tasks.push({
            id,
            fan: subject.fan,
            guruh,
            title: lesson.title,
            desc: lesson.uy.text,
            deadline: FUTURE[per % 4]!,
            students: studentCount,
            subs,
          });
        }
      }
    });
  });

  return tasks;
}

/** Сколько сдач сдано и сколько ждёт проверки. */
export function taskProgress(task: TeacherTask) {
  const submitted = task.subs.filter((s) => s.status !== 'topshirilmagan').length;
  const pending = task.subs.filter((s) => s.status === 'topshirilgan').length;
  return { submitted, pending, total: task.students };
}
