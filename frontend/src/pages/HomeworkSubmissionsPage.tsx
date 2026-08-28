import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Clock3, FileText, Loader2, Users } from 'lucide-react';
import { useAssignment, useGradeSubmission, useSubmissions } from '@/hooks/useAssignments';
import type { Submission, SubmissionStatus } from '@/services/assignmentService';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<SubmissionStatus, string> = {
    draft: 'Qoralama',
    submitted: 'Topshirildi',
    late: 'Kech topshirildi',
    graded: 'Baholandi',
    returned: 'Qaytarildi',
};

const STATUS_CLASS: Record<SubmissionStatus, string> = {
    draft: 'bg-muted text-muted-foreground border-border',
    submitted: 'bg-primary/15 text-primary border-primary/25',
    late: 'bg-[#FF9F29]/15 text-[#FF9F29] border-[#FF9F29]/25',
    graded: 'bg-[#45B369]/15 text-[#45B369] border-[#45B369]/25',
    returned: 'bg-[#EF4A00]/15 text-[#EF4A00] border-[#EF4A00]/25',
};

export default function HomeworkSubmissionsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const homeworkId = id ? Number.parseInt(id, 10) : undefined;

    const homeworkQuery = useAssignment(homeworkId);
    const submissionsQuery = useSubmissions(homeworkId);

    const homework = homeworkQuery.data;
    const submissions = useMemo(() => submissionsQuery.data?.submissions ?? [], [submissionsQuery.data]);

    if (homeworkQuery.isLoading || submissionsQuery.isLoading) {
        return (
            <div className="space-y-6 animate-pulse">
                <Skeleton className="h-10 w-64 rounded-xl" />
                <div className="grid gap-4 sm:grid-cols-3">
                    <Skeleton className="h-28 rounded-2xl" />
                    <Skeleton className="h-28 rounded-2xl" />
                    <Skeleton className="h-28 rounded-2xl" />
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

    const stats = homework.stats;
    const pending = submissions.filter((item) => item.status !== 'graded').length;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="space-y-3">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-xl text-xs font-bold shadow-none"
                    onClick={() => navigate(homework.lesson_id ? `/lessons/${homework.lesson_id}` : `/courses/${homework.course_id}`)}
                >
                    <ArrowLeft className="h-4 w-4" /> Darsga qaytish
                </Button>
                <PageHeader
                    title={homework.title}
                    description={`Muddat: ${formatDateTime(homework.deadline)} · Maksimal ball: 1–${homework.max_grade}`}
                />
            </div>

            {/* Top Wowdash Stats Row */}
            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                    label="Kursdagi talaba"
                    value={stats?.total_students ?? 0}
                    icon={Users}
                    color="blue"
                    description="Guruh a'zolari soni"
                />
                <StatCard
                    label="Topshirildi"
                    value={stats?.submitted ?? 0}
                    icon={CheckCircle2}
                    color="green"
                    description="Kelib tushgan ishlar"
                />
                <StatCard
                    label="Tekshirilmagan"
                    value={pending}
                    icon={Clock3}
                    color="orange"
                    description="Baho qo'yilmagan"
                />
            </div>

            {submissions.length === 0 ? (
                <EmptyState
                    icon={<FileText className="h-8 w-8 text-primary" />}
                    title="Hozircha topshirilgan ish yo'q"
                    description="Talabalar ushbu vazifaga javob yuborgach, ular shu yerda ko'rinadi."
                />
            ) : (
                <div className="space-y-4">
                    {submissions.map((submission) => (
                        <SubmissionCard
                            key={`${submission.id}-${submission.updated_at}`}
                            submission={submission}
                            homeworkId={homeworkId}
                            maxGrade={homework.max_grade}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function SubmissionCard({
    submission,
    homeworkId,
    maxGrade,
}: {
    submission: Submission;
    homeworkId: number;
    maxGrade: number;
}) {
    const gradeMut = useGradeSubmission(homeworkId);
    const [grade, setGrade] = useState(submission.grade != null ? String(submission.grade) : '');
    const [feedback, setFeedback] = useState(submission.feedback ?? '');
    const [error, setError] = useState('');

    const save = () => {
        const value = Number.parseInt(grade, 10);
        if (Number.isNaN(value)) {
            setError('Bahoni tanlang');
            return;
        }
        setError('');
        gradeMut.mutate(
            { userId: submission.user_id, data: { grade: value, feedback: feedback.trim() || null } },
            {
                onSuccess: () => toast.success('Baho muvaffaqiyatli saqlandi'),
                onError: (cause) => {
                    const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    setError(detail || 'Baholashda xatolik yuz berdi');
                },
            },
        );
    };

    const student = submission.user;
    const title = student?.full_name || student?.username || `Foydalanuvchi #${submission.user_id}`;

    return (
        <Card className="wow-card overflow-hidden">
            <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-bold text-foreground text-base">{title}</p>
                        <p className="text-xs font-medium text-muted-foreground mt-0.5">
                            {[student?.group, submission.submitted_at ? formatDateTime(submission.submitted_at) : null]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className={cn('rounded-full border px-3 py-1 text-xs font-bold', STATUS_CLASS[submission.status])}>
                            {STATUS_LABEL[submission.status]}
                        </span>
                        {submission.grade != null && (
                            <span className="inline-flex items-center rounded-full bg-[#45B369]/15 border border-[#45B369]/30 px-3 py-1 text-xs font-bold text-[#45B369]">
                                {submission.grade} / {maxGrade} ball
                            </span>
                        )}
                    </div>
                </div>

                {submission.submitted_text && (
                    <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-normal">
                            {submission.submitted_text}
                        </p>
                    </div>
                )}

                {submission.submitted_files.length > 0 && (
                    <ul className="space-y-2">
                        {submission.submitted_files.map((file) => (
                            <li key={file.url}>
                                <a
                                    href={file.url}
                                    download={file.name}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3 text-sm transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 group"
                                >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                                        <FileText className="h-4 w-4" />
                                    </div>
                                    <span className="min-w-0 flex-1 truncate font-medium text-foreground group-hover:text-primary transition-colors">
                                        {file.name}
                                    </span>
                                    {file.size != null && (
                                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                            {(file.size / 1024).toFixed(0)} KB
                                        </span>
                                    )}
                                </a>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Baho tanlang</label>
                        <div className="flex gap-2">
                            {Array.from({ length: maxGrade }, (_, index) => index + 1).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => { setGrade(String(value)); setError(''); }}
                                    className={cn(
                                        'h-10 w-10 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer flex items-center justify-center',
                                        grade === String(value)
                                            ? 'bg-primary text-white shadow-sm shadow-primary/30 ring-2 ring-primary/40'
                                            : 'border border-border bg-card text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40'
                                    )}
                                >
                                    {value}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Izoh (ixtiyoriy)</label>
                        <Input
                            value={feedback}
                            onChange={(event) => setFeedback(event.target.value)}
                            placeholder="Talabaga tavsiya yoki fikr qoldiring..."
                            className="rounded-xl border-border/80 text-sm focus:border-primary"
                        />
                    </div>
                    <Button onClick={save} disabled={gradeMut.isPending} className="h-10 px-5">
                        {gradeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {submission.status === 'graded' ? 'Bahoni yangilash' : 'Baholash'}
                    </Button>
                </div>
                {error && <p className="text-xs font-semibold text-destructive mt-1">{error}</p>}
            </CardContent>
        </Card>
    );
}

