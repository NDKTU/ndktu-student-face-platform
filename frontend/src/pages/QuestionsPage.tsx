import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Question } from '@/services/questionService';
import { Button } from '@/components/ui/Button';
import {
    Plus,
    Pencil,
    Trash2,
    Eye,
    Upload,
    Download,
    CheckCircle2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { sanitizeHtml } from '@/utils/sanitize';
import {
    useQuestions,
    useDeleteQuestion,
    useBulkDeleteQuestions,
    useDownloadQuestionsExcel,
} from '@/hooks/useQuestions';
import { useSubjects } from '@/hooks/useSubjects';
import { useTeachers } from '@/hooks/useTeachers';
import { useAuth } from '@/context/AuthContext';
import { useRoleView } from '@/hooks/useRoleView';
import { Combobox } from '@/components/ui/Combobox';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { QuestionExcelUploadModal } from '@/components/questions/QuestionExcelUploadModal';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

export const QuestionsPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, hasPermission } = useAuth();
    const { isTeacher } = useRoleView();

    const subjectIdParam = searchParams.get('subject_id');
    const teacherIdParam = searchParams.get('teacher_id');

    const [selectedSubject, setSelectedSubject] = useState<string>(subjectIdParam || 'all');
    const [selectedTeacher, setSelectedTeacher] = useState<string>(teacherIdParam || 'all');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 15;

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
    const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        if (subjectIdParam && subjectIdParam !== selectedSubject) {
            setSelectedSubject(subjectIdParam);
        }
        if (teacherIdParam && teacherIdParam !== selectedTeacher) {
            setSelectedTeacher(teacherIdParam);
        }
    }, [subjectIdParam, teacherIdParam]);

    const parsedSubjectId = selectedSubject !== 'all' && selectedSubject ? Number(selectedSubject) : undefined;
    const parsedTeacherId = selectedTeacher !== 'all' && selectedTeacher ? Number(selectedTeacher) : undefined;

    const effectiveOwnerUserId = isTeacher ? user?.id : parsedTeacherId;

    const {
        data: questionsData,
        isLoading: isQuestionsLoading,
        isError: isQuestionsError,
        refetch: refetchQuestions,
    } = useQuestions(currentPage, pageSize, debouncedSearch, parsedSubjectId, effectiveOwnerUserId);

    const { data: subjectsData } = useSubjects(1, 500);
    const { data: teachersData } = useTeachers(1, 500, undefined, !isTeacher && hasPermission('read:teacher'));

    const deleteQuestionMutation = useDeleteQuestion();
    const bulkDeleteMutation = useBulkDeleteQuestions();
    const downloadExcelMutation = useDownloadQuestionsExcel();

    const questions = questionsData?.questions || [];
    const totalPages = questionsData ? Math.ceil(questionsData.total / pageSize) : 1;
    const totalCount = questionsData?.total ?? questions.length;
    const subjects = subjectsData?.subjects || [];
    const teachers = teachersData?.teachers || [];

    const handleSubjectChange = (val: string) => {
        setSelectedSubject(val);
        setCurrentPage(1);
        const nextParams = new URLSearchParams(searchParams);
        if (val === 'all') {
            nextParams.delete('subject_id');
        } else {
            nextParams.set('subject_id', val);
        }
        setSearchParams(nextParams);
    };

    const handleTeacherChange = (val: string) => {
        setSelectedTeacher(val);
        setCurrentPage(1);
        const nextParams = new URLSearchParams(searchParams);
        if (val === 'all') {
            nextParams.delete('teacher_id');
        } else {
            nextParams.set('teacher_id', val);
        }
        setSearchParams(nextParams);
    };

    const subjectOptions = useMemo(() => {
        const list = subjects.map((s) => ({ value: String(s.id), label: s.name }));
        return [{ value: 'all', label: 'Barcha fanlar' }, ...list];
    }, [subjects]);

    const teacherOptions = useMemo(() => {
        const list = teachers.map((t) => ({
            value: String(t.user_id),
            label: t.full_name || t.user?.username || `ID: ${t.id}`,
        }));
        return [{ value: 'all', label: "Barcha o'qituvchilar" }, ...list];
    }, [teachers]);

    const getSubjectName = (subId?: number | null) => {
        if (!subId) return 'Fan biriktirilmagan';
        const s = subjects.find((item) => item.id === subId);
        return s ? s.name : `Fan #${subId}`;
    };

    const handleCreateQuestion = () => navigate('/questions/create');

    const handleEditQuestion = (question: Question, e: React.MouseEvent) => {
        e.stopPropagation();
        navigate(`/questions/${question.id}/edit`);
    };

    const handleDeleteClick = (question: Question, e: React.MouseEvent) => {
        e.stopPropagation();
        setQuestionToDelete(question);
        setIsDeleteModalOpen(true);
    };

    const handleViewQuestion = (question: Question) => {
        setSelectedQuestion(question);
        setIsDetailModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!questionToDelete) return;
        deleteQuestionMutation.mutate(questionToDelete.id, {
            onSuccess: () => {
                toast.success("Savol o'chirildi");
                setIsDeleteModalOpen(false);
                setQuestionToDelete(null);
                refetchQuestions();
            },
            onError: () => {
                toast.error("Savolni o'chirishda xatolik yuz berdi");
                setIsDeleteModalOpen(false);
                setQuestionToDelete(null);
            },
        });
    };

    const handleDownloadExcel = () => {
        if (!parsedSubjectId) {
            toast.error('Excel yuklab olish uchun fanni tanlang');
            return;
        }
        downloadExcelMutation.mutate({
            subject_id: parsedSubjectId,
            user_id: effectiveOwnerUserId,
        });
    };

    const handleBulkDelete = () => {
        if (!parsedSubjectId) {
            toast.error("O'chirish uchun fanni tanlang");
            return;
        }
        bulkDeleteMutation.mutate(
            { subject_id: parsedSubjectId, user_id: effectiveOwnerUserId ?? (user?.id || 0) },
            {
                onSuccess: (data: any) => {
                    toast.success(data?.detail || "Barcha savollar o'chirildi");
                    setIsBulkDeleteModalOpen(false);
                    refetchQuestions();
                },
                onError: () => {
                    toast.error("Savollarni o'chirishda xatolik yuz berdi");
                    setIsBulkDeleteModalOpen(false);
                },
            }
        );
    };

    const renderActions = (question: Question) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Ko'rish"
                onClick={() => handleViewQuestion(question)}
            >
                <Eye className="h-4 w-4" />
            </Button>
            <PermissionGate permission="update:question">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Tahrirlash"
                    onClick={(e) => handleEditQuestion(question, e)}
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:question">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                    title="O'chirish"
                    onClick={(e) => handleDeleteClick(question, e)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Unified Breadcrumbs Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Savollar', onClick: () => {} }]}
                title="Test Savollari Bazasi"
                description="Fanlar bo'yicha test savollari, variantlar, Excel import va eksport"
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Savol matni bo'yicha qidirish..."
                viewMode="table"
                onViewModeChange={() => {}}
                totalCount={totalCount}
                totalLabel="Savollar"
                extraFilters={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-[180px] sm:w-[220px]">
                            <Combobox
                                options={subjectOptions}
                                value={selectedSubject}
                                onChange={handleSubjectChange}
                                placeholder="Fan bo'yicha saralash"
                            />
                        </div>
                        {!isTeacher && teachers.length > 0 && (
                            <div className="w-[180px] sm:w-[220px]">
                                <Combobox
                                    options={teacherOptions}
                                    value={selectedTeacher}
                                    onChange={handleTeacherChange}
                                    placeholder="O'qituvchi bo'yicha"
                                />
                            </div>
                        )}
                    </div>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <PermissionGate permission="create:question">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsUploadModalOpen(true)}
                                className="h-9 gap-1.5 font-semibold"
                            >
                                <Upload className="h-4 w-4" />
                                <span className="hidden sm:inline">Excel Import</span>
                            </Button>
                        </PermissionGate>

                        {parsedSubjectId && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadExcel}
                                isLoading={downloadExcelMutation.isPending}
                                className="h-9 gap-1.5 font-semibold"
                            >
                                <Download className="h-4 w-4" />
                                <span className="hidden sm:inline">Excel Eksport</span>
                            </Button>
                        )}

                        <PermissionGate permission="create:question">
                            <Button
                                size="sm"
                                onClick={handleCreateQuestion}
                                className="h-9 gap-1.5 font-semibold shadow-sm"
                            >
                                <Plus className="h-4 w-4" />
                                <span>Qo'shish</span>
                            </Button>
                        </PermissionGate>
                    </div>
                }
            />

            {/* Content */}
            {isQuestionsError ? (
                <ErrorState onRetry={() => refetchQuestions()} />
            ) : isQuestionsLoading ? (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))}
                </div>
            ) : questions.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title="Savollar topilmadi"
                        description={
                            searchTerm || selectedSubject !== 'all'
                                ? "Tanlangan filtrlarga mos savol topilmadi."
                                : "Hozircha savollar bazasi bo'sh."
                        }
                    />
                </div>
            ) : (
                /* High-Density Optimized Table View */
                <Table className="min-w-full border-separate border-spacing-0">
                    <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="border-b border-border/80">
                            <TableHead className="w-[50px] text-center font-bold font-mono text-xs">#</TableHead>
                            <TableHead className="font-bold text-xs">Savol Matni</TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">Fan</TableHead>
                            <TableHead className="text-center font-bold text-xs">To'g'ri javob</TableHead>
                            <TableHead className="font-bold text-xs hidden lg:table-cell">Sana</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">Amallar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {questions.map((question, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;

                            return (
                                <TableRow
                                    key={question.id}
                                    onClick={() => handleViewQuestion(question)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Savol Matni Preview */}
                                    <TableCell>
                                        <div
                                            className="line-clamp-2 text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-relaxed max-w-[550px]"
                                            dangerouslySetInnerHTML={{
                                                __html: sanitizeHtml(question.text || ''),
                                            }}
                                        />
                                    </TableCell>

                                    {/* Fan */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="badge badge-primary text-xs">
                                            {getSubjectName(question.subject_id)}
                                        </span>
                                    </TableCell>

                                    {/* To'g'ri javob */}
                                    <TableCell className="text-center">
                                        {question.correct_option ? (
                                            <span className="inline-flex items-center justify-center min-w-[28px] rounded-lg bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                                                {question.correct_option}-variant
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>

                                    {/* Sana */}
                                    <TableCell className="hidden lg:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {question.created_at
                                                ? new Date(question.created_at).toLocaleDateString()
                                                : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Amallar */}
                                    <TableCell className="text-right pr-4">
                                        {renderActions(question)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    isLoading={isQuestionsLoading}
                />
            )}

            {/* Question Detail Modal */}
            {selectedQuestion && (
                <Modal
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                    title="Savol Tafsilotlari"
                >
                    <div className="space-y-4">
                        <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Fan: {getSubjectName(selectedQuestion.subject_id)}
                            </span>
                            <div
                                className="mt-2 text-base font-semibold text-foreground bg-muted/40 p-4 rounded-xl border border-border"
                                dangerouslySetInnerHTML={{
                                    __html: sanitizeHtml(selectedQuestion.text || ''),
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Variantlar:
                            </span>
                            <div className="space-y-2">
                                {[
                                    { key: 'A', text: selectedQuestion.option_a },
                                    { key: 'B', text: selectedQuestion.option_b },
                                    { key: 'C', text: selectedQuestion.option_c },
                                    { key: 'D', text: selectedQuestion.option_d },
                                ]
                                    .filter((opt) => Boolean(opt.text))
                                    .map((opt) => {
                                        const isCorrect =
                                            selectedQuestion.correct_option?.toUpperCase() === opt.key;
                                        return (
                                            <div
                                                key={opt.key}
                                                className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm font-medium ${
                                                    isCorrect
                                                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                        : 'border-border bg-card text-foreground'
                                                }`}
                                            >
                                                {isCorrect ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                                                ) : (
                                                    <span className="h-4 w-4 flex items-center justify-center font-mono text-xs text-muted-foreground shrink-0 mt-0.5 font-bold">
                                                        {opt.key}
                                                    </span>
                                                )}
                                                <div
                                                    className="flex-1"
                                                    dangerouslySetInnerHTML={{
                                                        __html: sanitizeHtml(opt.text || ''),
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-border">
                            <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
                                Yopish
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Excel Upload Modal */}
            <QuestionExcelUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                subjects={subjects}
                onSuccess={() => {
                    setIsUploadModalOpen(false);
                    refetchQuestions();
                }}
            />

            {/* Delete Single Question Dialog */}
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setQuestionToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Savolni o'chirish"
                description="Ushbu test savolini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi."
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />

            {/* Bulk Delete Dialog */}
            <ConfirmDialog
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onConfirm={handleBulkDelete}
                title="Barcha savollarni o'chirish"
                description="Tanlangan fan bo'yicha BARCHA savollarni o'chirishni tasdiqlaysizmi? Bu amalni qaytarib bo'lmaydi!"
                confirmText="Ha, barchasini o'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default QuestionsPage;
