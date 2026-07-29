import type { Faculty } from '@/entities/university/model/types';
import { buildCourse } from './buildCourse';
import type { AdminCourse, Course } from '../model/types';

// Тип переехал в model/types.ts: список курсов теперь отдаёт бэкенд.
export type { AdminCourse } from '../model/types';

export interface AdminCoursesResult {
  courses: AdminCourse[];
  /** Полные курсы по id — для экрана детали. */
  byId: Record<number, Course>;
  /**
   * Зерно генератора для каждого курса. Раньше его роль играл строковый id
   * («ac_0_1»); теперь id — число, а зерно должно остаться прежним, иначе
   * поедут эталонные числа заданий (13 сдали, 10 оценено) и тестов.
   */
  seedById: Record<number, string>;
}

/**
 * Плоский список специальностей в том же порядке, что строит прототип
 * (обход faculties → kafedralar → mutaxassisliklar). Порядок важен: он задаёт
 * индекс `si` в id курса `ac_<si>_<ri>`.
 */
function flatSpecialities(faculties: Faculty[]) {
  const result: { spec: Faculty['kafedralar'][number]['mutaxassisliklar'][number]; facName: string; kafName: string }[] = [];
  faculties.forEach((f) => {
    f.kafedralar.forEach((k) => {
      k.mutaxassisliklar.forEach((spec) => {
        result.push({ spec, facName: f.name, kafName: k.name });
      });
    });
  });
  return result;
}

/**
 * Курсы для админ-модуля: по два на специальность — первый предмет плана
 * и предмет из середины. Каждый курс строится детерминированно, поэтому
 * весь список воспроизводим.
 */
export function buildAdminCourses(faculties: Faculty[]): AdminCoursesResult {
  const specs = flatSpecialities(faculties);
  const courses: AdminCourse[] = [];
  const byId: Record<number, Course> = {};
  const seedById: Record<number, string> = {};
  let nextId = 1;

  specs.forEach(({ spec, facName, kafName }, si) => {
    const group = spec.guruhlar[0];
    if (!group || spec.reja.length === 0) return;

    const picks = [spec.reja[0], spec.reja[Math.floor(spec.reja.length / 2)]];
    picks.forEach((row, ri) => {
      if (!row) return;
      const id = nextId++;
      const seed = `ac_${si}_${ri}`;
      seedById[id] = seed;
      const course = buildCourse(row.fan, row.oqituvchi, row.semestr, group.name + seed);
      byId[id] = course;
      courses.push({
        id,
        fan: row.fan,
        guruh: group.name,
        oqituvchi: row.oqituvchi,
        fac: facName,
        kaf: kafName,
        sem: row.semestr,
        mavzular: course.mavzular.length,
        darslar: course.total,
      });
    });
  });

  return { courses, byId, seedById };
}

/** «Konchilik fakulteti» → «Konchilik». */
export function shortFaculty(name: string): string {
  return name.replace(' fakulteti', '');
}
