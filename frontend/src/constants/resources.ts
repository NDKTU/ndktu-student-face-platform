import {
    Users,
    FolderOpen,
    GraduationCap,
    Shield,
    Key,
    BookOpen,
    Brain,
    Building2,
    Layers,
    UsersRound,
    ClipboardList,
    ClipboardCheck,
    PlayCircle,
    // Trophy — «Reyting» uchun edi, bo'lim yashirilgan.
    BarChart2,
    Library,
    Database,
    Megaphone,
    RefreshCw,
    Award,
    BookMarked,
    UserCog,
    Network,
    SlidersHorizontal,
    ClipboardPen,
    MessageCircleQuestion,
    Timer,
    ChartColumnBig,
    ListChecks,
    HardDrive,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Ikonka rangi — mavzudagi `--stat-*` tokenlaridan biri. Ranglar mavzu
 * bilan birga o'zgaradi (to'q rejimda ochroq variantlari), shuning uchun
 * bu yerda hex emas, token nomi saqlanadi.
 */
export type IconTone =
    | 'teal'
    | 'blue'
    | 'cyan'
    | 'green'
    | 'orange'
    | 'yellow'
    | 'purple'
    | 'pink'
    | 'red';

export interface ResourceMeta {
    label: string;
    href?: string;
    icon?: LucideIcon;
    section?: string;
    /** Ikonka rangi; ko'rsatilmasa — neytral kulrang. */
    tone?: IconTone;
}

// Bo'limlar ish chastotasi bo'yicha: kundalik ish tepada, ma'lumotnomalar
// o'rtada, yiliga bir necha marta ochiladigan sozlamalar pastda. Ilgari
// bo'limlar jadvallar bo'yicha bo'lingandi va «Testlar» aralash quti edi:
// unda kurslar, uy vazifalari va fayllar ham turardi.
export const SIDEBAR_SECTION_ORDER = [
    'Umumiy',
    "O'quv jarayoni",
    'Baholash',
    "Ma'lumotnoma",
    'Tizim',
] as const;

export const RESOURCES: Record<string, ResourceMeta> = {
    user:          { label: 'Foydalanuvchilar', href: '/users',       icon: UserCog,       section: "Ma'lumotnoma", tone: 'blue' },
    teacher:       { label: "O'qituvchilar",    href: '/teachers',    icon: GraduationCap, section: "Ma'lumotnoma", tone: 'teal' },
    student:       { label: 'Talabalar',        href: '/students',    icon: Users,         section: "Ma'lumotnoma", tone: 'cyan' },

    announcement:  { label: "E'lonlar",         href: '/announcements', icon: Megaphone,   section: 'Tizim', tone: 'pink' },

    role:          { label: 'Rollar',           href: '/roles',       icon: Shield,        section: 'Tizim', tone: 'purple' },
    permission:    { label: 'Ruxsatlar',        href: '/permissions', icon: Key,           section: 'Tizim', tone: 'yellow' },

    // Пункт появляется у роли с правом read:eduplan (оно объявлено ручкой
    // статуса интеграции) и ведёт на экран синхронизации оргструктуры.
    // Живёт в «Tizim» — как системная настройка, а не ежедневный раздел.
    eduplan:       { label: 'EPMOS sinxronizatsiyasi', href: '/admin/eduplan-sync', icon: Database, section: 'Tizim', tone: 'blue' },
    // O'qituvchilarning fayl yuklash limitlari. `read:file_quota` faqat
    // adminda — o'qituvchi o'z limitini «Fayl kutubxonasi» sahifasida ko'radi.
    file_quota:    { label: 'Fayl yuklash limitlari', href: '/admin/file-quotas', icon: HardDrive, section: 'Tizim', tone: 'orange' },

    faculty:       { label: 'Fakultetlar',      href: '/faculties',   icon: Building2,     section: "Ma'lumotnoma", tone: 'purple' },
    kafedra:       { label: 'Kafedralar',       href: '/kafedras',    icon: Layers,        section: "Ma'lumotnoma", tone: 'blue' },
    speciality:    { label: 'Mutaxassisliklar', href: '/specialities', icon: Award,        section: "Ma'lumotnoma", tone: 'yellow' },
    // EPMOS ko'zgusi, faqat o'qish uchun. Ruxsati mutaxassislikniki bilan
    // bir xil: reja mutaxassislikning davomi.
    curriculum:    { label: "O'quv rejalar",    href: '/curriculums', icon: BookOpen,      section: "Ma'lumotnoma", tone: 'teal' },
    group:         { label: 'Guruhlar',         href: '/groups',      icon: UsersRound,    section: "Ma'lumotnoma", tone: 'cyan' },
    subject:       { label: 'Fanlar',           href: '/subjects',    icon: BookMarked,    section: "Ma'lumotnoma", tone: 'green' },
    course:        { label: 'Kurslar',          href: '/courses',     icon: Library,       section: "O'quv jarayoni", tone: 'teal' },

    quiz:          { label: 'Testlar',          href: '/quizzes',     icon: ClipboardPen,    section: 'Baholash', tone: 'blue' },
    active_quiz:   { label: 'Faol testlar',     href: '/active-quizzes', icon: Timer, section: 'Baholash', tone: 'green' },
    question:      { label: 'Savollar',         href: '/questions',   icon: MessageCircleQuestion,  section: 'Baholash', tone: 'purple' },
    result:        { label: 'Natijalar',        href: '/results',     icon: ChartColumnBig,      section: 'Baholash', tone: 'orange' },
    lesson:        { label: 'Darslar',          href: '/lessons',     icon: BookOpen, tone: 'teal' },
    file:          { label: 'Fayl kutubxonasi', href: '/files',       icon: FolderOpen,    section: "O'quv jarayoni", tone: 'yellow' },
    teacher_assignment: { label: 'Oʻquv yuklamasi', href: '/teacher-assignments', icon: ClipboardList, section: "O'quv jarayoni", tone: 'orange' },
    homework:      { label: 'Uy vazifalari',    href: '/homework',    icon: ClipboardCheck, section: "O'quv jarayoni", tone: 'green' },
    psychology:    { label: 'Psixologiya',      href: '/psychology',  icon: Brain,         section: 'Baholash', tone: 'pink' },
    psychology_results: { label: 'Psixologiya natijalari', href: '/psychology/results', icon: ClipboardList, section: 'Baholash', tone: 'purple' },

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
    /** Ikonka rangi; ko'rsatilmasa — neytral kulrang. */
    tone?: IconTone;
    /**
     * Yig'iluvchi guruh ichidagi punktlar. Bo'lsa — o'zi havola emas,
     * ochib-yopiladigan sarlavha (`href` faqat faol yo'lni aniqlash uchun).
     */
    children?: SidebarItem[];
}

