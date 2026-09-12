/**
 * Bayt sonini o'qiladigan ko'rinishga keltiradi: `340 KB`, `1.2 MB`.
 *
 * Ilgari bu funksiya `FilesPage` va `FilePickerModal` da so'zma-so'z
 * takrorlangan edi; kurs kutubxonasi uchinchi nusxa bo'lardi.
 */
export const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
