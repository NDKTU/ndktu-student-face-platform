import { useAuth } from '@/context/AuthContext';

/**
 * Ko'rinishni hal qiluvchi rollar.
 *
 * Bitta hisobda bir nechta rol bo'lishi mumkin: bootstrap admin `Admin` +
 * `Teacher` + `Student` rollarini birdan oladi. Shuning uchun:
 *  - agar foydalanuvchi ko'rinishni tanlagan bo'lsa (`activeRole`), faqat o'sha
 *    rol hisobga olinadi;
 *  - admin ko'rinishida `isTeacher`/`isStudent` yoqilmaydi, aks holda sahifalar
 *    ma'lumotni «o'ziniki» bo'yicha filtrlab, bo'sh ro'yxat ko'rsatadi.
 */
export const useRoleView = () => {
    const { user, activeRole } = useAuth();
    const scope = activeRole ? [activeRole] : (user?.roles ?? []);
    const has = (name: string) => scope.some((role) => role.name.toLowerCase() === name);

    const isAdmin = has('admin');
    return {
        isAdmin,
        isTeacher: !isAdmin && has('teacher'),
        isStudent: !isAdmin && has('student'),
    };
};
