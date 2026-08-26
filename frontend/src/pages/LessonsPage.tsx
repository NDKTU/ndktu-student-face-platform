import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLessons, useCreateLesson, useUpdateLesson, useDeleteLesson } from '@/hooks/useLessons';
import { useTeachers, useTeacherAssignedGroups } from '@/hooks/useTeachers';
import { useTeacherAssignedSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Combobox } from '@/components/ui/Combobox';
import { tileFor, initialsOf } from '@/lib/avatarTiles';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Plus, Pencil, Trash2, Loader2, BookOpen, ChevronRight } from 'lucide-react';
import type { Lesson, LessonCreateRequest, LessonUpdateRequest } from '@/services/lessonService';

export default function LessonsPage() {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const isAdmin = user?.roles?.some(r => r.name.toLowerCase() === 'admin');
    const isTeacher = user?.roles?.some(r => r.name.toLowerCase() === 'teacher');

    const [page, setPage] = useState(1);
    const [filterGroupId, setFilterGroupId] = useState<string>('');
    const pageSize = 10;

    const filterGroupNum = filterGroupId ? parseInt(filterGroupId, 10) : undefined;
    const { data, isLoading, isError, refetch } = useLessons({ page, limit: pageSize, group_id: filterGroupNum });

    const createMutation = useCreateLesson();
    const updateMutation = useUpdateLesson();
    const deleteMutation = useDeleteLesson();

    const { data: teachersData } = useTeachers(1, 500, undefined, !!isAdmin && hasPermission('read:teacher'));
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));

    const { data: assignedSubjectsData } = useTeacherAssignedSubjects(
        isTeacher && user?.id ? user.id : undefined
    );
    const { data: assignedGroupsData } = useTeacherAssignedGroups(
        isTeacher && user?.id ? user.id : undefined
    );

    const subjectTeacherOptions = useMemo(() => {
        if (isTeacher && !isAdmin) {
            return (assignedSubjectsData?.subject_teachers ?? []).map(st => ({
                value: st.id.toString(),
                label: st.subject.name,
            }));
        }
        return (teachersData?.teachers ?? []).flatMap(t =>
            (t.teacher_subjects ?? []).map(st => ({
                value: st.id.toString(),
                label: `${t.full_name ?? ''} / ${st.subject?.name ?? '?'}`,
            }))
        );
    }, [isTeacher, isAdmin, teachersData, assignedSubjectsData]);

    const groupOptions = useMemo(() => {
        if (isTeacher && !isAdmin) {
            return (assignedGroupsData?.group_teachers ?? []).map(gt => ({
                value: gt.group_id.toString(),
                label: gt.group.name,
            }));
        }
        return (allGroupsData?.groups ?? []).map(g => ({
            value: g.id.toString(),
            label: g.name,
        }));
    }, [isTeacher, isAdmin, assignedGroupsData, allGroupsData]);

    // ── Modal state ─────────────────────────────────────────────────────────
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Lesson | null>(null);
    const [formSubjectTeacherId, setFormSubjectTeacherId] = useState('');
    const [formGroupId, setFormGroupId] = useState('');
    const [formTopic, setFormTopic] = useState('');
    const [formDate, setFormDate] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formError, setFormError] = useState('');

    const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);

    const openCreate = () => {
        setEditing(null);
        setFormSubjectTeacherId('');
        setFormGroupId('');
        setFormTopic('');
        setFormDate(new Date().toISOString().slice(0, 10));
        setFormDescription('');
        setFormError('');
        setIsModalOpen(true);
    };

    const openEdit = (lesson: Lesson) => {
        setEditing(lesson);
        setFormSubjectTeacherId(lesson.subject_teacher_id.toString());
        setFormGroupId(lesson.group_id.toString());
        setFormTopic(lesson.topic);
        setFormDate(lesson.date);
        setFormDescription(lesson.description ?? '');
        setFormError('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditing(null);
    };

    const validate = () => {
        if (!formSubjectTeacherId) return 'Fan/O\'qituvchi tanlanmagan';
        if (!formGroupId) return 'Guruh tanlanmagan';
        if (!formTopic.trim()) return 'Mavzu bo\'sh bo\'lishi mumkin emas';
        if (!formDate) return 'Sana tanlanmagan';
        return '';
    };

    const handleSubmit = () => {
        const err = validate();
        if (err) { setFormError(err); return; }

        const payload = {
            subject_teacher_id: parseInt(formSubjectTeacherId, 10),
            group_id: parseInt(formGroupId, 10),
            topic: formTopic.trim(),
            date: formDate,
            description: formDescription.trim() || null,
        };

        if (editing) {
            updateMutation.mutate(
                { id: editing.id, data: payload as LessonUpdateRequest },
                { onSuccess: closeModal, onError: () => setFormError('Xatolik yuz berdi') }
            );
        } else {
            createMutation.mutate(payload as LessonCreateRequest, {
                onSuccess: closeModal,
                onError: () => setFormError('Xatolik yuz berdi'),
            });
        }
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
    };

    const totalPages = data ? Math.ceil(data.total / pageSize) : 1;
    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Darslar"
                description={isAdmin ? 'Barcha darslar' : isTeacher ? 'Mening darslarim' : 'Mening guruhim darslari'}
                actions={
                    isAdmin ? (
                        <Button onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Yangi dars
                        </Button>
                    ) : undefined
                }
            />

            {(isAdmin || isTeacher) && groupOptions.length > 0 && (
                <div className="flex items-center gap-2 max-w-sm">
                    <span className="text-sm text-muted-foreground shrink-0">Guruh:</span>
                    <div className="flex-1">
                        <Combobox
                            options={[{ value: '', label: 'Barchasi' }, ...groupOptions]}
                            value={filterGroupId}
                            onChange={(v) => { setFilterGroupId(v); setPage(1); }}
                            placeholder="Barchasi"
                        />
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                    ))}
                </div>
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : !data || data.lessons.length === 0 ? (
                <EmptyState
                    icon={<BookOpen className="h-6 w-6" />}
                    title="Darslar yo'q"
                    description="Hozircha hech qanday dars qo'shilmagan."
                />
            ) : (
                /* Карточная сетка в стиле референса «Vazifalar» */
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {data.lessons.map(lesson => (
                        <div
                            key={lesson.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/lessons/${lesson.id}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/lessons/${lesson.id}`); } }}
                            className="group flex cursor-pointer flex-col rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                        >
                            <div className="flex items-start gap-3">
                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tileFor(lesson.id)}`}>
                                    {initialsOf(lesson.topic)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-display font-semibold leading-snug text-foreground line-clamp-2">{lesson.topic}</p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {lesson.subject_teacher?.subject?.name ?? `#${lesson.subject_teacher_id}`}
                                    </p>
                                </div>
                                {isAdmin ? (
                                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="sm" onClick={() => openEdit(lesson)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => setDeleteTarget(lesson)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                                )}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-4">
                                <div>
                                    <p className="font-display text-sm font-bold text-foreground">{lesson.date}</p>
                                    <p className="text-xs text-muted-foreground">Sana</p>
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-display text-sm font-bold text-primary">
                                        {lesson.group?.name ?? `#${lesson.group_id}`}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Guruh</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                isLoading={isLoading}
            />

            <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Darsni tahrirlash' : 'Yangi dars qo\'shish'}>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium block mb-1">Fan / O'qituvchi</label>
                        <Combobox
                            options={subjectTeacherOptions}
                            value={formSubjectTeacherId}
                            onChange={setFormSubjectTeacherId}
                            placeholder="Tanlang..."
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium block mb-1">Guruh</label>
                        <Combobox
                            options={groupOptions}
                            value={formGroupId}
                            onChange={setFormGroupId}
                            placeholder="Tanlang..."
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium block mb-1">Mavzu</label>
                        <Input
                            placeholder="Dars mavzusi"
                            value={formTopic}
                            onChange={(e) => setFormTopic(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium block mb-1">Sana</label>
                        <Input
                            type="date"
                            value={formDate}
                            onChange={(e) => setFormDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium block mb-1">Tavsif (ixtiyoriy)</label>
                        <textarea
                            className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Qisqacha izoh..."
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                        />
                    </div>
                    {formError && <p className="text-sm text-destructive">{formError}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={closeModal} disabled={isPending}>Bekor qilish</Button>
                        <Button onClick={handleSubmit} disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editing ? 'Saqlash' : 'Qo\'shish'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Darsni o'chirish"
                description={`"${deleteTarget?.topic}" darsini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
}
