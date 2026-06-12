import {
    Users,
    GraduationCap,
    UserCog,
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
    PlayCircle,
    Trophy,
    BarChart2,
    Calendar,
    LineChart,
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
    'Ruxsatlar tizimi',
] as const;

export const RESOURCES: Record<string, ResourceMeta> = {
    user:          { label: 'Foydalanuvchilar', href: '/users',       icon: Users,         section: 'Foydalanuvchilar' },
    teacher:       { label: "O'qituvchilar",    href: '/teachers',    icon: GraduationCap },
    tutor:         { label: 'Tyutorlar',        href: '/tutors',      icon: UserCog,       section: 'Foydalanuvchilar' },
    student:       { label: 'Talabalar',        href: '/students',    icon: GraduationCap },

    role:          { label: 'Rollar',           href: '/roles',       icon: Shield,        section: 'Ruxsatlar tizimi' },
    permission:    { label: 'Ruxsatlar',        href: '/permissions', icon: Key,           section: 'Ruxsatlar tizimi' },

    faculty:       { label: 'Fakultetlarni boshqarish', href: '/faculties', icon: Building2, section: 'Boshqaruv' },
    kafedra:       { label: 'Kafedralar',       href: '/kafedras',    icon: Layers },
    group:         { label: 'Guruhlar',         href: '/groups',      icon: UsersRound },
    subject:       { label: 'Fanlar',           href: '/subjects',    icon: BookOpen,      section: 'Boshqaruv' },
    sinf:          { label: 'Sinflar',          href: '/sinfs',       icon: GraduationCap, section: 'Boshqaruv' },
    academic_year: { label: "O'quv yili",       href: '/academic-years', icon: Calendar,   section: 'Boshqaruv' },

    quiz:          { label: 'Testlar',          href: '/quizzes',     icon: BookOpen,      section: 'Testlar' },
    active_quiz:   { label: 'Faol testlar',     href: '/active-quizzes', icon: PlayCircle, section: 'Testlar' },
    question:      { label: 'Savollar',         href: '/questions',   icon: FileQuestion,  section: 'Testlar' },
    result:        { label: 'Natijalar',        href: '/results',     icon: FileText,      section: 'Testlar' },
    yakuniy:       { label: 'Yakuniy',          href: '/yakuniy',     icon: ClipboardList, section: 'Testlar' },
    lesson:        { label: 'Darslar',          href: '/lessons',     icon: BookOpen },
    psychology:    { label: 'Psixologiya',      href: '/psychology',  icon: Brain,         section: 'Testlar' },
    psychology_results: { label: 'Psixologiya natijalari', href: '/psychology/results', icon: ClipboardList, section: 'Testlar' },
    resource:      { label: 'Resurslar',        href: '/resources',   icon: BookOpen },

    me:            { label: 'Profil' },
    statistics:    { label: 'Statistika', icon: LineChart },
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

const STUDENT_SECTIONS: SidebarSection[] = [
    {
        label: 'Test',
        items: [
            { name: 'Test ishlash', href: '/quiz-test', icon: PlayCircle },
            { name: 'Natijalar', href: '/results', icon: FileText },
            { name: 'Psixologiya', href: '/psychology/student', icon: Brain },
        ],
    },
];

export const buildSidebar = (
    permissions: ReadonlySet<string>,
    roleNames: ReadonlyArray<string>
): SidebarSection[] => {
    const isStudent = roleNames.some((r) => r.toLowerCase() === 'student');
    if (isStudent) return STUDENT_SECTIONS;

    const grouped: Record<string, SidebarItem[]> = {};

    for (const perm of permissions) {
        if (!perm.startsWith('read:')) continue;
        const resource = perm.slice('read:'.length);
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
