import type { Faculty, Speciality } from '../model/types';

/**
 * Счётчики по дереву структуры.
 *
 * Это разбор данных, а не их генерация: считают одинаково и по ответу сервера,
 * и по моку, поэтому живут рядом с типами, а не в мок-генераторе.
 */

/** Число студентов на факультете — сумма по всем его группам. */
export function countFacultyStudents(faculty: Faculty): number {
  return faculty.kafedralar.reduce(
    (acc, kafedra) =>
      acc +
      kafedra.mutaxassisliklar.reduce(
        (sum, speciality) => sum + countSpecialityStudents(speciality),
        0,
      ),
    0,
  );
}

export function countSpecialityStudents(speciality: Speciality): number {
  return speciality.guruhlar.reduce((acc, group) => acc + group.student_count, 0);
}

export function countFacultySpecialities(faculty: Faculty): number {
  return faculty.kafedralar.reduce((acc, kafedra) => acc + kafedra.mutaxassisliklar.length, 0);
}
