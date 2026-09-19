import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ChevronDown,
    Clock3,
    FileText,
    Loader2,
    UserX,
    Users,
} from 'lucide-react';
import { useAssignment, useGradeSubmission, useSubmissions } from '@/hooks/useAssignments';
import type { Assignment, Submission, SubmissionFile } from '@/services/assignmentService';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import {
    LATE_CLASS,
    REVIEW_CLASS,
    REVIEW_LABEL,
    answerFormatLabel,
    deadlineHint,
    isPastDeadline,
    lateBy,
    reviewState,
} from '@/components/homework/homeworkStatus';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

type Filter = 'pending' | 'graded' | 'missing' | 'all';

export default function HomeworkSubmissionsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const homeworkId = id ? Number.parseInt(id, 10) : undefined;

    const homeworkQuery = useAssignment(homeworkId);
    const submissionsQuery = useSubmissions(homeworkId);

    const homework = homeworkQuery.data;
    const submissions = useMemo(() => submissionsQuery.data?.submissions ?? [], [submissionsQuery.data]);
    const notSubmitted = useMemo(() => submissionsQuery.data?.not_submitted ?? [], [submissionsQuery.data]);

    // Tanlanmagan bo'lsa — ish bor joy: avval tekshirilmaganlar.
    const [chosenFilter, setChosenFilter] = useState<Filter | null>(null);

    const pendingList = useMemo(
        () => submissions.filter((item) => reviewState(item.status) === 'pending'),
        [submissions],
    );
    const gradedList = useMemo(
        () => submissions.filter((item) => reviewState(item.status) === 'graded'),
        [submissions],
    );

    if (homeworkQuery.isLoading || submissionsQuery.isLoading) {
        return (
            <div className="space-y-6 animate-pulse">
                <Skeleton className="h-10 w-64 rounded-xl" />
                <div className="grid gap-4 sm:grid-cols-4">
                    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
                </div>
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        );
    }

    if (homeworkQuery.isError || submissionsQuery.isError) {
        return <ErrorState onRetry={() => { void homeworkQuery.refetch(); void submissionsQuery.refetch(); }} />;
    }
    if (!homework || !homeworkId) {
        return <EmptyState title="Vazifa topilmadi" description="Bu uy vazifasi mavjud emas." />;
    }

    const filter: Filter = chosenFilter ?? (pendingList.length > 0 ? 'pending' : 'all');
    // Topshirgan + topshirmagan: hisobi yo'q talaba (ish yubora olmaydi)
    // sanalmaydi, aks holda ikki son yig'indisi «jami» ga teng bo'lmasdi.
    const totalStudents = submissionsQuery.data?.not_submitted
        ? submissions.length + notSubmitted.length
        : homework.stats?.total_students ?? submissions.length;

    // "Hammasi" da tekshirilmaganlar tepada: o'qituvchi aynan ular uchun keladi.
    const visible =
        filter === 'pending' ? pendingList
            : filter === 'graded' ? gradedList
                : filter === 'all' ? [...pendingList, ...gradedList]
                    : [];

    const filters: { value: Filter; label: string; count: number }[] = [
        { value: 'pending', label: 'Tekshirilmagan', count: pendingList.length },
        { value: 'graded', label: 'Baholangan', count: gradedList.length },
        { value: 'missing', label: 'Topshirmagan', count: notSubmitted.length },
        { value: 'all', label: 'Barcha topshirilgan ishlar', count: submissions.length },
    ];

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="space-y-3">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-xl text-xs font-bold shadow-none"
                    onClick={() => navigate(homework.lesson_id ? `/lessons/${homework.lesson_id}` : `/courses/${homework.course_id}`)}
                >
                    <ArrowLeft className="h-4 w-4" /> {homework.lesson_id ? 'Darsga qaytish' : 'Kursga qaytish'}
                </Button>
                <PageHeader
                    title={`Ishlarni tekshirish: ${homework.title}`}
                    description={[homework.course_name, homework.lesson_topic].filter(Boolean).join(' · ') || undefined}
                />
            </div>

            <HomeworkBrief homework={homework} />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Topshirdi"
                    value={`${submissions.length} / ${totalStudents}`}
                    icon={Users}
                    color="blue"
                    description="Kursdagi talabalardan"
                />
                <StatCard
                    label="Tekshirilmagan"
                    value={pendingList.length}
                    icon={Clock3}
                    color="orange"
                    description="Baho qo'yishingiz kerak"
                />
                <StatCard
                    label="Baholangan"
                    value={gradedList.length}
                    icon={CheckCircle2}
                    color="green"
                    description="Baho qo'yilgan ishlar"
                />
                <StatCard
                    label="Topshirmagan"
                    value={notSubmitted.length}
                    icon={UserX}
                    color="red"
                    description={isPastDeadline(homework.deadline) ? 'Muddat tugagan' : 'Hali muddat bor'}
                />
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ishlarni saralash">
                {filters.map((item) => (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={filter === item.value}
                        onClick={() => setChosenFilter(item.value)}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors',
                            filter === item.value
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary',
                        )}
                    >
                        {item.label}
                        <span
                            className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                                filter === item.value ? 'bg-white/20' : 'bg-border text-foreground',
                            )}
                        >
                            {item.count}
                        </span>
                    </button>
                ))}
            </div>

            {filter === 'missing' ? (
                notSubmitted.length === 0 ? (
                    <EmptyState
                        icon={<CheckCircle2 className="h-8 w-8 text-primary" />}
                        title="Hamma topshirgan"
                        description="Kursdagi barcha talabalar ish yuborgan."
                    />
                ) : (
                    <Card className="overflow-hidden">
                        <ul className="divide-y divide-border/60">
                            {notSubmitted.map((student) => (
                                <li key={student.user_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                                    <span className="min-w-0 truncate font-medium">
                                        {student.full_name || `Talaba #${student.user_id}`}
                                    </span>
                                    {student.group && (
                                        <span className="shrink-0 text-xs text-muted-foreground">{student.group}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Card>
                )
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={<FileText className="h-8 w-8 text-primary" />}
                    title={
                        submissions.length === 0
                            ? "Hozircha topshirilgan ish yo'q"
                            : filter === 'pending'
                                ? 'Hamma ish tekshirilgan'
                                : "Baholangan ish yo'q"
                    }
                    description={
                        submissions.length === 0
                            ? "Talabalar ushbu vazifaga javob yuborgach, ular shu yerda ko'rinadi."
                            : undefined
                    }
                />
            ) : (
                <div className="space-y-4">
                    {visible.map((submission) => (
                        <SubmissionCard
                            key={`${submission.id}-${submission.updated_at}`}
                            submission={submission}
                            homework={homework}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Vazifa sharti. O'qituvchi ishni tekshirayotganda nima so'ralganini
 * ko'rishi kerak — ilgari buning uchun dars sahifasiga qaytish kerak edi.
 */
function HomeworkBrief({ homework }: { homework: Assignment }) {
    const [open, setOpen] = useState(false);
    const past = isPastDeadline(homework.deadline);
    const hasDetails = Boolean(homework.description) || homework.attachments.length > 0;

    return (
        <Card>
            <CardContent className="space-y-3 pt-5">
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                        <dt className="text-xs text-muted-foreground">Topshirish muddati</dt>
                        <dd className="font-medium">
                            {formatDateTime(homework.deadline)}
                            <span className={cn('ml-1.5 text-xs', past ? 'text-destructive' : 'text-muted-foreground')}>
                                ({deadlineHint(homework.deadline)})
                            </span>
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Baholash</dt>
                        <dd className="font-medium">1 dan {homework.max_grade} gacha ball</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Javob turi</dt>
                        <dd className="font-medium">{answerFormatLabel(homework.allow_text, homework.allow_file)}</dd>
                    </div>
                </dl>

                {hasDetails && (
                    <>
                        <button
                            type="button"
                            onClick={() => setOpen((value) => !value)}
                            aria-expanded={open}
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                            {open ? 'Vazifa shartini yashirish' : "Vazifa shartini ko'rish"}
                        </button>
                        {open && (
                            <div className="space-y-2 border-t border-border/60 pt-3">
                                {homework.description && (
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{homework.description}</p>
                                )}
                                <FileList files={homework.attachments} />
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function FileList({ files }: { files: SubmissionFile[] }) {
    if (files.length === 0) return null;
    return (
        <ul className="space-y-2">
            {files.map((file) => (
                <li key={file.url}>
                    <a
                        href={file.url}
                        download={file.name}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate font-medium group-hover:text-primary">{file.name}</span>
                        {file.size != null && (
                            <span className="shrink-0 text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                        )}
                    </a>
                </li>
            ))}
        </ul>
    );
}

function SubmissionCard({ submission, homework }: { submission: Submission; homework: Assignment }) {
    const gradeMut = useGradeSubmission(homework.id);
    const savedGrade = submission.grade != null ? String(submission.grade) : '';
    const savedFeedback = submission.feedback ?? '';
    const [grade, setGrade] = useState(savedGrade);
    const [feedback, setFeedback] = useState(savedFeedback);
    const [error, setError] = useState('');

    const state = reviewState(submission.status);
    const late = lateBy(submission.submitted_at, homework.deadline);
    const isDirty = grade !== savedGrade || feedback.trim() !== savedFeedback.trim();
    const isEmptyAnswer = !submission.submitted_text?.trim() && submission.submitted_files.length === 0;

    const save = () => {
        const value = Number.parseInt(grade, 10);
        if (Number.isNaN(value)) {
            setError('Avval bahoni tanlang');
            return;
        }
        setError('');
        gradeMut.mutate(
            { userId: submission.user_id, data: { grade: value, feedback: feedback.trim() || null } },
            {
                onSuccess: () => toast.success(state === 'graded' ? 'Baho yangilandi' : 'Baho qo\'yildi'),
                onError: (cause) => setError(apiErrorMessage(cause, 'Baholashda xatolik yuz berdi')),
            },
        );
    };

    const student = submission.user;
    const name = student?.full_name || student?.username || `Foydalanuvchi #${submission.user_id}`;

    return (
        <Card className="overflow-hidden">
            <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-base font-bold text-foreground">{name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {student?.group && <>{student.group} · </>}
                            Topshirilgan: {submission.submitted_at ? formatDateTime(submission.submitted_at) : '—'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {late && (
                            <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold', LATE_CLASS)}>
                                <AlertTriangle className="h-3 w-3" /> {late} kech
                            </span>
                        )}
                        <span className={cn('rounded-full border px-3 py-1 text-xs font-bold', REVIEW_CLASS[state])}>
                            {state === 'graded' && submission.grade != null
                                ? `Baho: ${submission.grade} / ${homework.max_grade}`
                                : REVIEW_LABEL[state]}
                        </span>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Talaba javobi</p>
                    {isEmptyAnswer && <p className="text-sm text-muted-foreground">Javob bo'sh.</p>}
                    {submission.submitted_text && (
                        <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                {submission.submitted_text}
                            </p>
                        </div>
                    )}
                    <FileList files={submission.submitted_files} />
                </div>

                <div className="space-y-3 border-t border-border/60 pt-4">
                    <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                        <div>
                            <p id={`grade-label-${submission.id}`} className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Baho (1–{homework.max_grade})
                            </p>
                            <div className="flex gap-2" role="radiogroup" aria-labelledby={`grade-label-${submission.id}`}>
                                {Array.from({ length: homework.max_grade }, (_, index) => index + 1).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={grade === String(value)}
                                        onClick={() => { setGrade(String(value)); setError(''); }}
                                        className={cn(
                                            'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold transition-colors',
                                            grade === String(value)
                                                ? 'bg-primary text-primary-foreground ring-2 ring-primary/40'
                                                : 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
                                        )}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label htmlFor={`feedback-${submission.id}`} className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Talabaga izoh (ixtiyoriy)
                            </label>
                            <Input
                                id={`feedback-${submission.id}`}
                                value={feedback}
                                onChange={(event) => setFeedback(event.target.value)}
                                placeholder="Talaba bahosi bilan birga shu izohni ko'radi"
                                className="rounded-xl text-sm"
                            />
                        </div>
                        <Button onClick={save} disabled={gradeMut.isPending || (state === 'graded' && !isDirty)} className="h-10 px-5">
                            {gradeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {state === 'graded' ? 'Bahoni o\'zgartirish' : 'Baho qo\'yish'}
                        </Button>
                    </div>
                    {state === 'graded' && submission.graded_at && (
                        <p className="text-xs text-muted-foreground">
                            Baho {formatDateTime(submission.graded_at)} da qo'yilgan. Baholangan ishni talaba qayta topshira olmaydi.
                        </p>
                    )}
                    {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
