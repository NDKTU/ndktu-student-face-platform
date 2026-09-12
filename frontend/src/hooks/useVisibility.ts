// Yashirish (visibility) funksiyasi 2026-09-11 da butunlay kommentga olindi.
// Spravochniklar — fakultet, kafedra, mutaxassislik, guruh, oʻquv reja, fan —
// EPOS/HEMIS maʼlumoti; ularni yashirish ham qoldirilmadi. Backendda
// `PATCH /{id}/visibility` va `include_hidden` filtri ham kommentda,
// bazadagi `is_hidden` ustuni esa ataylab joyida qoldi.
// Qaytarish uchun: shu fayl va uni chaqirgan sahifalardagi importlar bilan
// JSX kommentdan chiqariladi.
// import { useMutation, useQueryClient } from '@tanstack/react-query';
// import {
//     ENTITY_QUERY_KEYS,
//     visibilityService,
//     type HideableEntity,
// } from '@/services/visibilityService';
//
// /**
//  * Spravochnik yozuvini yashirish yoki qaytarish.
//  *
//  * Bitta hook barcha obyektlar uchun: fakultet, kafedra, guruh, mutaxassislik,
//  * fan. Har biri uchun alohida hook yozilsa, ular vaqt oʻtib bir-biridan
//  * ajralib ketardi.
//  */
// export const useSetVisibility = (entity: HideableEntity) => {
//     const queryClient = useQueryClient();
//
//     return useMutation({
//         mutationFn: ({ id, isHidden }: { id: number; isHidden: boolean }) =>
//             visibilityService.setVisibility(entity, id, isHidden),
//         onSuccess: () => {
//             for (const key of ENTITY_QUERY_KEYS[entity]) {
//                 queryClient.invalidateQueries({ queryKey: [key] });
//             }
//         },
//     });
// };
//