export interface SidebarSection {
    label: string;
    items: SidebarItem[];
}

// «Reyting» ilgari shu yerda, Dashboard yonida turardi. U kundalik
// navigatsiya emas, o'qituvchilar ko'rsatkichi — shuning uchun «Baholash»
// bo'limiga ko'chdi (buildSidebar ichida, avvalgidek faqat adminda).
const ALWAYS_VISIBLE: SidebarSection = {
    label: 'Umumiy',
    items: [
        { name: 'Dashboard', href: '/', icon: BarChart2, tone: 'teal' },
    ],
};

// Profil sidebarda yo'q: u navbar'dagi profil menyusidan ochiladi.
const STUDENT_ALWAYS_VISIBLE: SidebarSection = {
    label: 'Umumiy',
    items: [
        { name: 'Dashboard', href: '/', icon: BarChart2, tone: 'teal' },
    ],
};

interface StudentSidebarItem extends SidebarItem {
    permission: string;
    /** Qaysi bo'limga tushadi. Ko'rsatilmasa — «Baholash». */
    section?: string;
}

export const SIDEBAR_RESOURCE_ORDER: string[] = [
    // O'quv jarayoni
    'course',
    'teacher_assignment',
    'homework',
    'lesson',
    'file',

    // Baholash
    'quiz',
    'question',
    'active_quiz',
    'result',
    'psychology',
    'psychology_results',

    // Ma'lumotnoma
    'user',
    'teacher',
    'student',
    'group',
    'subject',
    'faculty',
    'kafedra',
    'speciality',
    'curriculum',

    // Tizim
    'announcement',
    'role',
    'permission',
    'eduplan',
    'file_quota',
];

/**
 * Yig'iluvchi guruhlar: kalit — guruh nomi, qiymat — unga tushadigan
 * resurslar. Guruhda kamida ikkita punkt ko'rinsagina guruh yasaladi,
 * aks holda yagona punkt guruhsiz, o'z holicha chiqadi — bir punktli
 * ochib-yopiladigan sarlavha foydasiz.
 */
interface SidebarGroupSpec {
    name: string;
    icon: LucideIcon;
    section: string;
    resources: string[];
    /** Guruh sarlavhasi bosilganda ochiladigan sahifa. */
    href: string;
    /** Guruh ikonkasining rangi. */
    tone: IconTone;
}

