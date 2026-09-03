import type { User, UserRole } from '@/types/auth';

/**
 * Ekranda ko'rinadigan nom.
 *
 * O'qituvchi va talaba hisobining logini — HEMIS raqami (`3190111014`), u
 * foydalanuvchiga hech narsa anglatmaydi, shuning uchun ular uchun F.I.SH
 * ko'rsatiladi. Admin va boshqa xizmat hisoblarida F.I.SH yo'q — ularda login
 * o'zi tanish nom bo'lib qoladi.
 *
 * Ko'p rolli hisob (masalan Admin + Teacher + Student bitta `users.id` da) uchun
 * faol ko'rinish roli hal qiladi: admin ko'rinishida login, o'qituvchi
 * ko'rinishida F.I.SH.
 */
export const displayNameOf = (user?: User | null, activeRole?: UserRole | null): string => {
    if (!user) return 'User';

    const roleNames = (activeRole ? [activeRole] : (user.roles ?? [])).map((r) => r.name.toLowerCase());

    if (roleNames.includes('teacher')) {
        const teacherName =
            user.teacher?.full_name?.trim() ||
            `${user.teacher?.last_name ?? ''} ${user.teacher?.first_name ?? ''}`.trim();
        if (teacherName) return teacherName;
    }

    if (roleNames.includes('student')) {
        const studentName =
            user.student?.full_name?.trim() ||
            `${user.student?.last_name ?? ''} ${user.student?.first_name ?? ''}`.trim();
        if (studentName) return studentName;
    }

    return user.username || 'User';
};
