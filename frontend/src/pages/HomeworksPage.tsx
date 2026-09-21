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
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatCard } from '@/components/ui/StatCard';
import { toast } from 'sonner';
import { formatDateTime } from '@/utils/date';
import { splitCourseName } from '@/utils/generatedNames';
import { cn } from '@/lib/utils';
import { LATE_CLASS, REVIEW_CLASS, deadlineHint, lateBy } from '@/components/homework/homeworkStatus';

/**
 * `pending` — o'qituvchida «tekshirilmagan ishi bor», talabada «hali
 * topshirmagan». `graded` faqat talabada.
 */
type Filter = 'all' | 'pending' | 'graded' | 'overdue';

/** Sana formati butun ilovada bir xil — `utils/date.ts`. */
const shortDeadline = formatDateTime;

/** Topshirish muddati tugaganmi (vazifaning o'zi, talabaning ishi emas). */
const isOverdue = (item: Assignment) => new Date(item.deadline).getTime() < Date.now();
const pendingCount = (item: Assignment) =>
    item.stats ? item.stats.submitted - item.stats.graded : 0;

/** Talabaning shu vazifadagi holati. */
type MyState = 'todo' | 'missed' | 'waiting' | 'graded';
const myState = (item: Assignment): MyState => {
    const mine = item.my_submission;
    if (!mine) return isOverdue(item) ? 'missed' : 'todo';
    return mine.status === 'graded' ? 'graded' : 'waiting';
};

const MY_STATE_LABEL: Record<MyState, string> = {
    todo: 'Topshirilmagan',
    missed: 'Topshirilmagan · muddat tugagan',
    waiting: 'Topshirildi · tekshirilmoqda',
    graded: 'Baholandi',
};

const MY_STATE_CLASS: Record<MyState, string> = {
    todo: 'border-primary/25 bg-primary/10 text-primary',
    missed: LATE_CLASS,
    waiting: REVIEW_CLASS.pending,
    graded: REVIEW_CLASS.graded,
};

/**
 * Kurs filtri variantlari — faqat vazifasi bor kurslar, har birida nechta vazifa.
 *
 * Kurs nomi uzun («Fan — 19A-26, 19B-26, 19G-26 +1 (ma'ruza, bahorgi semestr)»)
 * va tugmaga sig'maydi. Shuning uchun birinchi qatorda fan va tur, ikkinchisida
 * guruhlar, semestr va vazifalar soni. Bir fanning ma'ruza va amaliyot kursi
 * tur bilan ajraladi; tur ham bir xil bo'lsa — guruhlar bilan.
 */
function buildCourseOptions(homeworks: Assignment[]): ComboboxOption[] {
    const counts = new Map<number, { name: string; count: number }>();
    for (const item of homeworks) {
        const entry = counts.get(item.course_id);
        if (entry) entry.count += 1;
        else counts.set(item.course_id, { name: item.course_name || `Kurs #${item.course_id}`, count: 1 });
    }
    const courses = [...counts].map(([id, { name, count }]) => {
        const parts = splitCourseName(name);
        return { id, name, count, parts, label: parts.type ? `${parts.subject} (${parts.type})` : parts.subject };
    });
    const sameLabel = new Map<string, number>();
    for (const course of courses) sameLabel.set(course.label, (sameLabel.get(course.label) ?? 0) + 1);

    return courses
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((course) => ({
            value: String(course.id),
            label: (sameLabel.get(course.label) ?? 0) > 1 && course.parts.groups
                ? `${course.label} — ${course.parts.groups}`
                : course.label,
            hint: [course.parts.groups, course.parts.semester, `${course.count} ta vazifa`].filter(Boolean).join(' · '),
        }));
}

