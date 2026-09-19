/**
 * Dars sahifasidagi uy vazifasi kartasi.
 *
 * Ilgari hammasi bitta qatorda turardi: matn chapda, «Ishlarni tekshirish»
 * va tahrirlash tugmalari o'ngda — telefonda matn ikki-uch so'zlik ustunga
 * siqilib qolardi, muddat esa sarlavhada ham, ichida ham takrorlanardi.
 * Endi ustma-ust: nima so'ralgan → shartlar (muddat, baho, javob turi) →
 * fayllar → o'qituvchiga topshirish holati yoki talabaga javob formasi.
 */
import type { ComponentType, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, CalendarClock, ClipboardCheck, Download, PenLine } from 'lucide-react';
import type { Assignment } from '@/services/assignmentService';
import { Button } from '@/components/ui/Button';
import { HomeworkSubmissionBox } from '@/components/courses/HomeworkSubmissionBox';
import { getFileTypeMeta } from '@/components/file/fileIcons';
import { answerFormatShort, deadlineHint, isPastDeadline } from '@/components/homework/homeworkStatus';
import { formatDateTime } from '@/utils/date';
import { formatSize } from '@/utils/fileSize';
import { cn } from '@/lib/utils';

interface LessonHomeworkCardProps {
    homework: Assignment;
    /** Ishlarni tekshira oladi — topshirish holati va tugma ko'rinadi. */
    canGrade: boolean;
    /** Vazifani boshqaradi — kim bergani ko'rinadi. */
    canManage: boolean;
    /** Talaba — javob formasi ko'rinadi. */
    canSubmit: boolean;
}

export const LessonHomeworkCard = ({ homework, canGrade, canManage, canSubmit }: LessonHomeworkCardProps) => {
    const past = isPastDeadline(homework.deadline);

    return (
        <div className="space-y-4">
            <div className="min-w-0">
                <h3 className="break-words text-base font-semibold text-foreground">{homework.title}</h3>
                {homework.description && (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                        {homework.description}
                    </p>
                )}
            </div>

            <dl className="grid gap-2 sm:grid-cols-3">
                <MetaTile
                    icon={CalendarClock}
                    label="Muddat"
                    value={formatDateTime(homework.deadline)}
                    hint={deadlineHint(homework.deadline)}
                    danger={past}
                />
                <MetaTile icon={Award} label="Baholash" value={`1 dan ${homework.max_grade} gacha`} />
                <MetaTile icon={PenLine} label="Javob turi" value={answerFormatShort(homework.allow_text, homework.allow_file)} />
            </dl>

            {homework.attachments.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Vazifa fayllari</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {homework.attachments.map((file) => {
                            const meta = getFileTypeMeta(file.name || file.url);
                            return (
                                <li key={file.url} className="min-w-0">
                                    <a
                                        href={file.url}
                                        download={file.name}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={file.name}
                                        className="group flex items-center gap-3 rounded-xl border border-border/60 p-2.5 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                                    >
                                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.iconBg)}>
                                            <meta.Icon className={cn('h-4 w-4', meta.iconText)} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium group-hover:text-primary">{file.name}</span>
                                            <span className="block text-[11px] text-muted-foreground">
                                                {[meta.ext, file.size != null ? formatSize(file.size) : null].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                        <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {canGrade && <SubmissionProgress homework={homework} />}

            {canManage && (
                <p className="text-[11px] text-muted-foreground">
                    Bergan: {homework.created_by_name || "noma'lum"} · {formatDateTime(homework.created_at)}
                </p>
            )}

            {canSubmit && <HomeworkSubmissionBox assignment={homework} />}
        </div>
    );
};

function MetaTile({
    icon: Icon,
    label,
    value,
    hint,
    danger = false,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: ReactNode;
    hint?: string;
    danger?: boolean;
}) {
    return (
        <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', danger ? 'text-destructive' : 'text-muted-foreground')} />
            <div className="min-w-0">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-medium text-foreground">{value}</dd>
                {hint && <dd className={cn('text-[11px]', danger ? 'text-destructive' : 'text-muted-foreground')}>{hint}</dd>}
            </div>
        </div>
    );
}

/** O'qituvchi uchun: nechta talaba topshirdi va nechtasi tekshirilishi kerak. */
function SubmissionProgress({ homework }: { homework: Assignment }) {
    const navigate = useNavigate();
    const stats = homework.stats;
    const total = stats?.total_students ?? 0;
    const submitted = stats?.submitted ?? 0;
    const graded = stats?.graded ?? 0;
    const pending = Math.max(0, submitted - graded);
    const percent = total > 0 ? Math.min(100, Math.round((submitted / total) * 100)) : 0;

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                        Topshirdi: <span className="tabular-nums">{submitted}</span>
                        <span className="text-muted-foreground tabular-nums"> / {total}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Topshirganlar ulushi">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                    {pending > 0 ? (
                        <><b className="text-amber-600 dark:text-amber-400">{pending} ta</b> tekshirilmagan · {graded} ta baholangan</>
                    ) : submitted > 0 ? (
                        'Hamma ish baholangan'
                    ) : (
                        "Hali hech kim topshirmagan"
                    )}
                </p>
            </div>
            <Button
                size="sm"
                variant={pending > 0 ? 'primary' : 'outline'}
                className="w-full shrink-0 sm:w-auto"
                onClick={() => navigate(`/homework/${homework.id}/submissions`)}
            >
                <ClipboardCheck className="mr-2 h-4 w-4" />
                {pending > 0 ? `Tekshirish (${pending})` : "Ishlarni ko'rish"}
            </Button>
        </div>
    );
}
