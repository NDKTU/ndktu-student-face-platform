/**
 * Rolni tanish kaliti.
 *
 * Tizim rollari (admin, teacher, student) `code` bilan keladi — u
 * o'zgarmaydi, nomini esa admin «Rollar» sahifasida o'zgartira oladi.
 * Interfeysda yaratilgan rollarda kod yo'q, ular avvalgidek nomidan
 * taniladi (psixologik, tutor, ...). Bekendning `core/utils/roles.py::role_keys`
 * bilan bir xil qoida.
 */
export const roleKey = (role: { name: string; code?: string | null }): string =>
    role.code ?? role.name.trim().toLowerCase();

