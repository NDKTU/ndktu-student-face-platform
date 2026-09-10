import type { User } from '@/types/auth';

/** Profil bo'lagidan F.I.SH: to'liq nomi, bo'lmasa familiya + ism. */
const nameFrom = (profile?: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null) => {
    if (!profile) return '';
    return (
        profile.full_name?.trim() ||
        `${profile.last_name ?? ''} ${profile.first_name ?? ''}`.trim()
    );
};

/**
 * Ekranda ko'rinadigan nom.
 *
 * O'qituvchi va talaba hisobining logini — HEMIS yoki EPMOS raqami
 * (`3342011368`), u odamga hech narsa anglatmaydi. Shuning uchun F.I.SH ma'lum
 * bo'lsa, doim o'sha ko'rsatiladi.
 *
 * Faol rol bu tanlovga ta'sir qilmaydi. Ilgari qilardi: ko'p rolli hisob
 * (bitta `users.id` da Admin + Teacher) admin ko'rinishiga o'tganda ekranda
 * ismi o'rniga raqam paydo bo'lardi — odam o'zgarmagan, faqat ko'rinish
 * almashgan bo'lsa ham. Rolning o'zi karta ichida alohida qatorda yozilgan,
 * shuning uchun uni nomga ham aralashtirish keraksiz.
 *
 * Login faqat oxirgi chora bo'lib qoladi: xizmat hisoblarida (masalan `admin`)
 * F.I.SH umuman yo'q, va u yerda login o'zi tanish nom.
 */
export const displayNameOf = (user?: User | null): string => {
    if (!user) return 'User';

    return nameFrom(user.teacher) || nameFrom(user.student) || user.username || 'User';
};
