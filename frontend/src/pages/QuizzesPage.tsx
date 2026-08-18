import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Plus, Search } from 'lucide-react';
import { useQuizzes, useUpdateQuiz, useDeleteQuiz, useRepeatQuiz } from '@/hooks/useQuizzes';
import { useSubjects } from '@/hooks/useSubjects';
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

const QuizzesPage = () => {
    const { user, hasPermission } = useAuth();
    const isTeacher = user?.roles?.some(r => r.name.toLowerCase() === 'teacher');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<Quiz | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [isRepeatConfirmOpen, setIsRepeatConfirmOpen] = useState(false);
    const [quizToRepeat, setQuizToRepeat] = useState<Quiz | null>(null);
    const [repeatedQuiz, setRepeatedQuiz] = useState<Quiz | null>(null);

    const [filterSubjectId, setFilterSubjectId] = useState<number | undefined>(undefined);
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);
    const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined);
    const [filterIsActive, setFilterIsActive] = useState<boolean | undefined>(undefined);
    const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: quizzesData, isLoading: isQuizzesLoading, isError: isQuizzesError, refetch: refetchQuizzes } = useQuizzes(
        currentPage,
        pageSize,
        debouncedSearch,
        filterIsActive,
        filterUserId,
        filterGroupId,
        filterSubjectId,
        sortDir,
    );

    const { data: allSubjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));
    const { data: allTeachersData } = useTeachers(1, 1000, undefined, hasPermission('read:teacher'));

    const updateQuizMutation = useUpdateQuiz();
    const deleteQuizMutation = useDeleteQuiz();
    const repeatQuizMutation = useRepeatQuiz();

    const quizzes = quizzesData?.quizzes || [];
    const totalPages = quizzesData ? Math.ceil(quizzesData.total / pageSize) : 1;
    const allSubjects = allSubjectsData?.subjects || [];
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
                toast.success("Test o'chirildi");
                setIsDeleteModalOpen(false);
                setQuizToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error("O'chirishda xatolik yuz berdi");
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
                toast.error('Testni qayta yaratishda xatolik yuz berdi');
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
                toast.success(payload.is_active ? 'Test faollashtirildi' : "Test faol emas holatga o'tkazildi");
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
                toast.error('Test holatini yangilashda xatolik yuz berdi');
            },
        });
    };

    const getSubjectName = (id?: number) => allSubjects.find((s: Subject) => s.id === id)?.name || '-';
    const getGroupName = (id?: number) => allGroups.find((g: Group) => g.id === id)?.name || '-';

    const clearFilters = () => {
        setFilterSubjectId(undefined);
        setFilterGroupId(undefined);
        setFilterUserId(undefined);
        setFilterIsActive(undefined);
        setSearchTerm('');
        setSortDir('desc');
    };

    const hasActiveFilters =
        filterSubjectId !== undefined ||
        filterGroupId !== undefined ||
        filterUserId !== undefined ||
        filterIsActive !== undefined ||
        searchTerm !== '' ||
        sortDir !== 'desc';

    return (
        <div className="space-y-6">
            <PageHeader
                title="Testlar"
                description="Testlarni va topshiriqlarni boshqarish"
                actions={
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Qidirish..."
                                className="pl-8 w-[220px]"
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        {!isTeacher && (
                            <Button onClick={handleCreateQuiz}>
                                <Plus className="mr-2 h-4 w-4" />
                                Test yaratish
                            </Button>
                        )}
                    </>
                }
            />

            <QuizFilters
                subjects={allSubjects}
                groups={allGroups}
                teachers={allTeachers}
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
                title="Testni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu testni o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${quizToDelete?.title}" testini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />

            <ConfirmDialog
                isOpen={isRepeatConfirmOpen}
                onClose={() => setIsRepeatConfirmOpen(false)}
                onConfirm={handleConfirmRepeat}
                title="Testni qayta yaratish"
                description={`"${quizToRepeat?.title}" testi uchun 2-urinish yaratilsinmi? Yangi PIN generatsiya qilinadi va talabalar shu PIN orqali qayta topshira oladi.`}
                confirmText={repeatQuizMutation.isPending ? 'Yaratilmoqda...' : 'Yaratish'}
                cancelText="Bekor qilish"
            />

            <RepeatedQuizSuccessModal quiz={repeatedQuiz} onClose={() => setRepeatedQuiz(null)} />
        </div>
    );
};

export default QuizzesPage;