export const SIDEBAR_GROUPS: SidebarGroupSpec[] = [
    {
        name: 'Testlar',
        icon: ListChecks,
        section: 'Baholash',
        resources: ['quiz', 'question', 'active_quiz'],
        href: '/quizzes',
        tone: 'blue',
    },
    {
        name: 'Psixologiya',
        icon: Brain,
        section: 'Baholash',
        resources: ['psychology', 'psychology_results'],
        href: '/psychology',
        tone: 'pink',
    },
    {
        name: 'Foydalanuvchilar',
        icon: UserCog,
        section: "Ma'lumotnoma",
        resources: ['user', 'teacher', 'student'],
        href: '/users',
        tone: 'blue',
    },
    {
        name: 'Tashkiliy tuzilma',
        icon: Network,
        section: "Ma'lumotnoma",
        resources: ['faculty', 'kafedra', 'speciality', 'curriculum'],
        href: '/faculties',
        tone: 'purple',
    },
    {
        name: 'Sozlamalar',
        icon: SlidersHorizontal,
        section: 'Tizim',
        resources: ['role', 'permission', 'eduplan', 'file_quota'],
        href: '/roles',
        tone: 'yellow',
    },
];

/** Guruh ichidagi punktning ko'rinadigan nomi (guruh nomi takrorlanmasligi uchun). */
const GROUPED_ITEM_LABELS: Record<string, string> = {
    quiz: "Testlar ro'yxati",
    psychology: 'Metodikalar',
    psychology_results: 'Natijalar',
    user: 'Barcha foydalanuvchilar',
};

// Student-only destinations that don't follow the generic read:<resource> ->
// RESOURCES[resource] convention (their route/permission differs from the
// admin/staff page for the same concept, e.g. quiz-taking vs quiz management).
const STUDENT_BESPOKE_ITEMS: StudentSidebarItem[] = [
    { name: 'Test ishlash', href: '/quiz-test', icon: PlayCircle, tone: 'green', permission: 'quiz_process:start_quiz' },
    { name: 'Psixologiya', href: '/psychology/student', icon: Brain, tone: 'pink', permission: 'read:psychology' },
    { name: "E'lonlar", href: '/announcements/student', icon: Megaphone, tone: 'pink', permission: 'announcement:feed', section: 'Umumiy' },
];

// Resources whose generic admin/staff destination shouldn't be surfaced to a
// plain student even if their role happens to have read access to it — either
// they have a dedicated, more appropriate page instead (see
// STUDENT_BESPOKE_ITEMS), or the permission is granted to students purely to
// unblock an API call (e.g. QuizTestPage's own active-quiz fetch) and was
// never meant to expose the admin management page itself.
//
// `file` — «Fayllar kutubxonasi» talabaga yopiq: u faylni faqat o'z
// qurilmasidan yuklaydi (App.tsx dagi FileLibraryRoute, bekendda
// FileLibraryExceptStudent).
const STUDENT_HIDDEN_RESOURCES = new Set(['psychology', 'psychology_results', 'active_quiz', 'announcement', 'file']);

const buildStudentSidebar = (permissions: ReadonlySet<string>): SidebarSection[] => {
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
            tone: meta.tone,
        });
    }

    for (const item of STUDENT_BESPOKE_ITEMS) {
        if (!permissions.has(item.permission)) continue;
        (grouped[item.section ?? 'Baholash'] ??= []).push({ name: item.name, href: item.href, icon: item.icon, tone: item.tone });
    }

    // «Umumiy» sikldan tashqarida yig'iladi: unda doimiy havolalar bor va
    // ularga ruxsatga bog'liq punktlar (masalan, e'lonlar) qo'shiladi.
    const sections: SidebarSection[] = [
        { ...STUDENT_ALWAYS_VISIBLE, items: [...STUDENT_ALWAYS_VISIBLE.items, ...(grouped['Umumiy'] ?? [])] },
    ];

    for (const sectionLabel of SIDEBAR_SECTION_ORDER) {
        if (sectionLabel === 'Umumiy') continue;
        const items = grouped[sectionLabel];
        if (items?.length) {
            sections.push({ label: sectionLabel, items });
        }
    }

    return sections;
};

// Пункты, которые не следуют правилу `read:<resource>` -> RESOURCES[resource]:
// у страницы своё право, не привязанное к CRUD справочника. Тот же приём, что
// и STUDENT_BESPOKE_ITEMS, только для сотрудников.
const STAFF_BESPOKE_ITEMS: {
    name: string;
    href: string;
    icon: LucideIcon;
    tone?: IconTone;
    permission: string;
    section: string;
    /** Shu nomli yig'iluvchi guruh ichiga tushadi. */
    group?: string;
}[] = [
    {
        name: 'HEMIS sinxronizatsiyasi',
        href: '/admin/hemis-sync',
        icon: RefreshCw,
        tone: 'cyan',
        permission: 'hemis_admin_sync',
        section: 'Tizim',
        group: 'Sozlamalar',
    },
];

