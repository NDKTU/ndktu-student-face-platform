import {
    Users,
    FolderOpen,
    GraduationCap,
    Shield,
    Key,
    BookOpen,
    FileQuestion,
    FileText,
    Brain,
    Building2,
    Layers,
    UsersRound,
    ClipboardList,
    ClipboardCheck,
    PlayCircle,
    Trophy,
    BarChart2,
    User,
    Library,
    Database,
    Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ResourceMeta {
    label: string;
    href?: string;
    icon?: LucideIcon;
    section?: string;
}

export const SIDEBAR_SECTION_ORDER = [
    'Umumiy',
    'Boshqaruv',
    'Foydalanuvchilar',
    'Testlar',
    'Psixologiya',
    'Ruxsatlar tizimi',
    'Sozlamalar',
] as const;

export const RESOURCES: Record<string, ResourceMeta> = {
    user:          { label: 'Foydalanuvchilar', href: '/users',       icon: Users,         section: 'Foydalanuvchilar' },
    teacher:       { label: "O'qituvchilar",    href: '/teachers',    icon: GraduationCap, section: 'Foydalanuvchilar' },
    student:       { label: 'Talabalar',        href: '/students',    icon: GraduationCap, section: 'Foydalanuvchilar' },

    role:          { label: 'Rollar',           href: '/roles',       icon: Shield,        section: 'Ruxsatlar tizimi' },
    permission:    { label: 'Ruxsatlar',        href: '/permissions', icon: Key,           section: 'Ruxsatlar tizimi' },

    // Пункт появляется у роли с правом read:eduplan (оно объявлено ручкой
    // статуса интеграции) и ведёт на экран синхронизации оргструктуры.
    // Живёт в «Sozlamalar» — как системная настройка, а не ежедневный раздел.
    eduplan:       { label: 'EduPlan sinxronizatsiyasi', href: '/admin/eduplan-sync', icon: Database, section: 'Sozlamalar' },

    faculty:       { label: 'Fakultetlar',      href: '/faculties',   icon: Building2,     section: 'Boshqaruv' },
    kafedra:       { label: 'Kafedralar',       href: '/kafedras',    icon: Layers,        section: 'Boshqaruv' },
    speciality:    { label: 'Mutaxassisliklar', href: '/specialities', icon: GraduationCap, section: 'Boshqaruv' },
    group:         { label: 'Guruhlar',         href: '/groups',      icon: UsersRound,    section: 'Boshqaruv' },
    subject:       { label: 'Fanlar',           href: '/subjects',    icon: BookOpen,      section: 'Testlar' },
    course:        { label: 'Kurslar',          href: '/courses',     icon: Library,       section: 'Testlar' },

    quiz:          { label: 'Testlar',          href: '/quizzes',     icon: BookOpen,      section: 'Testlar' },
    active_quiz:   { label: 'Faol testlar',     href: '/active-quizzes', icon: PlayCircle, section: 'Testlar' },
    question:      { label: 'Savollar',         href: '/questions',   icon: FileQuestion,  section: 'Testlar' },
    result:        { label: 'Natijalar',        href: '/results',     icon: FileText,      section: 'Testlar' },
    lesson:        { label: 'Darslar',          href: '/lessons',     icon: BookOpen },
    file:          { label: 'Fayl kutubxonasi', href: '/files',       icon: FolderOpen,    section: 'Testlar' },
    teacher_assignment: { label: 'Oʻquv yuklamasi', href: '/teacher-assignments', icon: ClipboardList, section: 'Boshqaruv' },
    homework:      { label: 'Uy vazifalari',    href: '/homework',    icon: ClipboardCheck, section: 'Testlar' },
    psychology:    { label: 'Psixologiya',      href: '/psychology',  icon: Brain,         section: 'Psixologiya' },
    psychology_results: { label: 'Psixologiya natijalari', href: '/psychology/results', icon: ClipboardList, section: 'Psixologiya' },

    me:            { label: 'Profil' },
    quiz_process:  { label: 'Test jarayoni' },
    user_answers:  { label: 'Foydalanuvchi javoblari' },
    lesson_result: { label: 'Dars natijalari' },
};

export const ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
    read: "Ko'rish",
    create: "Qo'shish",
    update: 'Tahrirlash',
    delete: "O'chirish",
};

export const labelFor = (resource: string): string =>
    RESOURCES[resource]?.label ?? resource.charAt(0).toUpperCase() + resource.slice(1);

export const parsePermission = (
    name: string
): { action: string; resource: string } => {
    const [action, ...rest] = name.split(':');
    return { action, resource: rest.join(':').toLowerCase() || 'boshqa' };
};

export interface SidebarItem {
    name: string;
    href: string;
    icon: LucideIcon;
}

