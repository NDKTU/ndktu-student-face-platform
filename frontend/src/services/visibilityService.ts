// Yashirish (visibility) funksiyasi 2026-09-11 da butunlay kommentga olindi.
// Spravochniklar — fakultet, kafedra, mutaxassislik, guruh, oʻquv reja, fan —
// EPOS/HEMIS maʼlumoti; ularni yashirish ham qoldirilmadi. Backendda
// `PATCH /{id}/visibility` va `include_hidden` filtri ham kommentda,
// bazadagi `is_hidden` ustuni esa ataylab joyida qoldi.
// Qaytarish uchun: shu fayl va uni chaqirgan sahifalardagi importlar bilan
// JSX kommentdan chiqariladi.
// import api from './api';
//
// /**
//  * Spravochnik yozuvini boshqa rollardan yashirish.
//  *
//  * Faqat admin uchun. Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida
//  * ham koʻrinmaydi — server filtri bitta joyda turgani uchun ikkalasi bir
//  * vaqtda qamrab olinadi. Eski maʼlumotga tegilmaydi: oʻtgan natijalar
//  * ochiladi, boshlangan test toʻxtamaydi.
//  *
//  * `is_active` bilan chalkashtirmaslik kerak — u EduPlan sinxronizatsiyasiniki
//  * va «manbada hali bormi» degan maʼnoni bildiradi.
//  */
//
// /** Yashirish qoʻllab-quvvatlanadigan spravochniklar. */
// export type HideableEntity = 'faculty' | 'kafedra' | 'group' | 'speciality' | 'subject';
//
// /** Har bir obyektning React Query kalitlari — yashirgandan keyin yangilanadi. */
// export const ENTITY_QUERY_KEYS: Record<HideableEntity, string[]> = {
//     faculty: ['faculties'],
//     kafedra: ['kafedras'],
//     group: ['groups'],
//     speciality: ['specialities'],
//     subject: ['subjects'],
// };
//
// export const visibilityService = {
//     setVisibility: async (entity: HideableEntity, id: number, isHidden: boolean) => {
//         const response = await api.patch<{ id: number; is_hidden: boolean }>(
//             `/${entity}/${id}/visibility`,
//             { is_hidden: isHidden },
//         );
//         return response.data;
//     },
// };
//