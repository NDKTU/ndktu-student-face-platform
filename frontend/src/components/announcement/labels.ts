import type { Announcement, AnnouncementStatus, AudienceKind } from '@/services/announcementService';

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
    draft: 'Qoralama',
    published: 'Chop etilgan',
    archived: 'Arxiv',
};

export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
    all: 'Barcha talabalar',
    faculty: 'Fakultet',
    group: 'Guruh',
    level: 'Kurs',
};

/** «Guruh: 3 ta» ko'rinishidagi qisqa tavsif — jadval va kartochka uchun. */
export const audienceLabel = (announcement: Announcement): string => {
    if (announcement.audience_kind === 'all') return AUDIENCE_LABELS.all;
    const count = announcement.audience_values?.length ?? 0;
    return `${AUDIENCE_LABELS[announcement.audience_kind]}: ${count} ta`;
};

/**
 * `datetime-local` maydoni uchun qiymat. Server ISO ni +05:00 bilan qaytaradi,
 * input esa mahalliy vaqtni zonasiz kutadi.
 */
export const toLocalInput = (iso?: string | null): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * `datetime-local` dan serverga. Zonasiz satr `Date` ga mahalliy vaqt sifatida
 * o'qiladi va UTC ga o'giriladi — aks holda server uni UTC deb qabul qilib,
 * tadbir vaqti besh soatga siljib ketardi.
 */
export const toIsoOrNull = (local: string): string | null => {
    if (!local) return null;
    const date = new Date(local);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
