import { useEffect, useState } from 'react';
import { FileText, Loader2, Send, UploadCloud, X } from 'lucide-react';
import { useMySubmission, useSubmitAssignment } from '@/hooks/useAssignments';
import { assignmentService, type Assignment, type SubmissionFile, type SubmissionStatus } from '@/services/assignmentService';
import { Button } from '@/components/ui/Button';

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

const DEFAULT_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'zip', 'rar'];

/** O'qituvchi tanlagan guruhlar ("doc,docx") alohida kengaytmalarga yoyiladi. */
function expandExts(allowedFileTypes: string[]): string[] {
    const exts = allowedFileTypes
        .flatMap((group) => group.split(','))
        .map((ext) => ext.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean);
    return exts.length > 0 ? exts : DEFAULT_EXTS;
}

export const HomeworkSubmissionBox = ({ assignment }: { assignment: Assignment }) => {
    const submissionQuery = useMySubmission(assignment.id);
    const submitMut = useSubmitAssignment(assignment.id);
    const submission = submissionQuery.data ?? null;

    const [text, setText] = useState('');
    const [files, setFiles] = useState<SubmissionFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    // Mavjud javob kelgach formani to'ldiramiz, aks holda talaba o'z ishini
    // ko'rmay, bo'sh forma ustiga qayta yozib yuborardi.
    useEffect(() => {
        setText(submission?.submitted_text ?? '');
        setFiles(submission?.submitted_files ?? []);
    }, [submission]);

    // Sahifada bir nechta vazifa bo'ladi — `id` har biriga alohida bo'lishi shart,
    // aks holda label doim birinchi inputni ochadi.
    const inputId = `homework-submission-${assignment.id}`;
    const exts = expandExts(assignment.allowed_file_types);
    const isGraded = submission?.status === 'graded';
    const isLate = new Date(assignment.deadline).getTime() < Date.now();
    const busy = uploading || submitMut.isPending;

    const handleUpload = async (picked: FileList | null) => {
        if (!picked || picked.length === 0) return;
        setUploading(true);
        setError('');
        try {
            for (const file of Array.from(picked)) {
                const uploaded = await assignmentService.uploadSubmissionFile(assignment.id, file);
                setFiles((prev) => [...prev, uploaded]);
            }
        } catch (cause) {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || 'Faylni yuklashda xatolik');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = () => {
        setError('');
        submitMut.mutate(
            { submitted_text: text.trim() || null, submitted_files: files },
            {
                onError: (cause) => {
                    const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    setError(detail || 'Topshirishda xatolik');
                },
            },
        );
    };

    if (submissionQuery.isLoading) {
        return <div className="mt-4 border-t border-border/60 pt-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Mening javobim</p>
                {submission && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[submission.status]}`}>
                        {STATUS_LABEL[submission.status]}
                    </span>
                )}
                {isGraded && (
                    <span className="text-xs font-medium text-emerald-600">
                        Baho: {submission?.grade} / {assignment.max_grade}
                    </span>
                )}
            </div>

            {isGraded ? (
                <div className="space-y-2">
                    {submission?.submitted_text && (
                        <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-sm">{submission.submitted_text}</p>
                    )}
                    <SubmittedFiles files={submission?.submitted_files ?? []} />
                    {submission?.feedback && (
                        <p className="rounded-lg bg-emerald-500/5 px-3 py-2 text-sm">
                            <span className="font-medium">O'qituvchi izohi: </span>{submission.feedback}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">Baholangan ish qayta topshirilmaydi.</p>
                </div>
            ) : (
                <>
                    {assignment.allow_text && (
                        <textarea
                            className="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder="Javobingizni shu yerga yozing..."
                        />
                    )}

                    {assignment.allow_file && (
                        <div>
                            {/* Brauzerning «Browse… No files selected» maydoni o'rniga
                                dars modalidagi kabi ikonkali zona. */}
                            <label
                                htmlFor={inputId}
                                className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-input bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                            >
                                {uploading ? (
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                ) : (
                                    <UploadCloud className="h-5 w-5 text-muted-foreground" />
                                )}
                                <span className="text-sm font-medium text-foreground">
                                    {uploading ? 'Yuklanmoqda...' : 'Fayl biriktirish uchun bosing'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {exts.map((ext) => ext.toUpperCase()).join(', ')}
                                </span>
                            </label>
                            <input
                                id={inputId}
                                type="file"
                                multiple
                                className="sr-only"
                                accept={exts.map((ext) => `.${ext}`).join(',')}
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
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Faylni olib tashlash"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                onClick={() => setFiles((prev) => prev.filter((item) => item.url !== file.url))}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {isLate && !submission && (
                        <p className="text-xs text-amber-600">Muddat o'tgan — ish «kech topshirildi» deb belgilanadi.</p>
                    )}
                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="flex justify-end">
                        <Button size="sm" onClick={handleSubmit} disabled={busy}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            {submission ? 'Qayta topshirish' : 'Topshirish'}
                        </Button>
                    </div>
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