// Ruxsati bo'lsa ham faqat admin ko'rinishida chiqadigan punktlar.
//
// `read:teacher_assignment` o'qituvchida ham uchraydi va bu to'g'ri: bekend
// unga yuklamaning o'z qatorlarinigina beradi (`teacher_assignment/
// repository.py` dagi `is_admin` shoxi). Lekin «O'quv yuklamasi» — EPOS
// ko'zgusi, ma'muriy ma'lumotnoma; o'qituvchining kundalik ishida u kerak
// emas va menyuni behuda to'ldiradi. Ruxsatni rolidan olib tashlash bilan
// hal qilib bo'lmaydi: u boshqa joyda ham asqotadi va seed hech qachon
// ruxsat OLIB TASHLAMAYDI (`core/lifespan/defaults.py`).
const ADMIN_ONLY_RESOURCES = new Set(['teacher_assignment']);

// Ruxsati bo'lsa ham o'qituvchi ko'rinishida chiqmaydigan punktlar.
//
// Psixologiya — psixolog xizmatining ishi: metodikalarni u tuzadi va
// natijalarni u o'qiydi (`psixologik` roli, `App.tsx` dagi
// DashboardRedirect o'shani `/psychology` ga olib boradi). O'qituvchining
// darsiga bu bo'lim aloqador emas, menyuda esa «Baholash» ichida ko'zga
// tashlanadigan guruh bo'lib turadi.
//
// «O'qituvchilar» — kadrlar ma'lumotnomasi: butun universitetning
// professor-o'qituvchilari, kafedrasi va biriktirmalari bilan. Bu ma'muriyat
// ishi; o'qituvchiga hamkasblarining ro'yxati kerak emas. O'zining
// ma'lumotlari Profil sahifasida (`teacher:me`).
//
// «Tashkiliy tuzilma» (fakultet, kafedra, mutaxassislik, o'quv reja) —
// ma'muriyat ma'lumotnomasi: uni EPOS/HEMIS to'ldiradi, platformada faqat
// o'qiladi. O'qituvchiga butun universitetning bo'linmalari kerak emas —
// guruhlari, kurslari va darslari o'z bo'limlarida. To'rttasi birdan
// yashiringani uchun yig'iluvchi guruhning o'zi ham chiqmaydi.
//
// `read:psychology`, `read:psychology_results`, `read:teacher` va tashkiliy
// tuzilma ruxsatlari ba'zi o'qituvchilarda baribir mavjud (qo'lda berilgan
// yoki eski migratsiyadan qolgan), roldan olib tashlash bilan ham hal
// bo'lmaydi: seed ruxsat OLIB TASHLAMAYDI (`core/lifespan/defaults.py`).
// Shuning uchun filtr shu yerda. Tashkiliy tuzilma uchun grantlar
// `b9d6f2a41c73` migratsiyasida ham o'chiriladi, endpointlar esa
// `PermissionRequiredExceptTeacher` bilan yopilgan.
//
// «Foydalanuvchilar» guruhida shundan keyin bitta punkt — «Talabalar» —
// qoladi va u guruhsiz, o'z holicha chiqadi (pastdagi bitta bolali guruhni
// yoyish qoidasi).
const TEACHER_HIDDEN_RESOURCES = new Set([
    'psychology',
    'psychology_results',
    'teacher',
    'faculty',
    'kafedra',
    'speciality',
    'curriculum',
]);

