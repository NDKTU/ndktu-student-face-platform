import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { useNavigate } from 'react-router-dom';
import type { Question, QuestionTeacherSummary } from '@/services/questionService';
import type { Subject } from '@/services/subjectService';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Loader2, FileQuestion, Upload, FileUp, Search, ArrowLeft, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { sanitizeHtml } from '@/utils/sanitize';
import { useQuestions, useDeleteQuestion, useUploadQuestions, useBulkDeleteQuestions, useDownloadQuestionsExcel, useQuestionCatalog } from '@/hooks/useQuestions';
import { useSubjects } from '@/hooks/useSubjects';
import { useUsers } from '@/hooks/useUsers';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';
import { Combobox } from '@/components/ui/Combobox';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { HierarchyHeader } from '@/components/catalog/HierarchyHeader';

// ─── Questions Table (shared by admin and teacher) ───────────────────────────

interface QuestionsTableProps {
    subjectId?: number;
    subjects: Subject[];
    onBack?: () => void;
    selectedSubjectName?: string;
    ownerUserId?: number;
}

const QuestionsTable = ({ subjectId, subjects, onBack, selectedSubjectName, ownerUserId }: QuestionsTableProps) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isTeacher = user?.roles?.some(r => r.name.toLowerCase() === 'teacher');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
    const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const downloadExcelMutation = useDownloadQuestionsExcel();

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reset page when switching subject
    useEffect(() => {
        setCurrentPage(1);
        setSearchTerm('');
        setDebouncedSearch('');
    }, [subjectId]);

    const { data: questionsData, isLoading: isQuestionsLoading, isError: isQuestionsError, refetch: refetchQuestions } = useQuestions(
        currentPage,
        pageSize,
        debouncedSearch,
        subjectId,
        ownerUserId ?? (isTeacher ? user?.id : undefined),
    );
    const deleteQuestionMutation = useDeleteQuestion();

    const questions = questionsData?.questions || [];
    const totalPages = questionsData ? Math.ceil(questionsData.total / pageSize) : 1;

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
            },
            onError: () => toast.error("Savolni o'chirishda xatolik yuz berdi"),
        });
    };

    const getSubjectName = (id?: number) => subjects.find(s => s.id === id)?.name || '-';

    const stripHtml = (html: string) => {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1">
                            <ArrowLeft className="h-4 w-4" />
                            Orqaga
                        </Button>
                    )}
                    <div>
                        <h1 className="page-title">
                            {selectedSubjectName ? `Savollar — ${selectedSubjectName}` : 'Savollar'}
                        </h1>
                        <p className="page-description mt-0.5">Savollar bankini boshqarish</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Qidirish..."
                            className="pl-8 w-[220px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => downloadExcelMutation.mutate(subjectId ? { subject_id: subjectId } : undefined)}
                        disabled={downloadExcelMutation.isPending}
                    >
                        {downloadExcelMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        Excel yuklab olish
                    </Button>
                    <Button variant="outline" onClick={() => setIsUploadModalOpen(true)}>
                        <Upload className="mr-2 h-4 w-4" />
                        Excel import
                    </Button>
                    <PermissionGate permission="delete:question">
                        <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => setIsBulkDeleteModalOpen(true)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Ommaviy o'chirish
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="create:question">
                        <Button onClick={handleCreateQuestion}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    {isQuestionsLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 6 }, (_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : isQuestionsError ? (
                        <ErrorState onRetry={() => refetchQuestions()} />
                    ) : questions.length === 0 ? (
                        <EmptyState
                            icon={<FileQuestion className="h-6 w-6" />}
                            title="Savollar topilmadi"
                            description="Qo'lda qo'shing yoki Excel dan import qiling."
                        />
                    ) : (
                        <div className="divide-y divide-border/60">
                            {questions.map((question, index) => {
                                const plainText = stripHtml(question.text);
                                return (
                                    <article
                                        key={question.id}
                                        role="button"
                                        tabIndex={0}
                                        className="group flex cursor-pointer items-start gap-4 px-1 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() => handleViewQuestion(question)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                handleViewQuestion(question);
                                            }
                                        }}
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">
                                            {(currentPage - 1) * pageSize + index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium leading-relaxed text-foreground">{plainText}</p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <span>{question.subject_name || selectedSubjectName || '-'}</span>
                                                <span aria-hidden="true">·</span>
                                                <span>{question.username || '-'}</span>
                                                <span className="badge badge-success">To'g'ri javob: {(question.correct_option || 'a').toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 gap-1" onClick={(event) => event.stopPropagation()}>
                                            <PermissionGate permission="update:question">
                                                <Button variant="ghost" size="sm" aria-label="Savolni tahrirlash" onClick={(event) => handleEditQuestion(question, event)}><Pencil className="h-4 w-4" /></Button>
                                            </PermissionGate>
                                            <PermissionGate permission="delete:question">
                                                <Button variant="ghost" size="sm" aria-label="Savolni o'chirish" className="text-destructive hover:text-destructive" onClick={(event) => handleDeleteClick(question, event)}><Trash2 className="h-4 w-4" /></Button>
                                            </PermissionGate>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isQuestionsLoading}
            />

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onSuccess={() => setIsUploadModalOpen(false)}
                subjects={subjects}
                defaultSubjectId={subjectId}
            />

            <BulkDeleteModal
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onSuccess={() => setIsBulkDeleteModalOpen(false)}
                subjects={subjects}
                defaultSubjectId={subjectId}
            />

            <QuestionDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                question={selectedQuestion}
                getSubjectName={getSubjectName}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Savolni o'chirish"
                description="Haqiqatan ham bu savolni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const QuestionsPage = () => {
    const { user } = useAuth();
    const isTeacher = user?.roles?.some(r => r.name.toLowerCase() === 'teacher');

    const [selectedTeacher, setSelectedTeacher] = useState<QuestionTeacherSummary | null>(null);
    const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedCatalogSearch(catalogSearch), 350);
        return () => window.clearTimeout(timer);
    }, [catalogSearch]);

    const catalog = useQuestionCatalog(debouncedCatalogSearch || undefined);

    // All subjects — needed for admin flat view and upload modal
    const { data: subjectsData } = useSubjects(1, 100);
    const subjects = subjectsData?.subjects || [];
    const activeTeacher = isTeacher ? catalog.data?.[0] ?? null : selectedTeacher;

    if (!isTeacher && !selectedTeacher) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Savollar"
                    description="O'qituvchini tanlang va savollar bankini ko'ring"
                    actions={
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="O'qituvchini qidirish..." className="w-[240px] pl-8" />
                        </div>
                    }
                />
                {catalog.isError ? <ErrorState onRetry={() => catalog.refetch()} /> : catalog.isLoading ? (
                    <CatalogGrid>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</CatalogGrid>
                ) : (catalog.data?.length ?? 0) === 0 ? (
                    <EmptyState icon={<FileQuestion className="h-6 w-6" />} title="Savollar topilmadi" description="Hozircha savol qo'shgan o'qituvchi yo'q." />
                ) : (
                    <CatalogGrid>
                        {catalog.data?.map((teacher) => (
                            <CatalogCard
                                key={teacher.teacher_user_id}
                                id={teacher.teacher_user_id}
                                title={teacher.full_name || teacher.username}
                                subtitle={teacher.kafedra_name || teacher.username}
                                metrics={[
                                    { label: 'Fan', value: teacher.subjects.length },
                                    { label: 'Savol', value: teacher.question_count, accent: true },
                                ]}
                                onClick={() => setSelectedTeacher(teacher)}
                            />
                        ))}
                    </CatalogGrid>
                )}
            </div>
        );
    }

    if (activeTeacher && selectedSubjectId === null) {
        return (
            <div className="space-y-6">
                {isTeacher ? (
                    <PageHeader title="Savollar" description="Fanni tanlang va savollarni ko'ring" />
                ) : (
                    <HierarchyHeader
                        title={activeTeacher.full_name || activeTeacher.username}
                        description={`${activeTeacher.kafedra_name || "O'qituvchi"} · Fanlar`}
                        onBack={() => setSelectedTeacher(null)}
                    />
                )}
                {activeTeacher.subjects.length === 0 ? (
                    <EmptyState title="Fanlar topilmadi" description="Ushbu o'qituvchida savollar mavjud emas." />
                ) : (
                    <CatalogGrid>
                        {activeTeacher.subjects.map((subject) => (
                            <CatalogCard
                                key={subject.subject_id}
                                id={subject.subject_id}
                                title={subject.subject_name}
                                subtitle="Savollar banki"
                                metrics={[{ label: 'Savol', value: subject.question_count, accent: true }]}
                                onClick={() => setSelectedSubjectId(subject.subject_id)}
                            />
                        ))}
                    </CatalogGrid>
                )}
            </div>
        );
    }

    const selectedSubjectSummary = activeTeacher?.subjects.find((item) => item.subject_id === selectedSubjectId);
    return (
        <QuestionsTable
            subjectId={selectedSubjectId ?? undefined}
            subjects={subjects}
            selectedSubjectName={selectedSubjectSummary?.subject_name}
            ownerUserId={activeTeacher?.teacher_user_id}
            onBack={() => setSelectedSubjectId(null)}
        />
    );
};

