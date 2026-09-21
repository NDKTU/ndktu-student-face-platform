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
        /**
         * Sof o'qituvchi ko'rinishi: ma'muriy bo'limlar shu holatda yopiladi.
         *
         * Psixolog roli aralashgan bo'lsa yopilmaydi — psixologiya natijalari
         * fakultet kesimida o'qiladi, ya'ni unga ma'lumotnoma kerak.
         * `constants/resources.ts` dagi `isTeacherOnly` bilan bir xil
         * hisoblanadi: menyu va marshrut bir-biriga zid javob bermasin.
         */
        isTeacherOnly: !isAdmin && has('teacher') && !has('psixologik'),
    };
};
