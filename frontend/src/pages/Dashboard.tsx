import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { displayNameOf } from '@/lib/userDisplay';
import {
    Users,
    BookOpen,
    GraduationCap,
    CheckCircle,
    FileQuestion,
    Book,
    UserCheck,
    Building2,
    RefreshCw,
    ArrowUpRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/useIsMobile';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { userService } from '@/services/userService';
import { teacherService } from '@/services/teacherService';
import { studentService } from '@/services/studentService';
import { subjectService } from '@/services/subjectService';
import { quizService } from '@/services/quizService';
import { questionService } from '@/services/questionService';
import { resultService } from '@/services/resultService';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

/** Быстрые ссылки на основные разделы админки.
 *  Фабрика, а не константа: `t` на уровне модуля недоступен, и при смене
 *  языка список должен пересобираться. */
const quickLinks = (t: TFunction): { to: string; label: string; description: string; icon: React.ElementType }[] => [
    { to: '/users',              label: t('Foydalanuvchilar'),     description: t('Akkauntlar va rollarni boshqarish'),    icon: Users },
    { to: '/students',           label: t('Talabalar'),            description: t("Talabalar ro'yxati va guruhlari"),      icon: UserCheck },
    { to: '/teachers',           label: t("O'qituvchilar"),        description: t("O'qituvchilar va biriktirishlar"),      icon: GraduationCap },
    { to: '/faculties',          label: t('Fakultetlar'),          description: t("Tashkiliy tuzilma bo'limlari"),         icon: Building2 },
    { to: '/subjects',           label: t('Fanlar'),               description: t('Fanlar va kurslar katalogi'),           icon: Book },
    { to: '/questions',          label: t('Savollar banki'),       description: t('Test savollarini boshqarish'),          icon: FileQuestion },
    { to: '/quizzes',            label: t('Testlar'),              description: t('Testlarni yaratish va nazorat qilish'), icon: BookOpen },
    { to: '/results',            label: t('Natijalar'),            description: t('Topshirilgan testlar tahlili'),         icon: CheckCircle },
    { to: '/admin/eduplan-sync', label: t('EPMOS sinxronizatsiya'), description: t('Tashkiliy tuzilmani import qilish'),   icon: RefreshCw },
];

const Dashboard: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    // Diagramma o'qining kengligi class bilan boshqarilmaydi — son sifatida uzatiladi.
    const isNarrow = useIsMobile();

    const { data: users,     isLoading: isUsersLoading }     = useQuery({ queryKey: ['dashboard-users'],     queryFn: () => userService.getUsers(1, 1) });
    const { data: teachers,  isLoading: isTeachersLoading }  = useQuery({ queryKey: ['dashboard-teachers'],  queryFn: () => teacherService.getTeachers(1, 1) });
    const { data: students,  isLoading: isStudentsLoading }  = useQuery({ queryKey: ['dashboard-students'],  queryFn: () => studentService.getStudents(1, 1) });
    const { data: subjects,  isLoading: isSubjectsLoading }  = useQuery({ queryKey: ['dashboard-subjects'],  queryFn: () => subjectService.getSubjects(1, 1) });
    const { data: quizzes,   isLoading: isQuizzesLoading }   = useQuery({ queryKey: ['dashboard-quizzes'],   queryFn: () => quizService.getQuizzes({ page: 1, limit: 1 }) });
    const { data: questions, isLoading: isQuestionsLoading } = useQuery({ queryKey: ['dashboard-questions'], queryFn: () => questionService.getQuestions(1, 1) });
    const { data: results,   isLoading: isResultsLoading }   = useQuery({ queryKey: ['dashboard-results'],   queryFn: () => resultService.getResults({ page: 1, limit: 1 }) });

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return t('Xayrli tong');
        if (h < 18) return t('Xayrli kun');
        return t('Xayrli kech');
    };

    return (
        <div className="space-y-6">
            {/* Welcome header */}
            <PageHeader
                title={`${getGreeting()}, ${displayNameOf(user)}`}
                description={t("Universitet tizimidagi asosiy ko'rsatkichlar va bo'limlar.")}
            />

            <div className="grid items-stretch gap-6 xl:grid-cols-[2fr_1fr]">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">
                    <StatCard label={t("Talabalar")} value={students?.total ?? 0} icon={UserCheck} isLoading={isStudentsLoading} color="orange" description={t("Universitet talabalari")} />
                    <StatCard label={t("O'qituvchilar")} value={teachers?.total ?? 0} icon={GraduationCap} isLoading={isTeachersLoading} color="blue" description={t("Barcha kafedralar")} />
                    <StatCard label={t("Foydalanuvchilar")} value={users?.total ?? 0} icon={Users} isLoading={isUsersLoading} color="purple" description={t("Jami akkauntlar")} />
                    <StatCard label={t("Testlar")} value={quizzes?.total ?? 0} icon={BookOpen} isLoading={isQuizzesLoading} color="teal" description={t("Jami yaratilgan testlar")} />
                    <StatCard label={t("Fanlar")} value={subjects?.total ?? 0} icon={Book} isLoading={isSubjectsLoading} color="green" description={t("Fanlar katalogi")} />
                    <StatCard label={t("Savollar banki")} value={questions?.total ?? 0} icon={FileQuestion} isLoading={isQuestionsLoading} color="cyan" description={t("Jami savollar")} />
                </div>
                <section className="rounded-lg bg-card shadow-[var(--surface-shadow)]">
                    <h2 className="border-b border-border px-5 py-4 text-lg font-semibold">{t('Test natijalari')}</h2>
                    <div className="flex h-[calc(100%-61px)] flex-col items-center justify-center px-5 py-6 text-center">
                        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
                            <CheckCircle className="h-8 w-8" />
                        </span>
                        {isResultsLoading ? <div className="h-10 w-24 animate-pulse rounded bg-muted" /> :
                            <p className="text-4xl font-semibold tabular-nums">{(results?.total ?? 0).toLocaleString('uz-UZ')}</p>}
                        <p className="mt-2 text-sm text-muted-foreground">{t('Jami topshirilgan testlar')}</p>
                        <Link to="/results" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-primary/20">
                            {t("Natijalarni ko'rish")} <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </div>

            {/* Масштаб платформы одним взглядом */}
            <div className="rounded-lg bg-card shadow-[var(--surface-shadow)]">
                <h2 className="border-b border-border px-5 py-4 text-lg font-semibold text-foreground">{t("Platforma ko'lami")}</h2>
                <div className="h-72 w-full overflow-x-auto px-2 py-5 sm:px-5">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={[
                                { name: t('Talabalar'), value: students?.total ?? 0 },
                                { name: t("O'qituvchilar"), value: teachers?.total ?? 0 },
                                { name: t('Foydalanuvchilar'), value: users?.total ?? 0 },
                                { name: t('Fanlar'), value: subjects?.total ?? 0 },
                                { name: t('Savollar'), value: questions?.total ?? 0 },
                                { name: t('Testlar'), value: quizzes?.total ?? 0 },
                                { name: t('Natijalar'), value: results?.total ?? 0 },
                            ]}
                            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                axisLine={{ stroke: 'var(--border)' }}
                                tickLine={false}
                                interval="preserveStartEnd" minTickGap={10}
                            />
                            <YAxis
                                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                // Telefonda 52px o'qqa ketadigan joy diagrammaning 15% i edi.
                                width={isNarrow ? 34 : 52}
                                allowDecimals={false}
                                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                            />
                            <Tooltip
                                cursor={{ fill: 'color-mix(in srgb, var(--primary) 6%, transparent)' }}
                                contentStyle={{
                                    background: 'var(--popover)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--popover-foreground)',
                                    fontSize: 13,
                                }}
                                formatter={(value) => [value ?? 0, 'Soni']}
                            />
                            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={48}>
                                {['orange', 'blue', 'purple', 'green', 'cyan', 'teal', 'yellow'].map(color => (
                                    <Cell key={color} fill={`var(--stat-${color})`} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Quick links */}
            <div>
                <h2 className="mb-4 text-lg font-semibold text-foreground">{t("Tezkor o'tish")}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {quickLinks(t).map(({ to, label, description, icon: Icon }) => (
                        <Link
                            key={to}
                            to={to}
                            className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4 shadow-[var(--surface-shadow)] transition-colors hover:border-primary/40 hover:bg-accent"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-foreground">{label}</span>
                                <span className="block truncate text-xs text-muted-foreground">{description}</span>
                            </span>
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
