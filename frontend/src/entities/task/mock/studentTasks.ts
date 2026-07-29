import { buildUniversity } from '@/entities/university/mock/build';
import { buildCourse } from '@/entities/course/mock/buildCourse';
import type { RejaRow } from '@/entities/university/model/types';
import type { StudentTask, TaskStatus } from '../model/types';

const PAST = ['10.07.2026', '12.07.2026'];
const FUTURE = ['24.07.2026', '29.07.2026', '05.08.2026', '01.08.2026'];

/**
 * Предметы студента = дисциплины его текущего семестра. Студент — из первой
 * специальности АТ-факультета (Dasturiy injiniring), группа DI-24-01, 2 курс,
 * значит 4-й семестр. Если там мало предметов — берётся начало плана.
 */
function studentSubjects(): RejaRow[] {
  const { faculties } = buildUniversity();
  const spec = faculties[2]!.kafedralar[0]!.mutaxassisliklar[0]!;
  const currentSemester = 2 * 2; // 2-курс → 4-й семестр
  const inSemester = spec.reja.filter((r) => r.semestr === currentSemester);
  return inSemester.length >= 4 ? inSemester : spec.reja.slice(0, 6);
}

/**
 * Задания студента: до двух на предмет, из уроков с домашней работой.
 * Статус циклится по счётчику (сдано / не сдано / просрочено / оценено),
 * ровно как в прототипе, поэтому список воспроизводим.
 */
export function buildStudentTasks(): StudentTask[] {
  const subjects = studentSubjects();
  const tasks: StudentTask[] = [];
  let counter = 0;

  subjects.forEach((row) => {
    const course = buildCourse(row.fan, row.oqituvchi, row.semestr);
    let perSubject = 0;

    for (const topic of course.mavzular) {
      for (const lesson of topic.darslar) {
        if (!lesson.uy || perSubject >= 2) continue;
        perSubject++;
        counter++;

        const cycle = counter % 4;
        const id = counter;
        let status: TaskStatus;
        let ball: number | null = null;
        let feedback = '';
        let gradedAt: string | null = null;
        let sub = null as StudentTask['sub'];
        let deadline: string;

        if (cycle === 0) {
          status = 'baholangan';
          deadline = PAST[counter % 2]!;
          ball = 70 + ((counter * 7) % 26);
          feedback =
            'Ishingiz yaxshi bajarilgan. Keyingi safar hisob-kitoblarni batafsilroq yozing.';
          gradedAt = deadline;
          sub = {
            files: [{ name: `javob_${counter}.pdf`, type: 'pdf' }],
            text: 'Topshiriqni bajardim, yechim ilova qilindi.',
            links: [],
            submittedAt: `${PAST[counter % 2]!} 10:15`,
          };
        } else if (cycle === 1) {
          status = 'topshirilgan';
          deadline = FUTURE[counter % 4]!;
          sub = {
            files: [{ name: `yechim_${counter}.pdf`, type: 'pdf' }],
            text: '',
            links: [`https://drive.google.com/file/${counter}`],
            submittedAt: '15.07.2026 14:20',
          };
        } else if (cycle === 2) {
          status = 'topshirilmagan';
          deadline = FUTURE[(counter + 1) % 4]!;
        } else {
          status = 'kechikkan';
          deadline = PAST[counter % 2]!;
        }

        tasks.push({
          id,
          fan: row.fan,
          title: lesson.title,
          desc: lesson.uy.text,
          deadline,
          status,
          ball,
          feedback,
          gradedAt,
          sub,
        });
      }
    }
  });

  return tasks;
}

/** Цвет и подпись статуса задания. */
export function taskStatusMeta(status: TaskStatus): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'baholangan':
      return { label: 'Baholangan', bg: 'var(--color-success-tint)', fg: 'var(--color-success)' };
    case 'topshirilgan':
      return { label: 'Topshirilgan', bg: 'var(--color-brand-soft)', fg: 'var(--color-brand)' };
    case 'kechikkan':
      return { label: 'Kechikkan', bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' };
    default:
      return { label: 'Topshirilmagan', bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' };
  }
}
