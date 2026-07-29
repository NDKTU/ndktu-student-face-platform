import type { FanRow } from '@/features/fanlar/model/fanlar.store';
import { api } from './http';

/**
 * Граница до бэкенда для модуля «Fanlar». Ответы уже в форме FanRow, поэтому
 * конвертация не нужна.
 */

export interface FanPayload {
  fan?: string;
  kafedra?: string;
  kredit?: string;
  kod?: string;
  tavsif?: string;
}

export const getFanlar = () => api.get<FanRow[]>('/fanlar');
export const createFan = (body: FanPayload) => api.post<FanRow>('/fanlar', body);
export const updateFan = (id: number, body: FanPayload) => api.patch<FanRow>(`/fanlar/${id}`, body);
export const deleteFan = (id: number) => api.delete(`/fanlar/${id}`);
