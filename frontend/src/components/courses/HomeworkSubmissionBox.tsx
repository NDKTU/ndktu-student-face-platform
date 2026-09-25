import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileText, Loader2, UploadCloud } from 'lucide-react';
import { useMySubmission, useSubmitAssignment } from '@/hooks/useAssignments';
import { assignmentService, type Assignment, type Submission, type SubmissionFile } from '@/services/assignmentService';
import { Button } from '@/components/ui/Button';
import { deadlineHint, lateBy } from '@/components/homework/homeworkStatus';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/date';

// Backend bilan bir xil: bitta vazifaga bitta fayl, 2 MB gacha.
const MAX_FILE_SIZE = 2 * 1024 * 1024;

// Backend bilan bir xil: javob faqat PDF yoki rasm.
const DEFAULT_EXTS = ['pdf', 'jpg', 'jpeg', 'png'];

export const HomeworkSubmissionBox = ({ assignment }: { assignment: Assignment }) => {
    const submissionQuery = useMySubmission(assignment.id);
    const submitMut = useSubmitAssignment(assignment.id);
    const [confirmed, setConfirmed] = useState<Submission | null>(null);
    const submission = submissionQuery.data ?? confirmed;

    const [files, setFiles] = useState<SubmissionFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setFiles([]);
        setConfirmed(null);
    }, [assignment.id]);

    // Sahifada bir nechta vazifa bo'ladi — `id` har biriga alohida bo'lishi shart,
    // aks holda label doim birinchi inputni ochadi.
    const inputId = `homework-submission-${assignment.id}`;
    const isGraded = submission?.status === 'graded';
    const isLate = new Date(assignment.deadline).getTime() < Date.now();
    const busy = uploading || submitMut.isPending;

    const submitFile = async (uploaded: SubmissionFile) => {
        setError('');
        try {
            const saved = await submitMut.mutateAsync({ submitted_text: null, submitted_files: [uploaded] });
            setConfirmed(saved);
            setFiles([]);
            toast.success('Vazifa yuklandi');
        } catch (cause) {
            const latest = await submissionQuery.refetch();
            if (latest.data) {
                setConfirmed(latest.data);
                setFiles([]);
                toast.success('Vazifa yuklandi');
            } else {
                setError(apiErrorMessage(cause, 'Topshirishda xatolik. Qayta urinib ko‘ring.'));
            }
        }
    };

    const handleUpload = async (picked: FileList | null) => {
        const file = picked?.[0];
        if (!file || submission || busy) return;
        if (!DEFAULT_EXTS.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) {
            setError('Faqat PDF, JPG yoki PNG fayl yuklash mumkin');
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setError('Fayl hajmi 2 MB dan oshmasligi kerak');
            return;
        }
        setUploading(true);
        setError('');
        try {
            const uploaded = await assignmentService.uploadSubmissionFile(assignment.id, file);
            setFiles([uploaded]);
            await submitFile(uploaded);
        } catch (cause) {
            setError(apiErrorMessage(cause, 'Faylni yuklashda xatolik'));
        } finally {
            setUploading(false);
        }
    };

    if (submissionQuery.isLoading) {
        return <div className="mt-4 border-t border-border/60 pt-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
    }
    if (submissionQuery.isError && !submission) {
        return <div className="mt-4 border-t border-border/60 pt-4 text-sm text-destructive">Javob holatini yuklab bo‘lmadi. <Button variant="link" onClick={() => void submissionQuery.refetch()}>Qayta urinish</Button></div>;
    }

    const late = lateBy(submission?.submitted_at, assignment.deadline);

    return (
        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Mening javobim</p>
                {submission && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Vazifa yuklandi</span>}
            </div>
            {submission ? (
                <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
                    <p className="text-sm text-emerald-900 dark:text-emerald-200">{isGraded ? `Baholandi: ${submission.grade} / ${assignment.max_grade}` : 'Javobingiz o‘qituvchiga yuborildi va tekshirilmoqda.'}</p>
                    {submission.submitted_at && <p className="text-xs text-muted-foreground">Topshirilgan vaqt: {formatDateTime(submission.submitted_at)}</p>}
                    <SubmittedFiles files={submission.submitted_files ?? []} />
                    {submission.feedback && <p className="rounded-lg bg-background/70 px-3 py-2 text-sm"><span className="font-medium">O‘qituvchi izohi: </span>{submission.feedback}</p>}
                    {late && <p className="text-xs text-amber-700 dark:text-amber-400">{late} kech topshirilgan</p>}
                    <p className="text-xs text-muted-foreground">Topshirilgan faylni o‘chirish yoki almashtirish mumkin emas.</p>
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        PDF yoki rasm · Bitta fayl, 2 MB gacha · {deadlineHint(assignment.deadline)}
                    </p>
                    {assignment.allow_file && (
                        <div>
                            <label
                                htmlFor={inputId}
                                className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.035] px-4 py-6 text-center transition-colors hover:border-primary hover:bg-primary/[0.07] focus-within:ring-2 focus-within:ring-ring"
                            >
                                {uploading ? (
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                ) : (
                                    <UploadCloud className="h-5 w-5 text-muted-foreground" />
                                )}
                                <span className="text-sm font-medium text-foreground">
                                    {busy ? 'Yuklanmoqda va topshirilmoqda...' : 'Faylni tanlang va topshiring'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    PDF, JPG, JPEG, PNG
                                </span>
                                <span className="text-xs text-muted-foreground">Tanlangan fayl avtomatik yuboriladi</span>
                            </label>
                            <input
                                id={inputId}
                                type="file"
                                className="sr-only"
                                accept={DEFAULT_EXTS.map((ext) => `.${ext}`).join(',')}
                                disabled={busy}
                                onChange={(event) => { void handleUpload(event.target.files); event.target.value = ''; }}
                            />
                            {files.length > 0 && (
                                <ul className="mt-2 space-y-1.5">
                                    {files.map((file) => (
                                        <li key={file.url} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                                            {file.size != null && (
                                                <span className="shrink-0 text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                                            )}
                                            <Button size="sm" onClick={() => void submitFile(file)} disabled={busy}>Qayta yuborish</Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {isLate && (
                        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Muddat tugagan — hozir yuborilgan javob «kech topshirilgan» deb belgilanadi.
                        </p>
                    )}
                    {error && <p className="text-sm text-destructive">{error}</p>}

                </>
            )}
        </div>
    );
};

function SubmittedFiles({ files }: { files: SubmissionFile[] }) {
    if (files.length === 0) return null;
    return (
        <ul className="space-y-1.5">
            {files.map((file) => (
                <li key={file.url}>
                    <a
                        href={file.url}
                        download={file.name}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm hover:border-primary/40"
                    >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    </a>
                </li>
            ))}
        </ul>
    );
}
