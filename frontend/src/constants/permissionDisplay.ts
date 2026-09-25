import { ACTION_LABELS, RESOURCES, parsePermission, type Action } from './resources';

// Presentation only: permission names and IDs sent to the API stay unchanged.
const SPECIAL_PERMISSIONS: Record<string, { resource: string; label: string }> = {
    'announcement:feed': { resource: 'announcement', label: "E'lonlar lentasini ko'rish" },
    'announcement:register': { resource: 'announcement', label: "E'longa ro'yxatdan o'tish yoki bekor qilish" },
    'read:announcement_registration': { resource: 'announcement', label: "Ro'yxatdan o'tganlarni ko'rish" },
    'quiz_process:start_quiz': { resource: 'quiz', label: 'Testni boshlash' },
    'quiz_process:submit_answer': { resource: 'quiz', label: 'Test javobini yuborish' },
    'quiz_process:end_quiz': { resource: 'quiz', label: 'Testni yakunlash' },
    'user_answers:read': { resource: 'result', label: "Test javoblarini ko'rish" },
    'user:me': { resource: 'me', label: "O'z profilini ko'rish va boshqarish" },
    'teacher:me': { resource: 'me', label: "O'z o'qituvchi profilini ko'rish va tahrirlash" },
    'student:me': { resource: 'me', label: "O'z talaba dashboardini ko'rish" },
    'attendance:me': { resource: 'attendance', label: "O'z davomatini ko'rish" },
    'read:attendance': { resource: 'attendance', label: "Davomatni ko'rish" },
    'mark:attendance': { resource: 'attendance', label: 'Davomatni belgilash' },
    hemis_admin_preview: { resource: 'hemis', label: "Ma'lumotlarni oldindan ko'rish" },
    hemis_admin_sync: { resource: 'hemis', label: "Ma'lumotlarni sinxronlashtirish" },
    'create:submission': { resource: 'homework', label: 'Uy vazifasi javobini topshirish' },
    'read:submission': { resource: 'homework', label: "Topshirilgan javoblarni ko'rish" },
    'update:submission': { resource: 'homework', label: 'Topshirilgan javoblarni baholash' },
    'create:resource': { resource: 'lesson', label: "Dars materialini qo'shish" },
    'read:resource': { resource: 'lesson', label: "Dars materiallarini ko'rish" },
    'update:resource': { resource: 'lesson', label: 'Dars materialini tahrirlash' },
    'delete:resource': { resource: 'lesson', label: "Dars materialini o'chirish" },
};

const GROUP_LABELS: Record<string, string> = {
    attendance: 'Davomat',
    hemis: 'HEMIS sinxronizatsiyasi',
    me: 'Shaxsiy profil',
    submission: 'Uy vazifasi javoblari',
    resource: 'Dars materiallari',
    boshqa: 'Tizim amallari',
};

export const permissionGroupLabel = (resource: string): string =>
    GROUP_LABELS[resource] ?? RESOURCES[resource]?.label ?? 'Tizim amallari';

export const permissionDisplay = (name: string) => {
    const special = SPECIAL_PERMISSIONS[name];
    if (special) return { ...special, key: name, requiresRead: false };

    const { action, resource } = parsePermission(name);
    return {
        resource,
        key: action,
        label: ACTION_LABELS[action as Action]
            ?? (action === 'sync' ? "Ma'lumotlarni sinxronlashtirish" : 'Amalni bajarish'),
        requiresRead: true,
    };
};
