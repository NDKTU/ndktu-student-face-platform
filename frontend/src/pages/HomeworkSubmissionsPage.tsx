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

const STATUS_LABEL: Record<SubmissionStatus, string> = {
    draft: 'Qoralama',
    submitted: 'Topshirildi',
    late: 'Kech topshirildi',
    graded: 'Baholandi',
    returned: 'Qaytarildi',
};

const STATUS_CLASS: Record<SubmissionStatus, string> = {
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-primary/10 text-primary',
    late: 'bg-amber-500/10 text-amber-600',
    graded: 'bg-emerald-500/10 text-emerald-600',
    returned: 'bg-destructive/10 text-destructive',
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
            <div className="space-y-5">
                <Skeleton className="h-9 w-80" />
                <Skeleton className="h-24 w-full rounded-2xl" />
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
        <div className="space-y-6">
            <div className="space-y-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2"
                    onClick={() => navigate(homework.lesson_id ? `/lessons/${homework.lesson_id}` : `/courses/${homework.course_id}`)}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Darsga qaytish
                </Button>
                <PageHeader
                    title={homework.title}
                    description={`Muddat: ${new Date(homework.deadline).toLocaleString()} · Baho: 1–${homework.max_grade}`}
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Kursdagi talaba" value={stats?.total_students ?? 0} icon={Users} color="blue" />
                <StatCard label="Topshirdi" value={stats?.submitted ?? 0} icon={CheckCircle2} color="green" />
                <StatCard label="Tekshirilmagan" value={pending} icon={Clock3} color="orange" />
            </div>

            {submissions.length === 0 ? (
                <EmptyState
                    icon={<FileText className="h-6 w-6" />}
                    title="Hozircha topshirilgan ish yo'q"
                    description="Talabalar javob yuborgach, ular shu yerda ko'rinadi."
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
    // Qayta baholashda avvalgi baho ko'rinib tursin. Effekt kerak emas:
    // ota-komponent `updated_at` ni ham `key` ga qo'shadi, shuning uchun
    // server javobi yangilangach karta o'zi qaytadan quriladi.
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
                onSuccess: () => toast.success('Baho qo\'yildi'),
                onError: (cause) => {
                    const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    setError(detail || 'Baholashda xatolik');
                },
            },
        );
    };

    const student = submission.user;
    const title = student?.full_name || student?.username || `Foydalanuvchi #${submission.user_id}`;

    return (
        <Card>
            <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-semibold">{title}</p>
                        <p className="text-xs text-muted-foreground">
                            {[student?.group, submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : null]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[submission.status]}`}>
                            {STATUS_LABEL[submission.status]}
                        </span>
                        {submission.grade != null && (
                            <span className="text-sm font-semibold text-emerald-600">
                                {submission.grade} / {maxGrade}
                            </span>
                        )}
                    </div>
                </div>

                {submission.submitted_text && (
                    <p className="whitespace-pre-wrap rounded-xl bg-muted/40 px-3 py-2 text-sm leading-6">
                        {submission.submitted_text}
                    </p>
                )}

                {submission.submitted_files.length > 0 && (
                    <ul className="space-y-1.5">
                        {submission.submitted_files.map((file) => (
                            <li key={file.url}>
                                <a
                                    href={file.url}
                                    download={file.name}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                                >
                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                                    {file.size != null && (
                                        <span className="shrink-0 text-[11px] text-muted-foreground">
                                            {(file.size / 1024).toFixed(0)} KB
                                        </span>
                                    )}
                                </a>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Baho</label>
                        {/* 5 ballik tizimda raqam kiritishdan ko'ra tugma tezroq. */}
                        <div className="flex gap-1.5">
                            {Array.from({ length: maxGrade }, (_, index) => index + 1).map((value) => (
                                <Button
                                    key={value}
                                    type="button"
                                    variant={grade === String(value) ? 'primary' : 'outline'}
                                    className="h-10 w-10 p-0 text-base font-semibold"
                                    onClick={() => { setGrade(String(value)); setError(''); }}
                                >
                                    {value}
                                </Button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Izoh (ixtiyoriy)</label>
                        <Input
                            value={feedback}
                            onChange={(event) => setFeedback(event.target.value)}
                            placeholder="Talabaga qisqa izoh"
                        />
                    </div>
                    <Button onClick={save} disabled={gradeMut.isPending}>
                        {gradeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {submission.status === 'graded' ? 'Bahoni yangilash' : 'Baholash'}
                    </Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
        </Card>
    );
}
