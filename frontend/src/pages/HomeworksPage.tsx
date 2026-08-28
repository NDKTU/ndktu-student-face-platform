import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ClipboardCheck, ClipboardList, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAssignments } from '@/hooks/useAssignments';
import type { Assignment } from '@/services/assignmentService';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';

type Filter = 'all' | 'pending' | 'overdue';

/** Muddat o'tgan-o'tmaganini bir joyda hisoblaymiz — jadvalda ham, filtrda ham kerak. */
const isOverdue = (item: Assignment) => new Date(item.deadline).getTime() < Date.now();
const pendingCount = (item: Assignment) =>
    item.stats ? item.stats.submitted - item.stats.graded : 0;
/** Jadvalda to'liq sana ustunni cho'zib yuboradi — qisqa ko'rinish. */
const shortDeadline = (value: string) =>
    new Date(value).toLocaleString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

export default function HomeworksPage() {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const canGrade = hasPermission('update:submission');

    const query = useAssignments({ page: 1, limit: 200 });
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');

    const homeworks = useMemo(() => query.data?.homeworks ?? [], [query.data]);

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

    // Statistika ustunlari — faqat tekshiruvchiga. Talabaga guruhdoshlari
    // qancha topshirgani kerak emas, unga o'z holati muhim.
    const allColumns: DataTableColumn<Assignment>[] = [
        {
            key: 'title',
            header: 'Vazifa',
            className: 'max-w-[20rem]',
            cell: (item) => (
                <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {[item.course_name, item.lesson_topic].filter(Boolean).join(' · ') || '—'}
                    </p>
                </div>
            ),
        },
        {
            key: 'deadline',
            header: 'Muddat',
            hideBelow: 'md',
            cell: (item) => (
                <span className={`whitespace-nowrap ${isOverdue(item) ? 'text-amber-600' : ''}`}>
                    {shortDeadline(item.deadline)}
                </span>
            ),
        },
        {
            key: 'author',
            header: 'Bergan',
            hideBelow: 'lg',
            cell: (item) => (
                <div className="min-w-0">
                    <p className="truncate text-sm">{item.created_by_name || "noma'lum"}</p>
                    <p className="truncate text-xs text-muted-foreground">{shortDeadline(item.created_at)}</p>
                </div>
            ),
        },
        {
            key: 'submitted',
            header: 'Topshirdi',
            hideBelow: 'lg',
            cell: (item) =>
                item.stats ? `${item.stats.submitted} / ${item.stats.total_students}` : '—',
        },
        {
            key: 'pending',
            header: 'Tekshirilmagan',
            hideBelow: 'lg',
            cell: (item) => {
                const pending = pendingCount(item);
                return pending > 0 ? (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                        {pending}
                    </span>
                ) : (
                    <span className="text-muted-foreground">0</span>
                );
            },
        },
        {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (item) => (
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={(event) => { event.stopPropagation(); openHomework(item); }}>
                    {canGrade ? <ClipboardCheck className="mr-2 h-4 w-4" /> : <BookOpen className="mr-2 h-4 w-4" />}
                    {canGrade ? 'Tekshirish' : 'Darsga o\'tish'}
                </Button>
            ),
        },
    ];
    const columns = canGrade
        ? allColumns
        : allColumns.filter((column) => !['submitted', 'pending'].includes(column.key));

    // PageTabs havolalarga qurilgan (URL bo'yicha), bu yerda esa filtr — holat.
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
        <div className="space-y-5">
            <PageHeader
                title="Uy vazifalari"
                description={
                    canGrade
                        ? "Barcha kurslaringizdagi vazifalar va topshirilgan ishlar bir joyda"
                        : 'Sizga berilgan uy vazifalari'
                }
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                    {filters.map((item) => (
                        <Button
                            key={item.value}
                            size="sm"
                            variant={filter === item.value ? 'primary' : 'outline'}
                            onClick={() => setFilter(item.value)}
                        >
                            {item.label} ({item.count})
                        </Button>
                    ))}
                </div>
                <div className="relative sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Vazifa, kurs yoki dars nomi"
                        className="pl-9"
                    />
                </div>
            </div>

            <DataTable
                columns={columns}
                data={visible}
                rowKey={(item) => item.id}
                isLoading={query.isLoading}
                isError={query.isError}
                onRetry={() => query.refetch()}
                onRowClick={openHomework}
                renderCard={(item) => (
                    <div className="space-y-2 rounded-xl border border-border/60 p-4" onClick={() => openHomework(item)}>
                        <div>
                            <p className="font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                                {[item.course_name, item.lesson_topic].filter(Boolean).join(' · ') || '—'}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className={isOverdue(item) ? 'text-amber-600' : undefined}>
                                {shortDeadline(item.deadline)}
                            </span>
                            {item.stats && <span>Topshirdi: {item.stats.submitted} / {item.stats.total_students}</span>}
                            {pendingCount(item) > 0 && (
                                <span className="text-amber-600">Tekshirilmagan: {pendingCount(item)}</span>
                            )}
                        </div>
                    </div>
                )}
                emptyIcon={<ClipboardList className="h-6 w-6" />}
                emptyTitle="Uy vazifasi yo'q"
                emptyDescription={
                    search || filter !== 'all'
                        ? "Filtrga mos vazifa topilmadi."
                        : canGrade
                            ? "Darsga kirib «Uy vazifasi» qo'shing."
                            : 'Hozircha sizga vazifa berilmagan.'
                }
            />
        </div>
    );
}
