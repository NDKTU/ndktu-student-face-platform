import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLesson, useLessonResults, useUpsertLessonResults } from '@/hooks/useLessons';
import { useGroupStudents } from '@/hooks/useGroups';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AssignmentFormModal } from '@/components/AssignmentFormModal';
import { useAssignments, useDeleteAssignment } from '@/hooks/useAssignments';
import { ArrowLeft, Clock, Loader2, Save, Plus, Pencil, Trash2 } from 'lucide-react';
import type { LessonAttendance, LessonResultUpsertItem } from '@/services/lessonService';
import type { Assignment } from '@/services/assignmentService';

type Row = {
    user_id: number;
    full_name: string;
    attendance: LessonAttendance;
    grade: string;
    notes: string;
};

const ATTENDANCE_OPTIONS: { value: LessonAttendance; label: string }[] = [
    { value: 'present', label: 'Keldi' },
    { value: 'absent', label: 'Kelmadi' },
    { value: 'late', label: 'Kechikdi' },
];

export default function LessonDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const lessonId = id ? parseInt(id, 10) : undefined;

    const isAdmin = user?.roles?.some(r => r.name.toLowerCase() === 'admin');
    const isTeacher = user?.roles?.some(r => r.name.toLowerCase() === 'teacher');
    const canEdit = !!(isAdmin || isTeacher);

    const { data: lesson, isLoading: isLessonLoading } = useLesson(lessonId);
    const { data: studentsData } = useGroupStudents(lesson?.group_id);
    const { data: resultsData } = useLessonResults(lessonId);

    const upsertMutation = useUpsertLessonResults();

    const { data: assignmentsData } = useAssignments(lessonId ? { lesson_id: lessonId, limit: 100 } : undefined);
    const lessonAssignments = lessonId ? assignmentsData?.assignments ?? [] : [];
    const deleteAssignmentMutation = useDeleteAssignment();

    const [rows, setRows] = useState<Row[]>([]);
    const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
    const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null);
    const [nowSnapshot] = useState(() => Date.now());

    const studentList = useMemo(() => studentsData?.students ?? [], [studentsData]);
    const resultByUserId = useMemo(() => {
        const m = new Map<number, { attendance: LessonAttendance; grade: number | null; notes: string | null }>();
        (resultsData?.results ?? []).forEach(r => m.set(r.user_id, {
            attendance: r.attendance,
            grade: r.grade ?? null,
            notes: r.notes ?? null,
        }));
        return m;
    }, [resultsData]);

    useEffect(() => {
        if (!canEdit) return;
        const next: Row[] = studentList
            .filter(s => s.user_id != null)
            .map(s => {
                const existing = resultByUserId.get(s.user_id!);
                return {
                    user_id: s.user_id!,
                    full_name: s.full_name || `Talaba #${s.id}`,
                    attendance: existing?.attendance ?? 'present',
                    grade: existing?.grade != null ? String(existing.grade) : '',
                    notes: existing?.notes ?? '',
                };
            });
        setRows(next);
    }, [studentList, resultByUserId, canEdit]);

    const updateRow = (idx: number, patch: Partial<Row>) => {
        setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    };

    const handleSave = () => {
        if (!lessonId) return;
        const items: LessonResultUpsertItem[] = rows.map(r => {
            const gradeNum = r.grade.trim() === '' ? null : parseInt(r.grade, 10);
            return {
                user_id: r.user_id,
                attendance: r.attendance,
                grade: gradeNum != null && !Number.isNaN(gradeNum) ? gradeNum : null,
                notes: r.notes.trim() || null,
            };
        });
        upsertMutation.mutate({ lessonId, items });
    };

    if (isLessonLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }
    if (!lesson) {
        return (
            <EmptyState
                title="Dars topilmadi"
                description="Bu dars o'chirilgan yoki mavjud emas."
                action={
                    <Button variant="outline" onClick={() => navigate('/lessons')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Darslarga qaytish
                    </Button>
                }
            />
        );
    }

    const studentResults = resultsData?.results ?? [];

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Button variant="ghost" size="sm" onClick={() => navigate('/lessons')} className="-ml-2">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Orqaga
                </Button>
                <PageHeader
                    title={lesson.topic}
                    description={[
                        lesson.date,
                        lesson.subject_teacher?.subject?.name,
                        lesson.group?.name,
                    ].filter(Boolean).join(' · ')}
                />
                {lesson.description && (
                    <p className="text-sm text-foreground/80">{lesson.description}</p>
                )}
            </div>

            {lesson.sinf_id && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Topshiriqlar</CardTitle>
                        {canEdit && (
                            <Button
                                size="sm"
                                onClick={() => { setEditingAssignment(null); setAssignmentModalOpen(true); }}
                            >
                                <Plus className="h-4 w-4 mr-2" /> Topshiriq qo'shish
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        {lessonAssignments.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                Bu darsga hali topshiriq yo'q.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {lessonAssignments.map((a) => {
                                    const dlDate = new Date(a.deadline);
                                    const overdue = dlDate.getTime() < nowSnapshot;
                                    return (
                                        <div
                                            key={a.id}
                                            className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3 hover:shadow-sm hover:border-primary/20 transition-all duration-300"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium truncate">{a.title}</p>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                                    <Clock className="h-3 w-3" />
                                                    <span className={overdue ? 'text-destructive' : ''}>
                                                        {dlDate.toLocaleString()}
                                                    </span>
                                                    <span>· max {a.max_grade}</span>
                                                    {a.stats && (
                                                        <span>· {a.stats.submitted}/{a.stats.total_students} topshirgan</span>
                                                    )}
                                                </div>
                                                {a.description && (
                                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                        {a.description}
                                                    </p>
                                                )}
                                            </div>
                                            {canEdit && (
                                                <div className="flex gap-1 shrink-0">
                                                    <button
                                                        onClick={() => { setEditingAssignment(a); setAssignmentModalOpen(true); }}
                                                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                                        title="Tahrirlash"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setAssignmentToDelete(a)}
                                                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                        title="O'chirish"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Natijalar</CardTitle>
                </CardHeader>
                <CardContent>
                    {canEdit ? (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>F.I.SH</TableHead>
                                        <TableHead className="w-[160px]">Qatnashish</TableHead>
                                        <TableHead className="w-[100px]">Baho (0-5)</TableHead>
                                        <TableHead>Izoh</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((r, idx) => (
                                        <TableRow key={r.user_id}>
                                            <TableCell className="font-medium">{r.full_name}</TableCell>
                                            <TableCell>
                                                <select
                                                    value={r.attendance}
                                                    onChange={(e) => updateRow(idx, { attendance: e.target.value as LessonAttendance })}
                                                    className="w-full rounded-xl border border-border/60 bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-200"
                                                >
                                                    {ATTENDANCE_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={5}
                                                    value={r.grade}
                                                    onChange={(e) => updateRow(idx, { grade: e.target.value })}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={r.notes}
                                                    onChange={(e) => updateRow(idx, { notes: e.target.value })}
                                                    placeholder="Izoh..."
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {rows.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                                Bu guruhda talabalar topilmadi.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            {rows.length > 0 && (
                                <div className="mt-4 flex justify-end">
                                    <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                                        {upsertMutation.isPending
                                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            : <Save className="h-4 w-4 mr-2" />}
                                        Saqlash
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Qatnashish</TableHead>
                                    <TableHead>Baho</TableHead>
                                    <TableHead>Izoh</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {studentResults.map(r => {
                                    const label = ATTENDANCE_OPTIONS.find(o => o.value === r.attendance)?.label ?? r.attendance;
                                    return (
                                        <TableRow key={r.id}>
                                            <TableCell>{label}</TableCell>
                                            <TableCell>{r.grade ?? '-'}</TableCell>
                                            <TableCell className="text-muted-foreground">{r.notes ?? '-'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {studentResults.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                            Hali natija qo'shilmagan.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {lesson.sinf_id && (
                <AssignmentFormModal
                    isOpen={assignmentModalOpen}
                    onClose={() => { setAssignmentModalOpen(false); setEditingAssignment(null); }}
                    sinfId={lesson.sinf_id}
                    lessonId={lesson.id}
                    topicId={lesson.topic_id ?? null}
                    editing={editingAssignment}
                />
            )}

            <ConfirmDialog
                isOpen={!!assignmentToDelete}
                onClose={() => setAssignmentToDelete(null)}
                onConfirm={() => {
                    if (!assignmentToDelete) return;
                    deleteAssignmentMutation.mutate(assignmentToDelete.id, {
                        onSuccess: () => setAssignmentToDelete(null),
                    });
                }}
                title="Topshiriqni o'chirish"
                description={`"${assignmentToDelete?.title}" topshirig'ini o'chirmoqchimisiz?`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
}
