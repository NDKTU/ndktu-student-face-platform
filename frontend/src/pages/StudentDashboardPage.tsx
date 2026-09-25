import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useActiveQuizzes } from '@/hooks/useQuizzes';
import { useMyStudentDashboard } from '@/hooks/useStudents';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import {
    PlayCircle,
    Brain,
    User,
    Clock,
    Trophy,
    ChevronRight,
    Megaphone,
    CalendarCheck,
    CalendarClock,
    ClipboardList,
    Star,
} from 'lucide-react';
import { useAnnouncementFeed } from '@/hooks/useAnnouncements';
import { AnnouncementCard } from '@/components/announcement/AnnouncementCard';
import { MyAttendanceCard } from '@/components/courses/MyAttendanceCard';
import {
    DashboardEmpty,
    DashboardSection,
    DashboardSectionLink,
} from '@/components/dashboard/DashboardSection';
import { GradeDistributionChart } from '@/components/dashboard/GradeDistributionChart';
import { gradeText, percentText } from '@/components/dashboard/format';
import { courseTypeLabel } from '@/services/courseTypes';
import { formatDate, formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Qolgan vaqt yozuvi va shoshilinchlik ohangi — `now` javob olingan payt. */
const remaining = (deadline: string, now: number) => {
    const left = new Date(deadline).getTime() - now;
    if (left <= 0) return null;
    const hours = Math.floor(left / (60 * 60 * 1000));
    if (hours < 24) return { key: '{{n}} soat qoldi', n: Math.max(1, hours), tone: 'urgent' as const };
    const days = Math.floor(left / DAY_MS);
    return { key: '{{n}} kun qoldi', n: days, tone: days <= 2 ? ('soon' as const) : ('calm' as const) };
};

const TONE_STYLES = {
    urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    soon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    calm: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
};

const GRADE_STYLES: Record<number, string> = {
    5: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    4: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    3: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    2: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
};

/**
 * Talaba dashboardi: asosiy ko'rsatkichlar (davomat, baholar, vazifalar),
 * yaqin darslar, topshirilishi kerak vazifalar, so'nggi natijalar, faol
 * testlar va e'lonlar.
 *
 * Raqamlar bitta so'rovdan (`/students/me/dashboard`). Davomat tafsiloti
 * (qoldirilgan darslar ro'yxati) — alohida `MyAttendanceCard` da.
 */
const StudentDashboardPage = () => {
    const { user, hasPermission } = useAuth();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: quizzesData, isLoading } = useActiveQuizzes(1, 5);
    // Muddatlar shu javob olingan paytga nisbatan: renderda `Date.now()`
    // har qayta chizishda boshqa natija beradi.
    const canSeeDashboard = hasPermission('student:me');
    const {
        data: dashboard,
        isLoading: isDashboardLoading,
        dataUpdatedAt,
    } = useMyStudentDashboard(canSeeDashboard);
    // E'lonlar bo'limi faqat huquq bo'lsa so'raladi: aks holda har kirishda
    // 403 qaytardi va konsol xatolarga to'lardi.
    const canSeeAnnouncements = hasPermission('announcement:feed');
    const { data: announcementsData, isLoading: isLoadingAnnouncements } = useAnnouncementFeed(
        { page: 1, limit: 2 },
        canSeeAnnouncements,
    );
    const announcements = announcementsData?.announcements ?? [];

    const firstName = user?.student?.first_name || user?.username || '';
    const activeQuizzes = (quizzesData?.quizzes ?? []).filter((q) => q.is_active);

    const profile = dashboard?.profile;
    const groupName = profile?.group_name ?? user?.student?.group?.name;
    const subtitle = [
        groupName ? t('{{group}} guruhi talabasi', { group: groupName }) : t('Talaba kabineti'),
        // HEMIS darajani tayyor holda beradi: «3-kurs».
        profile?.level,
        profile?.specialty,
    ]
        .filter(Boolean)
        .join(' · ');

    const totals = dashboard?.totals;
    const grades = dashboard?.grades;

    const actions = [
        {
            to: '/quiz-test',
            icon: PlayCircle,
            title: t('Test ishlash'),
            description: t('PIN kod bilan faol testni boshlang'),
        },
        {
            to: '/psychology/student',
            icon: Brain,
            title: t('Psixologik testlar'),
            description: t("O'zingizni sinab ko'ring"),
        },
        {
            to: '/announcements/student',
            icon: Megaphone,
            title: t("E'lonlar"),
            description: t('Universitet xabarlari va tadbirlari'),
        },
        {
            to: '/profile',
            icon: User,
            title: t('Profil'),
            description: t("Shaxsiy ma'lumotlar"),
        },
    ];

    return (
        <div className="space-y-6">
            {/* EduDash welcome panel */}
            <div className="relative overflow-hidden rounded-lg border border-primary/15 bg-accent p-6 sm:p-8">
                <div aria-hidden className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-white/5" />
                <div aria-hidden className="absolute -bottom-24 right-24 h-40 w-40 rounded-full border border-white/10" />
                <h1 className="relative font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    {t('Xush kelibsiz, {{name}}!', { name: firstName })}
                </h1>
                <p className="relative mt-1.5 text-sm sm:text-base text-muted-foreground">{subtitle}</p>
            </div>

            {/* Asosiy ko'rsatkichlar */}
            {canSeeDashboard && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label={t('Davomat')} value={percentText(dashboard?.attendance.percent)} icon={CalendarCheck} color="green"
                        isLoading={isDashboardLoading}
                        description={t('Kelmagan darslar: {{n}}', { n: dashboard?.attendance.absent ?? 0 })} />
                    <StatCard label={t("O'rtacha test bahosi")} value={gradeText(grades?.avg_grade)} icon={Star} color="yellow"
                        isLoading={isDashboardLoading}
                        description={t('{{n}} ta yakunlangan test', { n: totals?.quizzes_taken ?? 0 })} />
                    <StatCard label={t('Topshirilishi kerak')} value={totals?.homeworks_pending ?? 0} icon={ClipboardList} color="red"
                        isLoading={isDashboardLoading}
                        description={t("Muddati o'tganlari: {{n}}", { n: totals?.homeworks_missed ?? 0 })} />
                    <StatCard label={t('Uy vazifasi bahosi')} value={percentText(grades?.homework_percent)} icon={Trophy} color="purple"
                        isLoading={isDashboardLoading}
                        description={t('{{g}} ta baholangan · {{s}} ta tekshiruvda', {
                            g: totals?.homeworks_graded ?? 0,
                            s: totals?.homeworks_submitted ?? 0,
                        })} />
                </div>
            )}

            {/* Быстрые действия */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {actions.map((action) => (
                    <Link
                        key={action.to}
                        to={action.to}
                        className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md"
                    >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                            <action.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-foreground">{action.title}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{action.description}</p>
                        </div>
                    </Link>
                ))}
            </div>

            {canSeeDashboard && (
                <>
                    {/* Bugungi ish: yaqin darslar va topshirilishi kerak vazifalar */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <DashboardSection
                            title={t('Topshirilishi kerak vazifalar')}
                            action={hasPermission('read:homework') ? <DashboardSectionLink to="/homework" label={t('Barchasi')} /> : undefined}
                        >
                            {isDashboardLoading ? (
                                <div className="space-y-2 p-5">
                                    {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                                </div>
                            ) : !dashboard?.homeworks.length ? (
                                <DashboardEmpty>{t("Topshirilishi kerak bo'lgan vazifa yo'q.")}</DashboardEmpty>
                            ) : (
                                <ul className="divide-y divide-border/60">
                                    {dashboard.homeworks.map((homework) => {
                                        const left = remaining(homework.deadline, dataUpdatedAt);
                                        return (
                                            <li key={homework.id}>
                                                <Link to={homework.lesson_id ? `/lessons/${homework.lesson_id}` : '/homework'} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40">
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium text-foreground">{homework.title}</span>
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {homework.course_name} · {formatDateTime(homework.deadline)}
                                                        </span>
                                                    </span>
                                                    {left && (
                                                        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE_STYLES[left.tone])}>
                                                            {t(left.key, { n: left.n })}
                                                        </span>
                                                    )}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </DashboardSection>

                        <DashboardSection
                            title={t('Yaqin darslar')}
                            action={hasPermission('read:course') ? <DashboardSectionLink to="/courses" label={t('Kurslar')} /> : undefined}
                        >
                            {isDashboardLoading ? (
                                <div className="space-y-2 p-5">
                                    {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                                </div>
                            ) : !dashboard?.upcoming_lessons.length ? (
                                <DashboardEmpty>{t("Rejalashtirilgan dars yo'q.")}</DashboardEmpty>
                            ) : (
                                <ul className="divide-y divide-border/60">
                                    {dashboard.upcoming_lessons.map((lesson) => (
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
                                                            lesson.course_name,
                                                        ].filter(Boolean).join(' · ')}
                                                    </span>
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </DashboardSection>
                    </div>

                    {/* Test natijalari */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <DashboardSection title={t('Test baholari')}>
                            {isDashboardLoading ? (
                                <div className="p-5"><Skeleton className="h-56 w-full" /></div>
                            ) : !totals?.quizzes_taken || !grades ? (
                                <DashboardEmpty>{t("Hali test topshirmagansiz.")}</DashboardEmpty>
                            ) : (
                                <div className="px-2 pb-4 pt-5 sm:px-5">
                                    <GradeDistributionChart grades={grades} />
                                </div>
                            )}
                        </DashboardSection>

                        <DashboardSection
                            title={t("So'nggi natijalar")}
                            action={hasPermission('read:result') ? <DashboardSectionLink to="/results" label={t('Barchasi')} /> : undefined}
                        >
                            {isDashboardLoading ? (
                                <div className="space-y-2 p-5">
                                    {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                                </div>
                            ) : !dashboard?.recent_results.length ? (
                                <DashboardEmpty>{t("Hali test topshirmagansiz.")}</DashboardEmpty>
                            ) : (
                                <ul className="divide-y divide-border/60">
                                    {dashboard.recent_results.map((result) => (
                                        <li key={result.id} className="flex items-center gap-3 px-5 py-3">
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-foreground">
                                                    {result.quiz_title ?? result.subject_name ?? t('Test')}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {[
                                                        result.subject_name,
                                                        result.correct_answers !== null && result.wrong_answers !== null
                                                            ? t("{{c}} to'g'ri / {{w}} xato", { c: result.correct_answers, w: result.wrong_answers })
                                                            : null,
                                                        formatDate(result.finished_at),
                                                    ].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                            {result.grade !== null && (
                                                <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums', GRADE_STYLES[result.grade])}>
                                                    {result.grade}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </DashboardSection>
                    </div>
                </>
            )}

            {/* Davomat tafsiloti — huquq bo'lsa. Hech narsa belgilanmagan
                bo'lsa komponentning o'zi hech nima ko'rsatmaydi. */}
            {hasPermission('attendance:me') && <MyAttendanceCard />}

            {canSeeAnnouncements && (isLoadingAnnouncements || announcements.length > 0) && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-display text-base font-semibold text-foreground">{t("E'lonlar")}</h2>
                        <Link to="/announcements/student" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                            {t('Barchasi')}
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                    {isLoadingAnnouncements ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Skeleton className="h-40 w-full rounded-2xl" />
                            <Skeleton className="h-40 w-full rounded-2xl" />
                        </div>
                    ) : (
                        // `items-start` — e'lonlar sahifasidagi bilan bir xil sabab:
                        // bannerli e'lon yonidagi qisqa e'lon cho'zilib, yarmi
                        // bo'm-bo'sh turardi.
                        <div className="grid items-start gap-4 sm:grid-cols-2">
                            {announcements.map((announcement) => (
                                <AnnouncementCard key={announcement.id} announcement={announcement} compact />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Активные тесты */}
            <Card>
                <CardContent className="pt-6">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="font-display text-base font-semibold text-foreground">{t('Hozir faol testlar')}</h2>
                        <Link to="/quiz-test" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                            {t('Barchasi')}
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                    {isLoading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                        </div>
                    ) : activeQuizzes.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            {t("Hozircha faol testlar yo'q. Test boshlanganda shu yerda ko'rinadi.")}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {activeQuizzes.map((quiz) => (
                                <button
                                    key={quiz.id}
                                    onClick={() => navigate(`/quiz-test?quizId=${quiz.id}`)}
                                    className="flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                                >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10">
                                        <PlayCircle className="h-4.5 w-4.5 text-success" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-foreground">{quiz.title}</p>
                                        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Trophy className="h-3 w-3" />
                                                {quiz.question_number} {t('savol')}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {quiz.duration} {t('daqiqa')}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="badge badge-success shrink-0">{t('Faol')}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default StudentDashboardPage;
