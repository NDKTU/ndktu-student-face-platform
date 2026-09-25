export const MB = 1024 * 1024;
export const GB = 1024 * MB;

/**
 * Bayt sonini o'qiladigan ko'rinishga keltiradi: `340 KB`, `1.2 MB`, `2.0 GB`.
 *
 * Ilgari bu funksiya `FilesPage` va `FilePickerModal` da so'zma-so'z
 * takrorlangan edi; kurs kutubxonasi uchinchi nusxa bo'lardi.
 * 1 GB = 1024 MB — backenddagi `quota.format_size` bilan bir xil.
 */
export const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
    return `${(bytes / GB).toFixed(1)} GB`;
};

export type SizeUnit = 'MB' | 'GB';

/** Limit maydoni uchun: baytni qulay birlikka ajratadi (1536 MB → 1.5 GB). */
export const splitSize = (bytes: number): { value: string; unit: SizeUnit } => {
    if (bytes >= GB && bytes % (GB / 10) === 0) {
        return { value: String(bytes / GB), unit: 'GB' };
    }
    return { value: String(Math.round((bytes / MB) * 10) / 10), unit: 'MB' };
};

/** Kiritilgan son va birlikdan bayt. Noto'g'ri qiymatda `null`. */
export const toBytes = (value: string, unit: SizeUnit): number | null => {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * (unit === 'GB' ? GB : MB));
};
