import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import type { Subject } from '@/services/subjectService';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject } from '@/hooks/useSubjects';

const subjectSchema = z.object({
    name: z.string().min(1, 'Fan nomi kiritilishi shart'),
});

type SubjectFormValues = z.infer<typeof subjectSchema>;

const SubjectsPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: subjectsData, isLoading: isSubjectsLoading, isError: isSubjectsError, refetch } = useSubjects(currentPage, pageSize, debouncedSearch);
    const deleteSubjectMutation = useDeleteSubject();

    const subjects = subjectsData?.subjects || [];
    const totalPages = subjectsData ? Math.ceil(subjectsData.total / pageSize) : 1;

    const handleDeleteClick = (subject: Subject) => {
        setSubjectToDelete(subject);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!subjectToDelete) return;

        deleteSubjectMutation.mutate({ id: subjectToDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                toast.success("Fan o'chirildi");
                setIsDeleteModalOpen(false);
                setSubjectToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error("O'chirishda xatolik yuz berdi");
                    setIsDeleteModalOpen(false);
                    setSubjectToDelete(null);
                    setCascadeWarnings([]);
                }
            }
        });
    };

    const handleSuccess = (_savedSubject?: Subject) => {
        setIsModalOpen(false);
    };

    // Кнопки действий — общие для строки таблицы и мобильной карточки
    const renderActions = (subject: Subject) => (
        <div className="flex justify-end gap-2">
            {!isExternal(subject) && (
                <>
                    <PermissionGate permission="update:subject">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedSubject(subject); setIsModalOpen(true); }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:subject">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClick(subject)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
        </div>
    );

    const columns: DataTableColumn<Subject>[] = [
        { key: 'id', header: 'ID', headClassName: 'w-[80px]', cell: (subject) => subject.id },
        {
            key: 'name',
            header: 'Nomi',
            className: 'font-medium capitalize',
            cell: (subject) => (
                <span className="inline-flex items-center gap-2">
                    {subject.name}
                    <ExternalSourceBadge row={subject} />
                    <InactiveBadge row={subject} />
                </span>
            ),
        },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            hideBelow: 'lg',
            cell: (subject) => new Date(subject.created_at).toLocaleDateString(),
        },
        {
            key: 'actions',
            header: 'Amallar',
            headClassName: 'text-right',
            // Записи зеркала не редактируются: правку отклонит бэкенд.
            cell: (subject) => renderActions(subject),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fanlar"
                description="O'quv fanlarini boshqarish"
                actions={
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Qidirish..."
                                className="pl-8 w-[220px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <PermissionGate permission="create:subject">
                            <Button onClick={() => { setSelectedSubject(null); setIsModalOpen(true); }}>
                                <Plus className="mr-2 h-4 w-4" />
                                Qo'shish
                            </Button>
                        </PermissionGate>
                    </>
                }
            />

            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={subjects}
                        rowKey={(subject) => subject.id}
                        isLoading={isSubjectsLoading}
                        isError={isSubjectsError}
                        onRetry={() => refetch()}
                        emptyTitle="Fanlar topilmadi"
                        emptyDescription="Hozircha fan qo'shilmagan yoki qidiruvga mos fan yo'q."
                        renderCard={(subject) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium capitalize text-foreground">
                                            <span className="inline-flex flex-wrap items-center gap-2">
                                                {subject.name}
                                                <ExternalSourceBadge row={subject} />
                                                <InactiveBadge row={subject} />
                                            </span>
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            ID: {subject.id} · {new Date(subject.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {renderActions(subject)}
                                </div>
                            </div>
                        )}
                    />
                </CardContent>
            </Card>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isSubjectsLoading}
            />

            <SubjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                subject={selectedSubject}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setSubjectToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Fanni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu fanni o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${subjectToDelete?.name}" fanini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

const SubjectModal = ({
    isOpen,
    onClose,
    subject,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    subject: Subject | null;
    onSuccess: (subject?: Subject) => void;
}) => {
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<SubjectFormValues>({
        resolver: zodResolver(subjectSchema),
        defaultValues: { name: '' },
    });

    const createMutation = useCreateSubject();
    const updateMutation = useUpdateSubject();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        if (subject) {
            reset({
                name: subject.name,
            });
        } else {
            reset({
                name: '',
            });
        }
    }, [subject, reset]);

    const onSubmit = (data: SubjectFormValues) => {
        if (subject) {
            updateMutation.mutate({ id: subject.id, data }, {
                onSuccess: (data) => {
                    toast.success('Fan yangilandi');
                    onSuccess(data);
                },
                onError: () => toast.error('Fanni yangilashda xatolik'),
            });
        } else {
            createMutation.mutate(data, {
                onSuccess: (data) => {
                    toast.success('Fan yaratildi');
                    onSuccess(data);
                },
                onError: () => toast.error('Fan yaratishda xatolik'),
            });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={subject ? 'Fanni tahrirlash' : 'Fan yaratish'}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                    label="Fan nomi"
                    {...register('name')}
                    error={errors.name?.message}
                    placeholder="Fan nomini kiriting"
                />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        {subject ? 'Yangilash' : 'Yaratish'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default SubjectsPage;
