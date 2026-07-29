import type {
  Department,
  Faculty,
  Group,
  Person,
  RejaRow,
  Speciality,
  StatusTone,
  Student,
  StudentStatus,
  Subject,
  UniversityTotals,
} from '../model/types';
import {
  CAPSTONE_SUBJECTS,
  DOMAIN_SUBJECTS,
  ENGINEERING_DEPARTMENT,
  ENGINEERING_SUBJECTS,
  FACULTY_COLORS,
  FACULTY_DEFS,
  GENERAL_SUBJECTS,
  SUBJECT_DEPARTMENTS,
} from './catalog';
import { Rng, initials, namePrefix, splitEven } from './rng';
import { buildEmployees, type EmployeeDirectory } from '@/entities/employee/mock/buildEmployees';

/**
 * Целевая численность студентов по факультетам и общий штат преподавателей —
 * зашиты в прототипе, дают правдоподобные цифры на дашборде.
 */
const FACULTY_STUDENT_TARGETS = [247, 214, 249, 156, 204, 94];
const TOTAL_TEACHERS = 293;
const TEACHERS_PER_DEPARTMENT_POOL = 12;

/**
 * Состав учебного плана по семестрам: [общеобр., общеинж., профильные, практики].
 * Первые семестры — общеобразовательные, к последнему остаются практики и ВКР.
 */
const SEMESTER_COMPOSITION = [
  [6, 0, 0, 0],
  [4, 2, 0, 0],
  [3, 3, 1, 0],
  [2, 3, 1, 0],
  [1, 2, 2, 1],
  [0, 1, 4, 1],
  [0, 0, 4, 1],
  [0, 0, 1, 3],
];

/** Кредитов в семестре — по стандарту всегда 30. */
const CREDITS_PER_SEMESTER = 30;

export interface University {
  faculties: Faculty[];
  /** Плоский каталог предметов: одна строка на уникальное название. */
  subjects: Subject[];
  totals: UniversityTotals;
  /** Студент, под которым выполняется вход в роли «Talaba». */
  me: Person;
  /** Справочник сотрудников — строится тем же RNG, сразу после структуры. */
  directory: EmployeeDirectory;
}

/**
 * Учебный план на 8 семестров.
 * `rotation` сдвигает выбор профильных предметов, чтобы у двух специальностей
 * одной кафедры планы не совпадали дословно.
 */
function buildReja(
  rng: Rng,
  domain: readonly string[],
  teachers: Person[],
  rotation: number,
): RejaRow[] {
  let generalIdx = 0;
  let engIdx = 0;
  let domainIdx = rotation;
  let capstoneIdx = 0;
  const reja: RejaRow[] = [];

  for (let sem = 1; sem <= 8; sem++) {
    const [nGen = 0, nEng = 0, nDomain = 0, nCap = 0] = SEMESTER_COMPOSITION[sem - 1] ?? [];
    const items: string[] = [];

    for (let i = 0; i < nGen; i++) items.push(GENERAL_SUBJECTS[generalIdx++ % GENERAL_SUBJECTS.length]!);
    for (let i = 0; i < nEng; i++) items.push(ENGINEERING_SUBJECTS[engIdx++ % ENGINEERING_SUBJECTS.length]!);
    for (let i = 0; i < nDomain; i++) items.push(domain[domainIdx++ % domain.length]!);
    for (let i = 0; i < nCap; i++) items.push(CAPSTONE_SUBJECTS[capstoneIdx++ % CAPSTONE_SUBJECTS.length]!);

    const credits = splitEven(CREDITS_PER_SEMESTER, items.length);
    items.forEach((fan, idx) => {
      reja.push({ fan, semestr: sem, kredit: credits[idx]!, oqituvchi: rng.pick(teachers).short });
    });
  }

  return reja;
}

function subjectDepartment(fan: string, fallback: string): string {
  if (SUBJECT_DEPARTMENTS[fan]) return SUBJECT_DEPARTMENTS[fan]!;
  if ((ENGINEERING_SUBJECTS as readonly string[]).includes(fan)) return ENGINEERING_DEPARTMENT;
  return fallback;
}

/** 90% студентов активны, остальные в академическом или обычном отпуске. */
function pickStatus(rng: Rng): [StudentStatus, StatusTone] {
  const r = rng.next();
  if (r < 0.9) return ['Faol', 'ok'];
  if (r < 0.965) return ["Akademik ta'til", 'warn'];
  return ["Ta'til", 'muted'];
}

/**
 * Собирает всю структуру университета. Чистая функция: при одном seed
 * всегда возвращает одно и то же.
 */
