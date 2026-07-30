import { getAll, getList, type Paged } from './envelope';

/**
 * Граница до бэкенда для рейтингов.
 *
 * Бэкенд считает три отдельных рейтинга — по преподавателям, факультетам и
 * кафедрам — и в каждом отдаёт две оценки: `avg_grade` (обычное среднее) и
 * `weighted_rating` (байесовская поправка на число студентов). Показываем
 * взвешенную, иначе преподаватель с тремя пятёрками обошёл бы того, у кого сто
 * студентов и средняя 4.7.
 */

export interface TeacherRank {
  rank: number;
  teacherId: number;
  fish: string;
  kafedra: string;
  fakultet: string;
  talabalar: number;
  ortacha: number;
  reyting: number;
}

export interface FacultyRank {
  rank: number;
  facultyId: number;
  fakultet: string;
  kafedralar: number;
  talabalar: number;
  ortacha: number;
  reyting: number;
}

export interface KafedraRank {
  rank: number;
  kafedraId: number;
  kafedra: string;
  fakultet: string;
  oqituvchilar: number;
  talabalar: number;
  ortacha: number;
  reyting: number;
}

interface ApiTeacherRank {
  rank: number;
  teacher_id: number;
  full_name: string;
  kafedra_name: string | null;
  faculty_name: string | null;
  student_count: number;
  avg_grade: number;
  weighted_rating: number;
}

interface ApiFacultyRank {
  rank: number;
  faculty_id: number;
  faculty_name: string;
  kafedra_count: number;
  student_count: number;
  avg_grade: number;
  weighted_rating: number;
}

interface ApiKafedraRank {
  rank: number;
  kafedra_id: number;
  kafedra_name: string;
  faculty_name: string;
  teacher_count: number;
  student_count: number;
  avg_grade: number;
  weighted_rating: number;
}

export interface RankingFilters {
  facultyId?: number;
  kafedraId?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export async function getTeacherRanking(filters: RankingFilters = {}): Promise<Paged<TeacherRank>> {
  const page = await getList<ApiTeacherRank>('/teacher/ranking/overall', 'teachers', {
    faculty_id: filters.facultyId,
    kafedra_id: filters.kafedraId,
    search: filters.search,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
  });

  return {
    ...page,
    items: page.items.map((item) => ({
      rank: item.rank,
      teacherId: item.teacher_id,
      fish: item.full_name,
      kafedra: item.kafedra_name ?? '',
      fakultet: item.faculty_name ?? '',
      talabalar: item.student_count,
      ortacha: item.avg_grade,
      reyting: item.weighted_rating,
    })),
  };
}

export async function getFacultyRanking(page = 1, limit = 20): Promise<Paged<FacultyRank>> {
  const data = await getList<ApiFacultyRank>('/teacher/ranking/faculty', 'faculties', {
    page,
    limit,
  });

  return {
    ...data,
    items: data.items.map((item) => ({
      rank: item.rank,
      facultyId: item.faculty_id,
      fakultet: item.faculty_name,
      kafedralar: item.kafedra_count,
      talabalar: item.student_count,
      ortacha: item.avg_grade,
      reyting: item.weighted_rating,
    })),
  };
}

export async function getKafedraRanking(page = 1, limit = 20): Promise<Paged<KafedraRank>> {
  const data = await getList<ApiKafedraRank>('/teacher/ranking/kafedra', 'kafedras', {
    page,
    limit,
  });

  return {
    ...data,
    items: data.items.map((item) => ({
      rank: item.rank,
      kafedraId: item.kafedra_id,
      kafedra: item.kafedra_name,
      fakultet: item.faculty_name,
      oqituvchilar: item.teacher_count,
      talabalar: item.student_count,
      ortacha: item.avg_grade,
      reyting: item.weighted_rating,
    })),
  };
}

/**
 * Справочники для фильтров вкладки преподавателей.
 *
 * Живут здесь, а не в `tuzilma.ts`: там `getTree()` тянет всё дерево вплоть до
 * групп, а для двух выпадающих списков нужны только имена. Права на них
 * отдельные (`read:faculty`, `read:kafedra`) — у того, кто смотрит рейтинг, их
 * может не быть, и тогда экран просто обходится поиском по имени.
 */
export interface RefOption {
  id: number;
  name: string;
  facultyId?: number;
}

export async function getFacultyOptions(): Promise<RefOption[]> {
  const rows = await getAll<{ id: number; name: string }>('/faculty/', 'faculties');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function getKafedraOptions(): Promise<RefOption[]> {
  const rows = await getAll<{ id: number; name: string; faculty_id: number }>(
    '/kafedra/',
    'kafedras',
  );
  return rows.map((row) => ({ id: row.id, name: row.name, facultyId: row.faculty_id }));
}
