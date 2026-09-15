import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRoleView } from '@/hooks/useRoleView';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Plus, Search } from 'lucide-react';
import { useQuizzes, useUpdateQuiz, useDeleteQuiz, useRepeatQuiz } from '@/hooks/useQuizzes';
import { useSubjects } from '@/hooks/useSubjects';
import { useFaculties } from '@/hooks/useReferenceData';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers } from '@/hooks/useTeachers';
import type { Quiz, QuizCreateRequest } from '@/services/quizService';
import { logger } from '@/utils/logger';
import type { Subject } from '@/services/subjectService';
import type { Group } from '@/services/groupService';
import { QuizFilters } from '@/components/quizzes/QuizFilters';
import { QuizTable } from '@/components/quizzes/QuizTable';
import { QuizModal } from '@/components/quizzes/QuizModal';
import { RepeatedQuizSuccessModal } from '@/components/quizzes/RepeatedQuizSuccessModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FILTER_PAGE_SIZE, withSelected } from '@/utils/filterOptions';
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
    const pageSize = 10;
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useUrlState<string>('q', '');
    const [debouncedSearch, setDebouncedSearch] = useState('');

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
        faculty_id: filterFacultyId,
        sort_dir: sortDir,
    });

    const { data: allFacultiesData } = useFaculties(1, 200, undefined, hasPermission('read:faculty'));
    // Ikkita alohida so'rov, ataylab:
    //  * `allSubjectsData` — jadvalda fan NOMINI ko'rsatish uchun
    //    (`getSubjectName`). Quiz javobida faqat `subject_id` bor,
    //    shuning uchun nomlar ro'yxatdan qidiriladi va uni qisqartirib
    //    bo'lmaydi: qatorlarda «-» chiqib qolardi.
    //  * `subjectOptionsData` — filtr ro'yxati uchun. Fanlar 2978 ta,
    //    hammasi yuklanmaydi; qidiruv serverga uzatiladi.
    const { data: allSubjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const [subjectQuery, setSubjectQuery] = useState('');
    const debouncedSubjectQuery = useDebouncedValue(subjectQuery);
    const { data: subjectOptionsData } = useSubjects(
        1,
        FILTER_PAGE_SIZE,
        debouncedSubjectQuery,
        undefined,
        hasPermission('read:subject'),
    );
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));
    const { data: allTeachersData } = useTeachers(1, 1000, undefined, hasPermission('read:teacher'));

    const updateQuizMutation = useUpdateQuiz();
    const deleteQuizMutation = useDeleteQuiz();
    const repeatQuizMutation = useRepeatQuiz();

    const quizzes = quizzesData?.quizzes || [];
    const totalPages = quizzesData ? Math.ceil(quizzesData.total / pageSize) : 1;
    const allFaculties = allFacultiesData?.faculties || [];
    const allSubjects = allSubjectsData?.subjects || [];
    // Tanlangan fan qidiruv natijasidan tushib qolsa, Combobox nom
    // o'rniga placeholder ko'rsatardi — go'yo filtr olib tashlangandek.
    const selectedSubjectOption = filterSubjectId
        ? {
              value: String(filterSubjectId),
              label: allSubjects.find((s) => s.id === filterSubjectId)?.name ?? `#${filterSubjectId}`,
          }
        : null;
    const subjectOptions = withSelected(
        (subjectOptionsData?.subjects || []).map((s) => ({ value: String(s.id), label: s.name })),
        selectedSubjectOption,
    );
    const allGroups = allGroupsData?.groups || [];
    const allTeachers = allTeachersData?.teachers || [];

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

    const getSubjectName = (id?: number) => allSubjects.find((s: Subject) => s.id === id)?.name || '-';
    const getGroupName = (id?: number) => allGroups.find((g: Group) => g.id === id)?.name || '-';

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
        filterFacultyId !== undefined ||
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
                        {!isTeacher && (
                            <Button onClick={handleCreateQuiz}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('Test yaratish')}
                            </Button>
                        )}
                    </>
                }
            />

            <QuizFilters
                subjects={allSubjects}
                subjectOptions={subjectOptions}
                onSubjectSearchChange={setSubjectQuery}
                groups={allGroups}
                teachers={allTeachers}
                faculties={allFaculties}
                filterFacultyId={filterFacultyId}
                onFacultyChange={(id) => { setFilterFacultyId(id); setCurrentPage(1); }}
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
