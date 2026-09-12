import { useIsMobile } from './useIsMobile';

/**
 * Katalog roʻyxati qanday koʻrinishda chiqishi: jadval yoki kartochka.
 *
 * `md` (768px) dan pastda kartochka qaytaradi. Sabab: bu sahifalardagi
 * jadvallar 580–910px kenglikda — telefon ekranida ular gorizontal scroll
 * bo'lib qoladi va bir qatorda ikki-uchta so'z ko'rinadi.
 *
 * Kartochka shoxi sahifalarda allaqachon yozilgan edi (`CatalogGrid` /
 * `CatalogCard`), lekin `const [viewMode] = useState('table')` setter'siz
 * qotib qolgani uchun hech qachon ishga tushmasdi — shu hook uni jonlantiradi.
 */
export const useCatalogView = (): 'table' | 'grid' => (useIsMobile() ? 'grid' : 'table');
