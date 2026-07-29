import type { Faculty } from '@/entities/university/model/types';

/** Иерархия «факультет → мутахассислик → группа» для связанных селектов формы. */
export interface FacultyTree {
  name: string;
  specialities: { name: string; groups: string[] }[];
}

/**
 * Собирается из дерева структуры, которое страница и так грузит: отдельного
 * эндпоинта ради справочника групп заводить незачем, а раздел «Foydalanuvchilar»
 * видят те же роли, что и «Tuzilma».
 */
export function toFacultyTree(faculties: Faculty[]): FacultyTree[] {
  return faculties.map((faculty) => ({
    name: faculty.name,
    specialities: faculty.kafedralar.flatMap((department) =>
      department.mutaxassisliklar.map((speciality) => ({
        name: speciality.name,
        groups: speciality.guruhlar.map((g) => g.name),
      })),
    ),
  }));
}
