import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRoleView } from '@/hooks/useRoleView';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Plus, Search } from 'lucide-react';
import { useQuizzes, useUpdateQuiz, useDeleteQuiz, useRepeatQuiz } from '@/hooks/useQuizzes';
import { useSubjectFilter } from '@/hooks/useSubjects';
import { useFaculties } from '@/hooks/useReferenceData';
import { useGroupFilter } from '@/hooks/useGroups';
import { useTeacherOptions } from '@/hooks/useTeachers';
import type { Quiz, QuizCreateRequest } from '@/services/quizService';
import { logger } from '@/utils/logger';
import { QuizFilters } from '@/components/quizzes/QuizFilters';
import { QuizTable } from '@/components/quizzes/QuizTable';
import { QuizModal } from '@/components/quizzes/QuizModal';
import { RepeatedQuizSuccessModal } from '@/components/quizzes/RepeatedQuizSuccessModal';
import { useTranslation } from 'react-i18next';
import { useUrlState, useUrlNumberState, useUrlOptionalNumberState, useUrlOptionalBoolState } from '@/hooks/useUrlState';

const QuizzesPage = () => {
    const { t } = useTranslation();
    const { hasPermission } = useAuth();
    const { isTeacher } = useRoleView();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<Quiz | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    // Filtrlar, saralash va sahifa URL'da.
    const [currentPage, setCurrentPage] = useUrlNumberState('page', 1);
    const [pageSize, setPageSize] = useState(10);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useUrlState<string>('q', '');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // O'qituvchi faqat o'z testlarini ko'radi — fakultet bo'yicha filtr unga
    // hech narsa bermaydi, shuning uchun ruxsat bazada berilgan bo'lsa ham
    // ko'rsatilmaydi (ro'yxat ham so'ralmaydi, URL'dagi eski qiymat ham
    // e'tiborga olinmaydi).
    const canFilterByFaculty = !isTeacher && hasPermission('read:faculty');

    // O'qituvchi testni dars sahifasidan yaratadi, bu yerdan emas.
    // Ruxsat ham tekshiriladi: `read:quiz` qo'lda berilib qolgan talabaga
    // sahifa ochilardi va «Test yaratish» tugmasi ko'rinib turardi,
    // bosilganda esa backend 403 qaytarardi.
    const canCreateQuiz = !isTeacher && hasPermission('create:quiz');

    const [isRepeatConfirmOpen, setIsRepeatConfirmOpen] = useState(false);
    const [quizToRepeat, setQuizToRepeat] = useState<Quiz | null>(null);
    const [repeatedQuiz, setRepeatedQuiz] = useState<Quiz | null>(null);

    const [filterFacultyId, setFilterFacultyId] = useUrlOptionalNumberState('faculty');
    const [filterSubjectId, setFilterSubjectId] = useUrlOptionalNumberState('subject');
    const [filterGroupId, setFilterGroupId] = useUrlOptionalNumberState('group');
    const [filterUserId, setFilterUserId] = useUrlOptionalNumberState('teacher');
    const [filterIsActive, setFilterIsActive] = useUrlOptionalBoolState('active');
    const [sortDir, setSortDir] = useUrlState<'desc' | 'asc'>('order', 'desc');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: quizzesData, isLoading: isQuizzesLoading, isError: isQuizzesError, refetch: refetchQuizzes } = useQuizzes({
        page: currentPage,
        limit: pageSize,
        title: debouncedSearch || undefined,
        is_active: filterIsActive,
        user_id: filterUserId,
        group_id: filterGroupId,
        subject_id: filterSubjectId,
        faculty_id: canFilterByFaculty ? filterFacultyId : undefined,
        sort_dir: sortDir,
    });

    const { data: allFacultiesData } = useFaculties(1, 200, undefined, canFilterByFaculty);
    // Fan filtri — qidiruv serverda; jadvaldagi nomlar javobning o'zidan
    // (`subject_name`). Ilgari 1000 ta fan yuklanib, qolgan 2254 tasi
    // jadvalda «-» va filtrda yo'q edi.
    const subjectFilter = useSubjectFilter(filterSubjectId, hasPermission('read:subject'));
    const groupFilter = useGroupFilter(filterGroupId, hasPermission('read:group'));
    const { data: allTeachersData } = useTeacherOptions(undefined, hasPermission('read:teacher'));

    const updateQuizMutation = useUpdateQuiz();
    const deleteQuizMutation = useDeleteQuiz();
    const repeatQuizMutation = useRepeatQuiz();

    const quizzes = quizzesData?.quizzes || [];
    const totalPages = quizzesData ? Math.ceil(quizzesData.total / pageSize) : 1;
    const allFaculties = allFacultiesData?.faculties || [];
    const allTeachers = allTeachersData ?? [];

    const handleCreateQuiz = () => {
        setSelectedQuiz(null);
        setIsModalOpen(true);
    };

    const handleEditQuiz = (quiz: Quiz) => {
        setSelectedQuiz(quiz);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (quiz: Quiz) => {
        setQuizToDelete(quiz);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!quizToDelete) return;
        deleteQuizMutation.mutate({ id: quizToDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                toast.success(t("Test o'chirildi"));
                setIsDeleteModalOpen(false);
                setQuizToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error(t("O'chirishda xatolik yuz berdi"));
                    setIsDeleteModalOpen(false);
                    setQuizToDelete(null);
                    setCascadeWarnings([]);
                }
            },
        });
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
    };

    const handleRepeatClick = (quiz: Quiz) => {
        setQuizToRepeat(quiz);
        setIsRepeatConfirmOpen(true);
    };

    const handleConfirmRepeat = () => {
        if (!quizToRepeat) return;
        repeatQuizMutation.mutate(quizToRepeat.id, {
            onSuccess: (newQuiz) => {
                setIsRepeatConfirmOpen(false);
                setRepeatedQuiz(newQuiz);
            },
            onError: () => {
                toast.error(t('Testni qayta yaratishda xatolik yuz berdi'));
            },
        });
    };

    const handleToggleStatus = (quiz: Quiz) => {
        setIsUpdatingStatus(quiz.id);
        const payload: QuizCreateRequest = {
            title: quiz.title,
            question_number: quiz.question_number,
            duration: quiz.duration,
            pin: quiz.pin,
            lecturer_id: quiz.lecturer_id ?? null,
            group_id: quiz.group_id ?? null,
            subject_id: quiz.subject_id ?? null,
            is_active: !quiz.is_active,
            proctoring_mode: quiz.proctoring_mode,
        };

        updateQuizMutation.mutate({ id: quiz.id, data: payload }, {
            onSettled: () => {
                setIsUpdatingStatus(null);
            },
            onSuccess: () => {
                toast.success(payload.is_active ? t('Test faollashtirildi') : t("Test faol emas holatga o'tkazildi"));
            },
            onError: (error: unknown) => {
                logger.error('Failed to update quiz status', error);
                // Включение теста с недостаточным банком вопросов бэкенд отклоняет
                // с 409 и внятным сообщением — показываем именно его: иначе человек
                // не поймёт, почему переключатель не сработал.
                const response = (error as { response?: { status?: number; data?: { detail?: { message?: string } } } })
                    ?.response;
                if (response?.status === 409 && response.data?.detail?.message) {
                    toast.error(response.data.detail.message);
                    return;
                }
                toast.error(t('Test holatini yangilashda xatolik yuz berdi'));
            },
        });
    };

    // Nomlar javobning o'zidan (`subject_name` / `group_name`).
    const subjectNameById = useMemo(() => {
        const map = new Map<number, string>();
        quizzes.forEach((q) => {
            if (q.subject_id && q.subject_name) map.set(q.subject_id, q.subject_name);
        });
        return map;
    }, [quizzes]);

    const groupNameById = useMemo(() => {
        const map = new Map<number, string>();
        quizzes.forEach((q) => {
            if (q.group_id && q.group_name) map.set(q.group_id, q.group_name);
        });
        return map;
    }, [quizzes]);

    const getSubjectName = (id?: number) => (id ? subjectNameById.get(id) : undefined) || '-';
    const getGroupName = (id?: number) => (id ? groupNameById.get(id) : undefined) || '-';

    const clearFilters = () => {
        setFilterFacultyId(undefined);
        setFilterSubjectId(undefined);
        setFilterGroupId(undefined);
        setFilterUserId(undefined);
        setFilterIsActive(undefined);
        setSearchTerm('');
        setSortDir('desc');
        setCurrentPage(1);
    };

    const hasActiveFilters =
        (canFilterByFaculty && filterFacultyId !== undefined) ||
        filterSubjectId !== undefined ||
        filterGroupId !== undefined ||
        filterUserId !== undefined ||
        filterIsActive !== undefined ||
        searchTerm !== '' ||
        sortDir !== 'desc';

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('Testlar')}
                description={t("Barcha testlar ro'yxati — filtrlar bilan")}
                actions={
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={t("Qidirish...")}
                                className="pl-8 w-full sm:w-[220px]"
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        {canCreateQuiz && (
                            <Button onClick={handleCreateQuiz}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('Test yaratish')}
                            </Button>
                        )}
                    </>
                }
            />

            <QuizFilters
                subjectOptions={subjectFilter.options}
                onSubjectSearchChange={subjectFilter.onSearch}
                groupOptions={groupFilter.options}
                onGroupSearchChange={groupFilter.onSearch}
                teachers={allTeachers}
                faculties={canFilterByFaculty ? allFaculties : undefined}
                filterFacultyId={filterFacultyId}
                onFacultyChange={canFilterByFaculty ? (id) => { setFilterFacultyId(id); setCurrentPage(1); } : undefined}
                filterSubjectId={filterSubjectId}
                onSubjectChange={setFilterSubjectId}
                filterGroupId={filterGroupId}
                onGroupChange={setFilterGroupId}
                filterUserId={filterUserId}
                onUserChange={setFilterUserId}
                filterIsActive={filterIsActive}
                onIsActiveChange={setFilterIsActive}
                sortDir={sortDir}
                onSortDirChange={setSortDir}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearFilters}
            />

            <QuizTable
                variant="list"
                quizzes={quizzes}
                isLoading={isQuizzesLoading}
                isError={isQuizzesError}
                onRetry={() => refetchQuizzes()}
                isTeacher={isTeacher}
                hasActiveFilters={hasActiveFilters}
                isUpdatingStatusId={isUpdatingStatus}
                isUpdatePending={updateQuizMutation.isPending}
                isRepeatPending={repeatQuizMutation.isPending}
                getSubjectName={getSubjectName}
                getGroupName={getGroupName}
                onToggleStatus={handleToggleStatus}
                onEdit={handleEditQuiz}
                onDelete={handleDeleteClick}
                onRepeat={handleRepeatClick}
            />

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isQuizzesLoading}
                totalItems={quizzesData?.total ?? 0}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
            />

            <QuizModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                quiz={selectedQuiz}
                teachers={allTeachers}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setQuizToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title={t("Testni o'chirish")}
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">{t("Diqqat! Ushbu testni o'chirish quyidagi ma'lumotlarni ham o'chiradi:")}</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">{t("Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!")}</p>
                        </div>
                    ) : `Siz haqiqatan ham "${quizToDelete?.title}" testini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? t("Ha, majburiy o'chirish") : t("O'chirish")}
                cancelText={t("Bekor qilish")}
            />

            <ConfirmDialog
                isOpen={isRepeatConfirmOpen}
                onClose={() => setIsRepeatConfirmOpen(false)}
                onConfirm={handleConfirmRepeat}
                title={t("Testni qayta yaratish")}
                description={`"${quizToRepeat?.title}" testi uchun 2-urinish yaratilsinmi? Yangi PIN generatsiya qilinadi va talabalar shu PIN orqali qayta topshira oladi.`}
                confirmText={repeatQuizMutation.isPending ? 'Yaratilmoqda...' : t('Yaratish')}
                cancelText={t("Bekor qilish")}
            />

            <RepeatedQuizSuccessModal quiz={repeatedQuiz} onClose={() => setRepeatedQuiz(null)} />
        </div>
    );
};

export default QuizzesPage;