export interface SidebarSection {
    label: string;
    items: SidebarItem[];
}

const ALWAYS_VISIBLE: SidebarSection = {
    label: 'Umumiy',
    items: [
        { name: 'Dashboard', href: '/', icon: BarChart2 },
        { name: 'Reyting', href: '/teacher-ranking', icon: Trophy },
    ],
};

const STUDENT_ALWAYS_VISIBLE: SidebarSection = {
    label: 'Umumiy',
    items: [
        { name: 'Bosh sahifa', href: '/', icon: Home },
        { name: 'Profil', href: '/profile', icon: User },
    ],
};

interface StudentSidebarItem extends SidebarItem {
    permission: string;
}

export const SIDEBAR_RESOURCE_ORDER: string[] = [
    // Boshqaruv
    'faculty',
    'kafedra',
    'speciality',
    'group',
    'teacher_assignment',

    // Foydalanuvchilar
    'user',
    'teacher',
    'student',

    // Testlar
    'subject',
    'question',
    'quiz',
    'result',
    'course',
    'homework',
    'active_quiz',
    'lesson',
    'file',

    // Psixologiya
    'psychology',
    'psychology_results',

    // Ruxsatlar tizimi
    'role',
    'permission',

    // Sozlamalar
    'eduplan',
];

// Student-only destinations that don't follow the generic read:<resource> ->
// RESOURCES[resource] convention (their route/permission differs from the
// admin/staff page for the same concept, e.g. quiz-taking vs quiz management).
const STUDENT_BESPOKE_ITEMS: StudentSidebarItem[] = [
    { name: 'Test ishlash', href: '/quiz-test', icon: PlayCircle, permission: 'quiz_process:start_quiz' },
    { name: 'Psixologiya', href: '/psychology/student', icon: Brain, permission: 'read:psychology' },
];

// Resources whose generic admin/staff destination shouldn't be surfaced to a
// plain student even if their role happens to have read access to it — either
// they have a dedicated, more appropriate page instead (see
// STUDENT_BESPOKE_ITEMS), or the permission is granted to students purely to
// unblock an API call (e.g. QuizTestPage's own active-quiz fetch) and was
// never meant to expose the admin management page itself.
const STUDENT_HIDDEN_RESOURCES = new Set(['psychology', 'psychology_results', 'active_quiz']);

const buildStudentSidebar = (permissions: ReadonlySet<string>): SidebarSection[] => {
    const sections: SidebarSection[] = [STUDENT_ALWAYS_VISIBLE];
    const grouped: Record<string, SidebarItem[]> = {};

    for (const resource of SIDEBAR_RESOURCE_ORDER) {
        if (!permissions.has(`read:${resource}`)) continue;
        if (STUDENT_HIDDEN_RESOURCES.has(resource)) continue;
        const meta = RESOURCES[resource];
        if (!meta?.href || !meta.icon || !meta.section) continue;

        (grouped[meta.section] ??= []).push({
            name: meta.label,
            href: meta.href,
            icon: meta.icon,
        });
    }

    for (const item of STUDENT_BESPOKE_ITEMS) {
        if (!permissions.has(item.permission)) continue;
        (grouped['Testlar'] ??= []).push({ name: item.name, href: item.href, icon: item.icon });
    }

    for (const sectionLabel of SIDEBAR_SECTION_ORDER) {
        if (sectionLabel === 'Umumiy') continue;
        const items = grouped[sectionLabel];
        if (items?.length) {
            sections.push({ label: sectionLabel, items });
        }
    }

    return sections;
};

export const buildSidebar = (
    permissions: ReadonlySet<string>,
    roleNames: ReadonlyArray<string>
): SidebarSection[] => {
    const isStudent = roleNames.some((r) => r.toLowerCase() === 'student');
    if (isStudent) return buildStudentSidebar(permissions);

    const grouped: Record<string, SidebarItem[]> = {};

    for (const resource of SIDEBAR_RESOURCE_ORDER) {
        if (!permissions.has(`read:${resource}`)) continue;
        const meta = RESOURCES[resource];
        if (!meta?.href || !meta.icon || !meta.section) continue;

        (grouped[meta.section] ??= []).push({
            name: meta.label,
            href: meta.href,
            icon: meta.icon,
        });
    }

    const isAdmin = roleNames.some((r) => r.toLowerCase() === 'admin');
    const sections: SidebarSection[] = isAdmin ? [ALWAYS_VISIBLE] : [];
    for (const sectionLabel of SIDEBAR_SECTION_ORDER) {
        if (sectionLabel === 'Umumiy') continue;
        const items = grouped[sectionLabel];
        if (items?.length) {
            sections.push({ label: sectionLabel, items });
        }
    }

    return sections;
};
