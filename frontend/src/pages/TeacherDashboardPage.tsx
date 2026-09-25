import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowUpRight,
    BookOpen,
    CalendarCheck,
    CalendarClock,
    ClipboardCheck,
    FileQuestion,
    GraduationCap,
    Library,
    Star,
    UserCheck,
    Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    DashboardEmpty as EmptyNote,
    DashboardSection as Section,
    DashboardSectionLink as SectionLink,
} from '@/components/dashboard/DashboardSection';
import { GradeDistributionChart } from '@/components/dashboard/GradeDistributionChart';
import {
    attendanceTone,
    CHART_AXIS_TICK as AXIS_TICK,
    CHART_CURSOR,
    CHART_TOOLTIP_STYLE as TOOLTIP_STYLE,
    gradeText,
    percentText,
} from '@/components/dashboard/format';
import { useAuth } from '@/context/AuthContext';
import { displayNameOf } from '@/lib/userDisplay';
import { useMyTeacherDashboard } from '@/hooks/useTeachers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { courseTypeLabel } from '@/services/courseTypes';
import { formatDate, formatDateTime, formatDayMonth } from '@/utils/date';
import { cn } from '@/lib/utils';

/**
 * O'qituvchining bosh sahifasi: guruhlari, darslari, davomat va test natijalari.
 *
 * Barcha raqamlar bitta so'rovdan (`/teacher/me/dashboard`) — ro'yxat
 * endpointlarini `limit=1` bilan chaqirib yig'ilsa, har biri o'z filtrini
 * qo'llab, bir-biriga mos kelmaydigan raqamlar chiqardi.
 */