export function buildUniversity(seed?: number): University {
  const rng = new Rng(seed);
  const subjects: Subject[] = [];

  // Порядок обращений к RNG обязан совпадать с прототипом — иначе разъедутся
  // все имена и номера. «me» генерируется до факультетов, хотя используется позже.
  const me = rng.person('m');

  const departmentCount = FACULTY_DEFS.reduce((acc, f) => acc + f.kaf.length, 0);
  const teacherCounts = rng.splitVaried(TOTAL_TEACHERS, departmentCount);
  let departmentIdx = 0;
  let groupCounter = 0;

  const faculties: Faculty[] = FACULTY_DEFS.map((facultyDef, facultyIdx) => {
    const dekan = rng.person().full;

    const groupCount = facultyDef.kaf.reduce(
      (acc, kaf) => acc + kaf.spec.reduce((sum, spec) => sum + spec.g, 0),
      0,
    );
    const groupSizes = rng.splitVaried(FACULTY_STUDENT_TARGETS[facultyIdx]!, groupCount);
    let sizeIdx = 0;
    let specialityInFaculty = 0;

    const kafedralar: Department[] = facultyDef.kaf.map((departmentDef) => {
      const mudir = rng.person().full;
      const teachers = Array.from({ length: TEACHERS_PER_DEPARTMENT_POOL }, () => rng.person());
      const teacherCount = teacherCounts[departmentIdx++]!;

      const mutaxassisliklar: Speciality[] = departmentDef.spec.map((specDef) => {
        const reja = buildReja(
          rng,
          DOMAIN_SUBJECTS[facultyIdx]!,
          teachers,
          specialityInFaculty++,
        );

        const guruhlar: Group[] = Array.from({ length: specDef.g }, () => {
          groupCounter++;
          const kurs = 1 + (groupCounter % 4);
          const enrollmentYear = 2025 - (kurs - 1);
          const name = `${namePrefix(specDef.name)}-${String(enrollmentYear).slice(2)}-${String(
            1 + Math.floor(rng.next() * 3),
          ).padStart(2, '0')}`;

          const studentCount = groupSizes[sizeIdx++]!;
          const students: Student[] = Array.from({ length: studentCount }, () => {
            const p = rng.person();
            const [holati, tone] = pickStatus(rng);
            return {
              id: rng.uid(),
              gender: p.gender,
              fish: p.full,
              sid: `${enrollmentYear}${String(facultyIdx + 1).padStart(2, '0')}${
                1000 + Math.floor(rng.next() * 8999)
              }`,
              holati,
              tone,
              initials: initials(`${p.sur} ${p.first}`),
            };
          });

          return { id: rng.uid(), name, kurs, sardor: rng.person().display, students };
        });

        reja.forEach((row) => {
          if ((CAPSTONE_SUBJECTS as readonly string[]).includes(row.fan)) return;
          subjects.push({
            fan: row.fan,
            kafedra: subjectDepartment(row.fan, departmentDef.name),
            kredit: row.kredit,
            semestr: row.semestr,
            oqituvchi: row.oqituvchi,
          });
        });

        return {
          id: rng.uid(),
          name: specDef.name,
          kod: specDef.kod,
          shakl: specDef.shakl,
          guruhlar,
          reja,
        };
      });

      return {
        id: rng.uid(),
        name: departmentDef.name,
        mudir,
        oqituvchilar: teacherCount,
        teachers,
        mutaxassisliklar,
      };
    });

    return {
      id: rng.uid(),
      name: facultyDef.name,
      dekan,
      color: FACULTY_COLORS[facultyIdx % FACULTY_COLORS.length]!,
      kafedralar,
    };
  });

  // Один предмет читается на многих специальностях — в каталоге он должен быть один раз.
  const seen = new Set<string>();
  const uniqueSubjects = subjects
    .filter((s) => (seen.has(s.fan) ? false : (seen.add(s.fan), true)))
    .sort((a, b) =>
      a.kafedra === b.kafedra ? a.fan.localeCompare(b.fan) : a.kafedra.localeCompare(b.kafedra),
    );

  // Сотрудники берут id из того же счётчика и продолжают ту же цепочку RNG,
  // поэтому строятся строго после факультетов — как в прототипе.
  const directory = buildEmployees(rng, faculties, me);

  return {
    faculties,
    subjects: uniqueSubjects,
    totals: computeTotals(faculties),
    me,
    directory,
  };
}

export function computeTotals(faculties: Faculty[]): UniversityTotals {
  let departments = 0;
  let teachers = 0;
  let students = 0;

  faculties.forEach((f) => {
    departments += f.kafedralar.length;
    f.kafedralar.forEach((k) => {
      teachers += k.oqituvchilar;
      k.mutaxassisliklar.forEach((s) =>
        s.guruhlar.forEach((g) => {
          students += g.students.length;
        }),
      );
    });
  });

  return { faculties: faculties.length, departments, teachers, students };
}

/** Число студентов на факультете / специальности — часто нужно на карточках. */
export function countFacultyStudents(faculty: Faculty): number {
  return faculty.kafedralar.reduce(
    (acc, k) =>
      acc +
      k.mutaxassisliklar.reduce(
        (sum, s) => sum + s.guruhlar.reduce((n, g) => n + g.students.length, 0),
        0,
      ),
    0,
  );
}

export function countSpecialityStudents(speciality: Speciality): number {
  return speciality.guruhlar.reduce((acc, g) => acc + g.students.length, 0);
}

export function countFacultySpecialities(faculty: Faculty): number {
  return faculty.kafedralar.reduce((acc, k) => acc + k.mutaxassisliklar.length, 0);
}
