import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
    '': 'Bosh sahifa',
    dashboard: 'Boshqaruv paneli',
    users: 'Foydalanuvchilar',
    roles: 'Rollar va ruxsatlar',
    permissions: 'Ruxsatlar',
    teachers: "O'qituvchilar",
    employees: 'Xodimlar',
    'teacher-ranking': 'Reyting',
    faculties: 'Tuzilma',
    kafedras: 'Kafedralar',
    groups: 'Guruhlar',
    students: 'Talabalar',
    subjects: 'Fanlar',
    courses: 'Kurslar',
    lessons: 'Darslar',
    questions: 'Savollar banki',
    quizzes: 'Testlar',
    'active-quizzes': 'Faol testlar',
    'quiz-test': 'Test ishlash',
    results: 'Natijalar',
    psychology: 'Psixologiya',
    profile: 'Profil',
    'teacher-groups': 'Mening guruhlarim',
    'teacher-subjects': 'Mening fanlarim',
    admin: 'Boshqaruv',
};

const labelFor = (segment: string) =>
    ROUTE_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);

const CrumbBar = () => {
    const location = useLocation();
    const segments = location.pathname.split('/').filter(Boolean);

    // Build a trail: always start at "Bosh sahifa", then the first meaningful segment.
    const trail: { label: string; href: string }[] = [{ label: 'Bosh sahifa', href: '/' }];
    if (segments.length > 0) {
        trail.push({ label: labelFor(segments[0]), href: `/${segments[0]}` });
    }

    return (
        <div className="flex h-[52px] flex-none items-center justify-between gap-4 border-b border-border bg-card px-7">
            <div className="flex min-w-0 items-center gap-[5px] overflow-hidden">
                {trail.map((crumb, i) => {
                    const isLast = i === trail.length - 1;
                    return (
                        <div key={crumb.href} className="flex min-w-0 items-center gap-[5px]">
                            {i > 0 && <ChevronRight size={15} strokeWidth={2} className="flex-none text-[#C4C8DC]" />}
                            <Link
                                to={crumb.href}
                                className="max-w-[280px] truncate rounded-[7px] px-1.5 py-1 text-[13.5px] transition-colors hover:bg-[#F4F5FA]"
                                style={{
                                    fontWeight: isLast ? 700 : 500,
                                    color: isLast ? 'var(--foreground)' : 'var(--muted-foreground)',
                                }}
                            >
                                {crumb.label}
                            </Link>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CrumbBar;