// ─── Modals ───────────────────────────────────────────────────────────────────

const QuestionDetailModal = ({
    isOpen,
    onClose,
    question,
    getSubjectName,
}: {
    isOpen: boolean;
    onClose: () => void;
    question: Question | null;
    getSubjectName: (id?: number) => string;
}) => {
    if (!question) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Savol tafsilotlari">
            <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Savol matni</h3>
                    <div
                        className="rounded-lg border bg-muted/50 p-4 text-sm"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.text) }}
                    />
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Variantlar</h3>
                    <div className="grid gap-3">
                        {[
                            { label: 'A', value: question.option_a },
                            { label: 'B', value: question.option_b },
                            { label: 'C', value: question.option_c },
                            { label: 'D', value: question.option_d },
                        ].map((option) => (
                            <div key={option.label} className="flex gap-3 items-start">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                                    {option.label}
                                </div>
                                <div
                                    className="w-full rounded-lg border p-3 text-sm min-h-[3rem]"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(option.value) }}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-2 border-t mt-4">
                    <p className="text-sm text-muted-foreground">
                        Fan: <span className="font-medium text-foreground">{getSubjectName(question.subject_id)}</span>
                    </p>
                </div>

                <div className="flex justify-end pt-2">
                    <Button onClick={onClose}>Yopish</Button>
                </div>
            </div>
        </Modal>
    );
};