export const buildSidebar = (
    permissions: ReadonlySet<string>,
    roleNames: ReadonlyArray<string>
): SidebarSection[] => {
    const isStudent = roleNames.some((r) => r.toLowerCase() === 'student');
    if (isStudent) return buildStudentSidebar(permissions);

    const isAdmin = roleNames.some((r) => r.toLowerCase() === 'admin');
    // Faqat o'qituvchi ko'rinishi: admin yoki psixolog roli aralashgan
    // bo'lsa, ularning punktlari to'liq qoladi.
    const isTeacherOnly =
        !isAdmin &&
        roleNames.some((r) => r.toLowerCase() === 'teacher') &&
        !roleNames.some((r) => r.toLowerCase() === 'psixologik');

    // Qaysi resurs qaysi yig'iluvchi guruhga tegishli.
    const groupOf = new Map<string, SidebarGroupSpec>();
    for (const spec of SIDEBAR_GROUPS) {
        for (const resource of spec.resources) groupOf.set(resource, spec);
    }

    const grouped: Record<string, SidebarItem[]> = {};
    // Guruh nomi -> unga yig'ilgan bolalar. Guruhning bo'limdagi o'rni
    // birinchi ko'ringan bolasi bo'yicha belgilanadi, shuning uchun
    // joy-egallovchi (placeholder) darhol qo'yiladi.
    const groupChildren = new Map<string, SidebarItem[]>();

    const pushTo = (section: string, item: SidebarItem) => {
        (grouped[section] ??= []).push(item);
    };

    for (const resource of SIDEBAR_RESOURCE_ORDER) {
        if (!permissions.has(`read:${resource}`)) continue;
        if (!isAdmin && ADMIN_ONLY_RESOURCES.has(resource)) continue;
        if (isTeacherOnly && TEACHER_HIDDEN_RESOURCES.has(resource)) continue;
        const meta = RESOURCES[resource];
        if (!meta?.href || !meta.icon || !meta.section) continue;

        const spec = groupOf.get(resource);
        if (!spec) {
            pushTo(meta.section, { name: meta.label, href: meta.href, icon: meta.icon, tone: meta.tone });
            continue;
        }

        let children = groupChildren.get(spec.name);
        if (!children) {
            children = [];
            groupChildren.set(spec.name, children);
            // Guruh sarlavhasi shu yerda joy oladi; bolalari havolaga bog'liq.
            pushTo(spec.section, { name: spec.name, href: spec.href, icon: spec.icon, tone: spec.tone, children });
        }
        children.push({
            name: GROUPED_ITEM_LABELS[resource] ?? meta.label,
            href: meta.href,
            icon: meta.icon,
            tone: meta.tone,
        });
    }

    for (const item of STAFF_BESPOKE_ITEMS) {
        if (!permissions.has(item.permission)) continue;
        const entry = { name: item.name, href: item.href, icon: item.icon, tone: item.tone };
        const children = item.group ? groupChildren.get(item.group) : undefined;
        if (children) children.push(entry);
        else pushTo(item.section, entry);
    }

    // Bitta bolasi qolgan guruhni ochib-yopishning ma'nosi yo'q: uni
    // o'sha yagona punktning o'ziga almashtiramiz.
    for (const items of Object.values(grouped)) {
        for (let i = 0; i < items.length; i++) {
            const kids = items[i].children;
            if (kids && kids.length === 1) items[i] = kids[0];
        }
    }

    // «Reyting» vaqtincha yashirilgan (2026-09-16).
    //
    // Sabab ko'rinishda emas, hisobda: natijalar o'qituvchiga faqat GURUH
    // bo'yicha bog'lanadi (`auth/teacher/repository.py` dagi
    // `outerjoin(Result, Result.group_id == TeacherGroup.group_id)`), fan
    // hisobga olinmaydi. Ya'ni guruhdagi istalgan testning natijasi o'sha
    // guruhga biriktirilgan BARCHA o'qituvchilarga tushadi: o'lchanganda
    // bitta natija beshta o'qituvchining reytingiga kirdi.
    //
    // Bunday raqamga qarab kadrlar to'g'risida qaror qabul qilib bo'lmaydi,
    // shuning uchun hisob tuzatilgunicha bo'lim ko'rsatilmaydi. Sahifaning
    // o'zi (`pages/TeacherRankingPage.tsx`) va bekend hisoblagichi joyida
    // qoladi — qaytarish uchun shu yerdagi qator va `App.tsx` dagi marshrutni
    // tiklash kifoya.

    // «Dashboard» — `/`. O'qituvchi u yerda o'z dashboardini ko'radi
    // (`TeacherDashboardPage`). Psixolog roli aralashgan bo'lsa `/`
    // psixologiyaga yo'naltiradi (`DashboardRedirect`), shuning uchun u
    // holda punkt ko'rsatilmaydi — aks holda «Dashboard» boshqa sahifani ochardi.
    const isTeacher = roleNames.some((r) => r.toLowerCase() === 'teacher');
    const isPsixologik = roleNames.some((r) => r.toLowerCase() === 'psixologik');
    const showDashboard = isAdmin || (isTeacher && !isPsixologik);
    const sections: SidebarSection[] = showDashboard ? [ALWAYS_VISIBLE] : [];
    for (const sectionLabel of SIDEBAR_SECTION_ORDER) {
        if (sectionLabel === 'Umumiy') continue;
        const items = grouped[sectionLabel];
        if (items?.length) {
            sections.push({ label: sectionLabel, items });
        }
    }

    return sections;
};
