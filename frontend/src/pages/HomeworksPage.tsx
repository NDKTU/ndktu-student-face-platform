import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    BookOpen,
    CheckCircle2,
    Clock,
    ClipboardCheck,
    ClipboardList,
    Search,
    Trash2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAssignments, useDeleteAssignment } from '@/hooks/useAssignments';
import type { Assignment } from '@/services/assignmentService';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatCard } from '@/components/ui/StatCard';
import { toast } from 'sonner';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'pending' | 'overdue';

/** Sana formati butun ilovada bir xil — `utils/date.ts`. */
const shortDeadline = formatDateTime;

/** Muddat o'tgan-o'tmaganini hisoblash */
const isOverdue = (item: Assignment) => new Date(item.deadline).getTime() < Date.now();
const pendingCount = (item: Assignment) =>
    item.stats ? item.stats.submitted - item.stats.graded : 0;

export default function HomeworksPage() {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const canGrade = hasPermission('update:submission');
    const canDelete = hasPermission('delete:homework');
    const [deleting, setDeleting] = useState<Assignment | null>(null);
    const deleteAssignment = useDeleteAssignment();

    const query = useAssignments({ page: 1, limit: 200 });
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');

    const homeworks = useMemo(() => query.data?.homeworks ?? [], [query.data]);

    // Hisob-kitoblar (Statistika vidjetlari uchun)
    const statsMetrics = useMemo(() => {
        const total = homeworks.length;
        const pending = homeworks.reduce((sum, h) => sum + pendingCount(h), 0);
        const overdue = homeworks.filter(isOverdue).length;
        const active = total - overdue;
        return { total, pending, overdue, active: active >= 0 ? active : 0 };
    }, [homeworks]);

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return homeworks.filter((item) => {
            if (filter === 'pending' && pendingCount(item) === 0) return false;
            if (filter === 'overdue' && !isOverdue(item)) return false;
            if (!needle) return true;
            return [item.title, item.course_name, item.lesson_topic]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(needle));
        });
    }, [homeworks, search, filter]);

    const openHomework = (item: Assignment) => {
        if (canGrade) navigate(`/homework/${item.id}/submissions`);
        else if (item.lesson_id) navigate(`/lessons/${item.lesson_id}`);
        else navigate(`/courses/${item.course_id}`);
    };

    const allColumns: DataTableColumn<Assignment>[] = [
        {
            key: 'title',
            header: 'Vazifa',
            className: 'max-w-[20rem]',
            cell: (item) => (
                <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground hover:text-primary transition-colors">{item.title}</p>
                    <p className="truncate text-xs font-medium text-muted-foreground mt-0.5">
                        {[item.course_name, item.lesson_topic].filter(Boolean).join(' · ') || '—'}
                    </p>
                </div>
            ),
        },
        {
            key: 'deadline',
            header: 'Muddat',
            hideBelow: 'md',
            cell: (item) => {
                const overdue = isOverdue(item);
                return (
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                            overdue
                                ? 'bg-destructive/10 text-destructive border border-destructive/20'
                                : 'bg-primary/10 text-primary border border-primary/20'
                        )}
                    >
                        <Clock className="h-3 w-3" />
                        {shortDeadline(item.deadline)}
                    </span>
                );
            },
        },
        {
            key: 'author',
            header: 'Bergan',
            hideBelow: 'lg',
            cell: (item) => (
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.created_by_name || "noma'lum"}</p>
                    <p className="truncate text-xs text-muted-foreground">{shortDeadline(item.created_at)}</p>
                </div>
            ),
        },
        {
            key: 'submitted',
            header: 'Topshirdi',
            hideBelow: 'lg',
            cell: (item) =>
                item.stats ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-sm text-foreground">
                        {item.stats.submitted} <span className="text-muted-foreground font-normal">/ {item.stats.total_students}</span>
                    </span>
                ) : '—',
        },
        {
            key: 'pending',
            header: 'Tekshirilmagan',
            hideBelow: 'lg',
            cell: (item) => {
                const pending = pendingCount(item);
                return pending > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-warning/15 border border-warning/30 px-2.5 py-0.5 text-xs font-bold text-warning">
                        {pending} ta
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground font-medium">0</span>
                );
            },
        },
        {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (item) => (
                <div className="flex items-center justify-end gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap shadow-none"
                        onClick={(event) => { event.stopPropagation(); openHomework(item); }}
                    >
                        {canGrade ? <ClipboardCheck className="h-4 w-4 text-primary" /> : <BookOpen className="h-4 w-4 text-primary" />}
                        <span>{canGrade ? 'Tekshirish' : 'Darsga o\'tish'}</span>
                    </Button>
                    {canDelete && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                            aria-label="Vazifani o'chirish"
                            onClick={(event) => { event.stopPropagation(); setDeleting(item); }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    const columns = canGrade
        ? allColumns
        : allColumns.filter((column) => !['submitted', 'pending'].includes(column.key));

    const filters: Array<{ value: Filter; label: string; count: number }> = [
        { value: 'all', label: 'Hammasi', count: homeworks.length },
        ...(canGrade
            ? [{
                value: 'pending' as Filter,
                label: 'Tekshirilmagan',
                count: homeworks.filter((i) => pendingCount(i) > 0).length,
            }]
            : []),
        { value: 'overdue', label: "Muddati o'tgan", count: homeworks.filter(isOverdue).length },
    ];

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Page Header */}
            <PageHeader
                title="Uy vazifalari"
                description={
                    canGrade
                        ? "Barcha kurslaringizdagi vazifalar, topshirilgan ishlar va baholash jarayoni"
                        : 'Sizga berilgan barcha o\'quv topshiriqlari va muddatlari'
                }
            />

            {/* Wowdash CRM Statistics Row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Jami vazifalar"
                    value={statsMetrics.total}
                    icon={ClipboardList}
                    color="blue"
                    description="Barcha vazifalar"
                />
                <StatCard
                    label="Tekshirilmagan"
                    value={statsMetrics.pending}
                    icon={Clock}
                    color="orange"
                    description="Baholash kutilmoqda"
                />
                <StatCard
                    label="Faol topshiriqlar"
                    value={statsMetrics.active}
                    icon={CheckCircle2}
                    color="green"
                    description="Muddati amalda"
                />
                <StatCard
                    label="Muddati o'tgan"
                    value={statsMetrics.overdue}
                    icon={AlertCircle}
                    color="red"
                    description="Kechikkan ishlar"
                />
            </div>

            {/* Filters & Search Bar in Wowdash style */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
                    {filters.map((item) => (
                        <button
                            key={item.value}
                            onClick={() => setFilter(item.value)}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 cursor-pointer',
                                filter === item.value
                                    ? 'bg-primary text-white shadow-sm shadow-primary/30 ring-1 ring-primary/40'
                                    : 'bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary'
                            )}
                        >
                            <span>{item.label}</span>
                            <span
                                className={cn(
                                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                                    filter === item.value
                                        ? 'bg-white/20 text-white'
                                        : 'bg-border text-foreground'
                                )}
                            >
                                {item.count}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="relative sm:w-72">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Vazifa, kurs yoki dars..."
                        className="pl-10 h-10 rounded-xl bg-background border-border/80 text-sm focus:border-primary"
                    />
                </div>
            </div>

            {/* Main DataTable / Cards */}
            <DataTable
                columns={columns}
                data={visible}
                rowKey={(item) => item.id}
                isLoading={query.isLoading}
                isError={query.isError}
                onRetry={() => query.refetch()}
                onRowClick={openHomework}
                renderCard={(item) => (
                    <div
                        className="wow-card space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                        onClick={() => openHomework(item)}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-bold text-foreground text-sm line-clamp-1">{item.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                    {[item.course_name, item.lesson_topic].filter(Boolean).join(' · ') || '—'}
                                </p>
                            </div>
                            <span
                                className={cn(
                                    'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                    isOverdue(item)
                                        ? 'bg-destructive/10 text-destructive'
                                        : 'bg-primary/10 text-primary'
                                )}
                            >
                                <Clock className="h-3 w-3" />
                                {shortDeadline(item.deadline)}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
                            {item.stats && (
                                <span className="font-medium">
                                    Topshirdi: <strong className="text-foreground">{item.stats.submitted}</strong>/{item.stats.total_students}
                                </span>
                            )}
                            {pendingCount(item) > 0 && (
                                <span className="rounded-full bg-warning/15 px-2 py-0.5 font-bold text-warning">
                                    Tekshirilmagan: {pendingCount(item)}
                                </span>
                            )}
                        </div>
                    </div>
                )}
                emptyIcon={<ClipboardList className="h-8 w-8 text-primary" />}
                emptyTitle="Uy vazifasi yo'q"
                emptyDescription={
                    search || filter !== 'all'
                        ? "Filtrga mos keluvchi vazifa topilmadi."
                        : canGrade
                            ? "Dars sahifasiga o'tib yangi «Uy vazifasi» yarating."
                            : 'Hozircha sizga vazifa berilmagan.'
                }
            />

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={() => {
                    if (!deleting) return;
                    deleteAssignment.mutate(deleting.id, {
                        onSuccess: () => {
                            toast.success("Vazifa muvaffaqiyatli o'chirildi");
                            setDeleting(null);
                        },
                        onError: () => toast.error("Vazifani o'chirishda xatolik yuz berdi"),
                    });
                }}
                title="Vazifani o'chirish"
                description={`"${deleting?.title ?? ''}" vazifasi va unga topshirilgan barcha talabalar ishlari butunlay o'chiriladi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
}

