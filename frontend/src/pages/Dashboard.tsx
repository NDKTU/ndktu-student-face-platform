/**
 * Dashboard.tsx — Redesigned
 *
 * Design decisions:
 * - PageHeader with greeting; logout lives in the Navbar profile dropdown.
 * - StatCard: flat border card, compact icon pill (shared component, as-is).
 * - Вместо фейкового «статуса системы» и маркетингового виджета — честная
 *   сетка быстрых ссылок на основные разделы админки. Графиков нет: хуки
 *   дашборда отдают только total-счётчики, разбивок на клиенте нет.
 */
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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { userService } from '@/services/userService';
import { teacherService } from '@/services/teacherService';
import { studentService } from '@/services/studentService';
import { subjectService } from '@/services/subjectService';
import { quizService } from '@/services/quizService';
import { questionService } from '@/services/questionService';
import { resultService } from '@/services/resultService';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';

/** Быстрые ссылки на основные разделы админки. */
const QUICK_LINKS: { to: string; label: string; description: string; icon: React.ElementType }[] = [
    { to: '/users',              label: 'Foydalanuvchilar',        description: "Akkauntlar va rollarni boshqarish",     icon: Users },
    { to: '/students',           label: 'Talabalar',               description: "Talabalar ro'yxati va guruhlari",       icon: UserCheck },
    { to: '/teachers',           label: "O'qituvchilar",           description: "O'qituvchilar va biriktirishlar",       icon: GraduationCap },
    { to: '/faculties',          label: 'Fakultetlar',             description: "Tashkiliy tuzilma bo'limlari",          icon: Building2 },
    { to: '/subjects',           label: 'Fanlar',                  description: "Fanlar va kurslar katalogi",            icon: Book },
    { to: '/questions',          label: 'Savollar banki',          description: "Test savollarini boshqarish",           icon: FileQuestion },
    { to: '/quizzes',            label: 'Testlar',                 description: "Testlarni yaratish va nazorat qilish",  icon: BookOpen },
    { to: '/results',            label: 'Natijalar',               description: "Topshirilgan testlar tahlili",          icon: CheckCircle },
    { to: '/admin/eduplan-sync', label: 'EduPlan sinxronizatsiya', description: "Tashkiliy tuzilmani import qilish",     icon: RefreshCw },
];

const Dashboard: React.FC = () => {
    const { user, activeRole } = useAuth();

    const { data: users,     isLoading: isUsersLoading }     = useQuery({ queryKey: ['dashboard-users'],     queryFn: () => userService.getUsers(1, 1) });
    const { data: teachers,  isLoading: isTeachersLoading }  = useQuery({ queryKey: ['dashboard-teachers'],  queryFn: () => teacherService.getTeachers(1, 1) });
    const { data: students,  isLoading: isStudentsLoading }  = useQuery({ queryKey: ['dashboard-students'],  queryFn: () => studentService.getStudents(1, 1) });
    const { data: subjects,  isLoading: isSubjectsLoading }  = useQuery({ queryKey: ['dashboard-subjects'],  queryFn: () => subjectService.getSubjects(1, 1) });
    const { data: quizzes,   isLoading: isQuizzesLoading }   = useQuery({ queryKey: ['dashboard-quizzes'],   queryFn: () => quizService.getQuizzes({ page: 1, limit: 1 }) });
    const { data: questions, isLoading: isQuestionsLoading } = useQuery({ queryKey: ['dashboard-questions'], queryFn: () => questionService.getQuestions(1, 1) });
    const { data: results,   isLoading: isResultsLoading }   = useQuery({ queryKey: ['dashboard-results'],   queryFn: () => resultService.getResults({ page: 1, limit: 1 }) });

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Xayrli tong';
        if (h < 18) return 'Xayrli kun';
        return 'Xayrli kech';
    };

    return (
        <div className="space-y-6">
            {/* Welcome header */}
            <PageHeader
                title={`${getGreeting()}, ${displayNameOf(user, activeRole)}`}
                description="Universitet tizimidagi asosiy ko'rsatkichlar va bo'limlar."
            />

            {/* Primary stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Foydalanuvchilar"  value={users?.total ?? 0}    icon={Users}        isLoading={isUsersLoading}    color="blue"   description="Tizimda faol" />
                <StatCard label="Talabalar"          value={students?.total ?? 0} icon={UserCheck}    isLoading={isStudentsLoading} color="purple" description="Faol o'qiyotganlar" />
                <StatCard label="O'qituvchilar"      value={teachers?.total ?? 0} icon={GraduationCap} isLoading={isTeachersLoading} color="cyan"  description="Barcha kafedralar" />
                <StatCard label="Faol testlar"       value={quizzes?.total ?? 0} icon={BookOpen}     isLoading={isQuizzesLoading}  color="pink"   description="Talabalar uchun ochiq" />
            </div>

            {/* Secondary stats */}
            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Savollar banki"   value={questions?.total ?? 0} icon={FileQuestion} isLoading={isQuestionsLoading} color="orange" description="Jami savollar" />
                <StatCard label="Fanlar"            value={subjects?.total ?? 0}  icon={Book}         isLoading={isSubjectsLoading}  color="green"  description="Faol kurslar" />
                <StatCard label="Yakunlangan testlar" value={results?.total ?? 0} icon={CheckCircle}  isLoading={isResultsLoading}   color="blue"   description="Jami topshirilganlar" />
            </div>

            {/* Масштаб платформы одним взглядом */}
            <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
                <h2 className="mb-4 font-display text-sm font-semibold text-foreground">Platforma ko'lami</h2>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={[
                                { name: 'Talabalar', value: students?.total ?? 0 },
                                { name: "O'qituvchilar", value: teachers?.total ?? 0 },
                                { name: 'Foydalanuvchilar', value: users?.total ?? 0 },
                                { name: 'Fanlar', value: subjects?.total ?? 0 },
                                { name: 'Savollar', value: questions?.total ?? 0 },
                                { name: 'Testlar', value: quizzes?.total ?? 0 },
                                { name: 'Natijalar', value: results?.total ?? 0 },
                            ]}
                            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                axisLine={{ stroke: 'var(--border)' }}
                                tickLine={false}
                                interval={0}
                            />
                            <YAxis
                                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                                width={52}
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
                            <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Quick links */}
            <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Tezkor o'tish</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {QUICK_LINKS.map(({ to, label, description, icon: Icon }) => (
                        <Link
                            key={to}
                            to={to}
                            className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-foreground">{label}</span>
                                <span className="block truncate text-xs text-muted-foreground">{description}</span>
                            </span>
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