function MyStateBadge({ item }: { item: Assignment }) {
    const state = myState(item);
    const late = lateBy(item.my_submission?.submitted_at, item.deadline);
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', MY_STATE_CLASS[state])}>
                {state === 'graded' && item.my_submission?.grade != null
                    ? `Baho: ${item.my_submission.grade} / ${item.max_grade}`
                    : MY_STATE_LABEL[state]}
            </span>
            {late && (
                <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', LATE_CLASS)}>
                    {late} kech
                </span>
            )}
        </div>
    );
}

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
    const [course, setCourse] = useState('');

    const allHomeworks = useMemo(() => query.data?.homeworks ?? [], [query.data]);
    const courseOptions = useMemo(() => buildCourseOptions(allHomeworks), [allHomeworks]);
    // Tanlangan kursning oxirgi vazifasi o'chirilsa, filtr bo'sh ro'yxatda
    // qotib qolmasin — «Barcha kurslar» ga qaytamiz.
    const activeCourse = courseOptions.some((option) => option.value === course) ? course : '';
    // Kurs tanlansa, statistika va holat filtrlaridagi sonlar ham shu kurs
    // bo'yicha: aks holda «Topshirishim kerak: 3» ro'yxatdagi 1 ta bilan chalg'itardi.
    const homeworks = useMemo(
        () => (activeCourse ? allHomeworks.filter((item) => String(item.course_id) === activeCourse) : allHomeworks),
        [allHomeworks, activeCourse],
    );

    // Hisob-kitoblar (Statistika vidjetlari uchun)
    const statsMetrics = useMemo(() => {
        const total = homeworks.length;
        const pending = homeworks.reduce((sum, h) => sum + pendingCount(h), 0);
        const overdue = homeworks.filter(isOverdue).length;
        const active = total - overdue;
        const count = (state: MyState) => homeworks.filter((h) => myState(h) === state).length;
        return {
            total,
            pending,
            overdue,
            active: active >= 0 ? active : 0,
            todo: count('todo'),
            missed: count('missed'),
            waiting: count('waiting'),
            graded: count('graded'),
        };
    }, [homeworks]);

    // Filtr ma'nosi rolga bog'liq: o'qituvchida «tekshirish kerak»,
    // talabada «topshirish kerak».
    const matchesFilter = (item: Assignment, value: Filter) => {
        if (value === 'overdue') return isOverdue(item);
        if (value === 'pending') return canGrade ? pendingCount(item) > 0 : myState(item) === 'todo';
        if (value === 'graded') return myState(item) === 'graded';
        return true;
    };

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return homeworks.filter((item) => {
            if (!matchesFilter(item, filter)) return false;
            if (!needle) return true;
            return [item.title, item.course_name, item.lesson_topic]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(needle));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesFilter faqat canGrade ga bog'liq
    }, [homeworks, search, filter, canGrade]);

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
                        {[activeCourse ? null : item.course_name, item.lesson_topic].filter(Boolean).join(' · ') || '—'}
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
                    <div>
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
                    <p className={cn('mt-1 text-[11px]', overdue ? 'text-destructive' : 'text-muted-foreground')}>
                        {deadlineHint(item.deadline)}
                    </p>
                    </div>
                );
            },
        },
        {
            key: 'mine',
            header: 'Mening holatim',
            cell: (item) => <MyStateBadge item={item} />,
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
            header: 'Topshirganlar',
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
                        <span>
                            {canGrade
                                ? pendingCount(item) > 0 ? `Tekshirish (${pendingCount(item)})` : "Ishlarni ko'rish"
                                : myState(item) === 'todo' ? 'Topshirish' : "Ko'rish"}
                        </span>
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
        ? allColumns.filter((column) => column.key !== 'mine')
        : allColumns.filter((column) => !['submitted', 'pending'].includes(column.key));

    const filterDefs: Array<{ value: Filter; label: string }> = canGrade
        ? [
            { value: 'all', label: 'Hammasi' },
            { value: 'pending', label: 'Tekshirilmagan ishi bor' },
            { value: 'overdue', label: 'Muddati tugagan' },
        ]
        : [
            { value: 'all', label: 'Hammasi' },
            { value: 'pending', label: 'Topshirishim kerak' },
            { value: 'graded', label: 'Baholangan' },
            { value: 'overdue', label: 'Muddati tugagan' },
        ];
    const filters = filterDefs.map((item) => ({
        ...item,
        count: homeworks.filter((h) => matchesFilter(h, item.value)).length,
    }));

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
            {canGrade ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="Jami vazifalar"
                        value={statsMetrics.total}
                        icon={ClipboardList}
                        color="blue"
                        description="Kurslaringizdagi barcha vazifalar"
                    />
                    <StatCard
                        label="Tekshirilmagan ishlar"
                        value={statsMetrics.pending}
                        icon={Clock}
                        color="orange"
                        description="Talabalar topshirgan, baho qo'yilmagan"
                    />
                    <StatCard
                        label="Topshirish davom etmoqda"
                        value={statsMetrics.active}
                        icon={CheckCircle2}
                        color="green"
                        description="Muddati hali tugamagan vazifalar"
                    />
                    <StatCard
                        label="Muddati tugagan"
                        value={statsMetrics.overdue}
                        icon={AlertCircle}
                        color="red"
                        description="Endi faqat kech topshirish mumkin"
                    />
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="Topshirishim kerak"
                        value={statsMetrics.todo}
                        icon={Clock}
                        color="blue"
                        description="Muddati hali tugamagan"
                    />
                    <StatCard
                        label="Tekshirilmoqda"
                        value={statsMetrics.waiting}
                        icon={ClipboardList}
                        color="orange"
                        description="Topshirdim, baho kutilmoqda"
                    />
                    <StatCard
                        label="Baholangan"
                        value={statsMetrics.graded}
                        icon={CheckCircle2}
                        color="green"
                        description="O'qituvchi baho qo'ygan"
                    />
                    <StatCard
                        label="Topshirilmay qolgan"
                        value={statsMetrics.missed}
                        icon={AlertCircle}
                        color="red"
                        description="Muddat tugagan — kech topshirish mumkin"
                    />
                </div>
            )}

            {/* Filters & Search Bar in Wowdash style */}
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
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

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center 2xl:shrink-0">
                    {courseOptions.length > 0 && (
                        <div className="sm:w-80" title="Kurs bo'yicha filtr">
                            <Combobox
                                options={[
                                    { value: '', label: 'Barcha kurslar', hint: `${allHomeworks.length} ta vazifa` },
                                    ...courseOptions,
                                ]}
                                value={activeCourse}
                                onChange={setCourse}
                                placeholder="Barcha kurslar"
                                searchPlaceholder="Kurs yoki guruh..."
                                className="md:h-10"
                            />
                        </div>
                    )}
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
                                    {[activeCourse ? null : item.course_name, item.lesson_topic].filter(Boolean).join(' · ') || '—'}
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
                            {!canGrade && <MyStateBadge item={item} />}
                            {canGrade && item.stats && (
                                <span className="font-medium">
                                    Topshirganlar: <strong className="text-foreground">{item.stats.submitted}</strong>/{item.stats.total_students}
                                </span>
                            )}
                            {canGrade && pendingCount(item) > 0 && (
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
                    search || filter !== 'all' || activeCourse
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

