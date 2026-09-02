import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useActiveQuizzes } from '@/hooks/useQuizzes';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PlayCircle, Brain, User, Clock, Trophy, ChevronRight, Megaphone } from 'lucide-react';
import { useAnnouncementFeed } from '@/hooks/useAnnouncements';
import { AnnouncementCard } from '@/components/announcement/AnnouncementCard';

/**
 * Кабинет студента — главная страница вместо редиректа на профиль:
 * приветствие, быстрые действия и список активных тестов.
 */
const StudentDashboardPage = () => {
    const { user, hasPermission } = useAuth();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: quizzesData, isLoading } = useActiveQuizzes(1, 5);
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
            {/* Hero в фирменном синем */}
            <div className="relative overflow-hidden rounded-2xl bg-sidebar p-6 sm:p-8">
                <div aria-hidden className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-white/5" />
                <div aria-hidden className="absolute -bottom-24 right-24 h-40 w-40 rounded-full border border-white/10" />
                <h1 className="relative font-display text-2xl sm:text-3xl font-bold tracking-tight text-sidebar-foreground">
                    {t('Xush kelibsiz, {{name}}!', { name: firstName })}
                </h1>
                <p className="relative mt-1.5 text-sm sm:text-base text-sidebar-muted">
                    {user?.student?.group?.name
                        ? t('{{group}} guruhi talabasi', { group: user.student.group.name })
                        : t('Talaba kabineti')}
                </p>
            </div>

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

            {/* E'lonlar — bosh sahifada ko'zga tashlanishi uchun testlardan oldin */}
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
                        <div className="grid gap-4 sm:grid-cols-2">
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