const TeacherDashboardPage: React.FC = () => {
    const { t } = useTranslation();
    const { user, hasPermission } = useAuth();
    const isNarrow = useIsMobile();
    // Muddat shu javob olingan paytga nisbatan: renderda `Date.now()` har
    // qayta chizishda boshqa natija beradi.
    const { data, isLoading, isError, refetch, dataUpdatedAt } = useMyTeacherDashboard();

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return t('Xayrli tong');
        if (h < 18) return t('Xayrli kun');
        return t('Xayrli kech');
    };

    const totals = data?.totals;
    const canGrade = hasPermission('update:submission');

    const trend = (data?.attendance_trend ?? []).map((week) => ({
        label: formatDayMonth(week.week_start),
        percent: week.percent,
        marked: week.present + week.late + week.absent,
    }));
    const hasTrend = trend.some((week) => week.marked > 0);

    const grades = data?.grades;

    const quickLinks = [
        { to: '/courses', label: t('Kurslar'), icon: Library, permission: 'read:course' },
        { to: '/teacher-groups', label: t('Mening guruhlarim'), icon: Users, permission: 'read:group' },
        { to: '/lessons', label: t('Darslar'), icon: CalendarCheck, permission: 'read:lesson' },
        { to: '/homework', label: t('Uy vazifalari'), icon: ClipboardCheck, permission: 'read:homework' },
        { to: '/questions', label: t('Savollar banki'), icon: FileQuestion, permission: 'read:question' },
        { to: '/quizzes', label: t('Testlar'), icon: BookOpen, permission: 'read:quiz' },
        { to: '/results', label: t('Natijalar'), icon: Star, permission: 'read:result' },
    ].filter((link) => hasPermission(link.permission));

    if (isError) {
        return (
            <div className="space-y-6">
                <PageHeader title={`${getGreeting()}, ${displayNameOf(user)}`} />
                <div className="rounded-lg bg-card p-6 shadow-[var(--surface-shadow)]">
                    <ErrorState onRetry={() => refetch()} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${getGreeting()}, ${displayNameOf(user)}`}
                description={t("Guruhlaringiz, darslaringiz va talabalaringiz natijalari bir joyda.")}
            />

            {/* Asosiy ko'rsatkichlar */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label={t('Guruhlar')} value={totals?.groups ?? 0} icon={Users} color="blue" isLoading={isLoading}
                    description={t('Sizga biriktirilgan faol guruhlar')} />
                <StatCard label={t('Talabalar')} value={totals?.students ?? 0} icon={UserCheck} color="orange" isLoading={isLoading}
                    description={t('Guruhlaringizdagi talabalar')} />
                <StatCard label={t('Kurslar')} value={totals?.courses ?? 0} icon={Library} color="teal" isLoading={isLoading}
                    description={t('{{n}} ta fan', { n: totals?.subjects ?? 0 })} />
                <StatCard label={t('Darslar')} value={totals?.lessons ?? 0} icon={CalendarCheck} color="purple" isLoading={isLoading}
                    description={t('{{n}} ta rejalashtirilgan', { n: totals?.upcoming_lessons ?? 0 })} />
                <StatCard label={t('Davomat')} value={percentText(data?.attendance.percent ?? null)} icon={GraduationCap} color="green" isLoading={isLoading}
                    description={t('Kelgan va kechikkanlar ulushi')} />
                <StatCard label={t("O'rtacha baho")} value={gradeText(grades?.avg_grade ?? null)} icon={Star} color="yellow" isLoading={isLoading}
                    description={t('{{n}} ta yakunlangan test', { n: totals?.results ?? 0 })} />
                <StatCard label={t('Baholash kutilmoqda')} value={totals?.submissions_to_grade ?? 0} icon={ClipboardCheck} color="red" isLoading={isLoading}
                    description={t('{{n}} ta faol uy vazifasi', { n: totals?.active_homeworks ?? 0 })} />
                <StatCard label={t('Testlar')} value={totals?.quizzes ?? 0} icon={BookOpen} color="cyan" isLoading={isLoading}
                    description={t('{{a}} ta faol · {{q}} ta savol', { a: totals?.active_quizzes ?? 0, q: totals?.questions ?? 0 })} />
            </div>

            {/* Guruhlar kesimi va baholar */}
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <Section title={t('Guruhlarim')} action={hasPermission('read:group') ? <SectionLink to="/teacher-groups" label={t('Barchasi')} /> : undefined}>
                    {isLoading ? (
                        <div className="space-y-2 p-5">
                            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                    ) : !data?.groups.length ? (
                        <EmptyNote>{t("Hozircha sizga guruh biriktirilmagan.")}</EmptyNote>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="px-5 py-3 font-medium">{t('Guruh')}</th>
                                        <th className="px-3 py-3 text-right font-medium">{t('Talabalar')}</th>
                                        <th className="px-3 py-3 text-right font-medium">{t('Davomat')}</th>
                                        <th className="px-3 py-3 text-right font-medium">{t("O'rtacha baho")}</th>
                                        <th className="px-5 py-3 text-right font-medium">{t('Natijalar')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.groups.map((group) => (
                                        <tr key={group.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                                            <td className="px-5 py-3">
                                                <Link to={`/groups/${group.id}/students`} className="font-medium text-foreground hover:text-primary hover:underline">
                                                    {group.name}
                                                </Link>
                                                {group.course && (
                                                    <span className="ml-2 text-xs text-muted-foreground">{t('{{n}}-kurs', { n: group.course })}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">{group.student_count}</td>
                                            <td className={cn('px-3 py-3 text-right font-medium tabular-nums', attendanceTone(group.attendance_percent))}>
                                                {percentText(group.attendance_percent)}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">{gradeText(group.avg_grade)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{group.results}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                <Section title={t('Test baholari')} action={hasPermission('read:result') ? <SectionLink to="/results" label={t('Natijalar')} /> : undefined}>
                    {isLoading ? (
                        <div className="p-5"><Skeleton className="h-56 w-full" /></div>
                    ) : !totals?.results ? (
                        <EmptyNote>{t("Testlaringiz bo'yicha hali natija yo'q.")}</EmptyNote>
                    ) : (
                        <div className="px-2 pb-4 pt-5 sm:px-5">
                            <GradeDistributionChart grades={grades!} />
                            {!!grades?.cheating && (
                                <p className="mt-3 px-3 text-xs text-muted-foreground">
                                    {t("Ko'chirish aniqlangan urinishlar: {{n}}", { n: grades.cheating })}
                                </p>
                            )}
                        </div>
                    )}
                </Section>
            </div>

            {/* Davomat dinamikasi va yaqin darslar */}
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <Section title={t('Davomat dinamikasi')}>
                    {isLoading ? (
                        <div className="p-5"><Skeleton className="h-64 w-full" /></div>
                    ) : !hasTrend ? (
                        <EmptyNote>{t("So'nggi 8 haftada davomat belgilanmagan.")}</EmptyNote>
                    ) : (
                        <div className="h-72 px-2 py-5 sm:px-5">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: 'var(--border)' }} tickLine={false}
                                        interval="preserveStartEnd" minTickGap={8} />
                                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={isNarrow ? 34 : 44}
                                        domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
                                    <Tooltip
                                        cursor={CHART_CURSOR}
                                        contentStyle={TOOLTIP_STYLE}
                                        labelFormatter={(v) => t('{{d}} haftasi', { d: v })}
                                        formatter={(value, _name, item) => [
                                            value === null || value === undefined
                                                ? t('belgilanmagan')
                                                : `${value}% · ${t('{{n}} ta belgi', { n: (item?.payload as { marked: number }).marked })}`,
                                            t('Davomat'),
                                        ]}
                                    />
                                    <Bar dataKey="percent" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Section>

                <Section title={t('Yaqin darslar')} action={hasPermission('read:lesson') ? <SectionLink to="/lessons" label={t('Barchasi')} /> : undefined}>
                    {isLoading ? (
                        <div className="space-y-2 p-5">
                            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                        </div>
                    ) : !data?.upcoming_lessons.length ? (
                        <EmptyNote>{t("Rejalashtirilgan dars yo'q.")}</EmptyNote>
                    ) : (
                        <ul className="divide-y divide-border/60">
                            {data.upcoming_lessons.map((lesson) => (
                                <li key={lesson.id}>
                                    <Link to={`/lessons/${lesson.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-accent/40">
                                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <CalendarClock className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-foreground">{lesson.topic}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {[
                                                    formatDate(lesson.date),
                                                    lesson.lesson_type === 'independent'
                                                        ? t("Mustaqil ta'lim")
                                                        : courseTypeLabel(lesson.lesson_type) && t(courseTypeLabel(lesson.lesson_type)!),
                                                    lesson.group_name ?? lesson.course_name,
                                                ].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>
            </div>

            {/* Uy vazifalari va tezkor o'tish */}
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <Section title={t('Uy vazifalari')} action={hasPermission('read:homework') ? <SectionLink to="/homework" label={t('Barchasi')} /> : undefined}>
                    {isLoading ? (
                        <div className="space-y-2 p-5">
                            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                        </div>
                    ) : !data?.homeworks.length ? (
                        <EmptyNote>{t("Faol yoki baholanishi kutilayotgan vazifa yo'q.")}</EmptyNote>
                    ) : (
                        <ul className="divide-y divide-border/60">
                            {data.homeworks.map((homework) => {
                                const overdue = new Date(homework.deadline).getTime() < dataUpdatedAt;
                                const content = (
                                    <>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-foreground">{homework.title}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {homework.course_name} · {overdue ? t('Muddati tugagan') : t('Muddat')}: {formatDateTime(homework.deadline)}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            {homework.to_grade > 0 ? (
                                                <span className="badge badge-warning">{t('{{n}} ta baholash', { n: homework.to_grade })}</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">{t('{{n}} ta topshirilgan', { n: homework.submitted })}</span>
                                            )}
                                        </span>
                                    </>
                                );
                                return (
                                    <li key={homework.id}>
                                        {canGrade ? (
                                            <Link to={`/homework/${homework.id}/submissions`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40">
                                                {content}
                                            </Link>
                                        ) : (
                                            <div className="flex items-center gap-3 px-5 py-3">{content}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Section>

                <Section title={t("Tezkor o'tish")}>
                    <div className="grid gap-2 p-4">
                        {quickLinks.map(({ to, label, icon: Icon }) => (
                            <Link
                                key={to}
                                to={to}
                                className="group flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                            </Link>
                        ))}
                    </div>
                </Section>
            </div>
        </div>
    );
};

export default TeacherDashboardPage;