const UploadModal = ({
    isOpen,
    onClose,
    onSuccess,
    subjects,
    defaultSubjectId,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    subjects: Subject[];
    defaultSubjectId?: number;
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ? String(defaultSubjectId) : '');
    const uploadMutation = useUploadQuestions();

    // Sync defaultSubjectId when it changes (e.g., navigating between subjects)
    useEffect(() => {
        setSubjectId(defaultSubjectId ? String(defaultSubjectId) : '');
    }, [defaultSubjectId]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = () => {
        if (!file || !subjectId) return;
        uploadMutation.mutate({ file, subject_id: parseInt(subjectId) }, {
            onSuccess: () => {
                toast.success('Savollar muvaffaqiyatli import qilindi');
                onSuccess();
            },
            onError: () => toast.error("Faylni yuklashda xatolik yuz berdi"),
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Excel dan savollar import qilish">
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Fan</label>
                    <Combobox
                        options={subjects.map(s => ({ value: String(s.id), label: s.name }))}
                        value={subjectId}
                        onChange={(val) => setSubjectId(val)}
                        placeholder="Fan tanlang"
                        searchPlaceholder="Fanni qidirish..."
                    />
                </div>
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-10">
                    <FileUp className="h-10 w-10 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-2">
                        Excel fayl (.xlsx) tanlang
                    </p>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-muted-foreground
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-primary/10 file:text-primary
                        hover:file:bg-primary/15"
                    />
                </div>
                {file && (
                    <div className="text-sm">
                        Tanlangan fayl: <span className="font-medium">{file.name}</span>
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button onClick={handleUpload} isLoading={uploadMutation.isPending} disabled={!file || !subjectId}>
                        Yuklash
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

const BulkDeleteModal = ({
    isOpen,
    onClose,
    onSuccess,
    subjects,
    defaultSubjectId,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    subjects: Subject[];
    defaultSubjectId?: number;
}) => {
    const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ? String(defaultSubjectId) : '');
    const [userId, setUserId] = useState<string>('');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const bulkDeleteMutation = useBulkDeleteQuestions();
    const { data: usersData, isLoading: isUsersLoading } = useUsers(1, 1000); // Fetch all users for selection
    const users = usersData?.users || [];

    // Sync defaultSubjectId when it changes
    useEffect(() => {
        setSubjectId(defaultSubjectId ? String(defaultSubjectId) : '');
    }, [defaultSubjectId]);

    const handleDelete = () => {
        if (!subjectId || !userId) {
            toast.error("Iltimos, fan va foydalanuvchini tanlang");
            return;
        }

        setIsConfirmOpen(true);
    };

    const handleConfirmDelete = () => {
        bulkDeleteMutation.mutate({
            subject_id: parseInt(subjectId),
            user_id: parseInt(userId)
        }, {
            onSuccess: (data: any) => {
                toast.success(`${data.deleted_count} ta savol o'chirildi`);
                setIsConfirmOpen(false);
                onSuccess();
            },
            onError: () => toast.error("Savollarni o'chirishda xatolik yuz berdi"),
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Savollarni ommaviy o'chirish">
            <div className="space-y-6">
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
                    <p className="font-semibold flex items-center gap-2">
                        <Trash2 className="h-4 w-4" />
                        Diqqat!
                    </p>
                    <p className="mt-1">
                        Tanlangan fan va foydalanuvchiga tegishli barcha savollar butunlay o'chirib tashlanadi.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground italic">
                            Fanni tanlang:
                        </label>
                        <Combobox
                            options={subjects.map(s => ({ value: String(s.id), label: s.name }))}
                            value={subjectId}
                            onChange={(val) => setSubjectId(val)}
                            placeholder="Fan tanlang"
                            searchPlaceholder="Fanni qidirish..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground italic">
                            Foydalanuvchini (username) tanlang:
                        </label>
                        <Combobox
                            options={users.map(u => ({ value: String(u.id), label: u.username }))}
                            value={userId}
                            onChange={(val) => setUserId(val)}
                            placeholder="Foydalanuvchi tanlang"
                            searchPlaceholder="Foydalanuvchini qidirish..."
                            disabled={isUsersLoading}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button 
                        variant="danger" 
                        onClick={handleDelete} 
                        isLoading={bulkDeleteMutation.isPending} 
                        disabled={!subjectId || !userId}
                    >
                        O'chirish
                    </Button>
                </div>

                <ConfirmDialog
                    isOpen={isConfirmOpen}
                    onClose={() => setIsConfirmOpen(false)}
                    onConfirm={handleConfirmDelete}
                    title="Savollarni ommaviy o'chirish"
                    description="Haqiqatan ham ushbu fan va foydalanuvchiga tegishli BARCHA savollarni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
                    confirmText="O'chirish"
                    isLoading={bulkDeleteMutation.isPending}
                />
            </div>
        </Modal>
    );
};

export default QuestionsPage;
