import type {
  Department,
  EduForm,
  Faculty,
  Group,
  RejaRow,
  Speciality,
} from '@/entities/university/model/types';
import { api } from './http';

/**
 * Граница до бэкенда для модуля «Tuzilma». Компоненты и стор ходят только сюда.
 * Формат ответов совпадает с типами сущностей, поэтому конвертация не нужна.
 */

export interface FacultyPayload {
  name?: string;
  dekan?: string;
}

export interface DepartmentPayload {
  name?: string;
  mudir?: string;
  oqituvchilar?: number;
}

export interface SpecialityPayload {
  name?: string;
  kod?: string;
  shakl?: EduForm;
  reja_yil?: string;
}

export interface GroupPayload {
  name?: string;
  kurs?: number;
  sardor?: string;
}

export interface RejaRowPayload {
  fan?: string;
  semestr?: number;
  kredit?: number;
  oqituvchi?: string;
}

export async function getTree(): Promise<Faculty[]> {
  const data = await api.get<{ faculties: Faculty[] }>('/tuzilma/tree');
  return data.faculties;
}

export const createFaculty = (body: FacultyPayload) =>
  api.post<Faculty>('/tuzilma/faculties', body);
export const updateFaculty = (id: number, body: FacultyPayload) =>
  api.patch<Faculty>(`/tuzilma/faculties/${id}`, body);
export const deleteFaculty = (id: number) => api.delete(`/tuzilma/faculties/${id}`);

export const createDepartment = (facultyId: number, body: DepartmentPayload) =>
  api.post<Department>(`/tuzilma/faculties/${facultyId}/departments`, body);
export const updateDepartment = (id: number, body: DepartmentPayload) =>
  api.patch<Department>(`/tuzilma/departments/${id}`, body);
export const deleteDepartment = (id: number) => api.delete(`/tuzilma/departments/${id}`);

export const createSpeciality = (departmentId: number, body: SpecialityPayload) =>
  api.post<Speciality>(`/tuzilma/departments/${departmentId}/specialities`, body);
export const updateSpeciality = (id: number, body: SpecialityPayload) =>
  api.patch<Speciality>(`/tuzilma/specialities/${id}`, body);
export const deleteSpeciality = (id: number) => api.delete(`/tuzilma/specialities/${id}`);

export const createGroup = (specialityId: number, body: GroupPayload) =>
  api.post<Group>(`/tuzilma/specialities/${specialityId}/groups`, body);
export const updateGroup = (id: number, body: GroupPayload) =>
  api.patch<Group>(`/tuzilma/groups/${id}`, body);
export const deleteGroup = (id: number) => api.delete(`/tuzilma/groups/${id}`);

export const createRejaRow = (specialityId: number, body: RejaRowPayload) =>
  api.post<RejaRow>(`/tuzilma/specialities/${specialityId}/reja`, body);
export const updateRejaRow = (rowId: number, body: RejaRowPayload) =>
  api.patch<RejaRow>(`/tuzilma/reja/${rowId}`, body);
export const deleteRejaRow = (rowId: number) => api.delete(`/tuzilma/reja/${rowId}`);

/** Без semestr чистит весь план специальности, с ним — один семестр. */
export const clearReja = (specialityId: number, semestr?: number) =>
  api.delete(
    `/tuzilma/specialities/${specialityId}/reja${semestr === undefined ? '' : `?semestr=${semestr}`}`,
  );
