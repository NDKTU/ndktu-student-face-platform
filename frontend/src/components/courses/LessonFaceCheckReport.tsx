import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronDown, ChevronRight, ScanFace } from 'lucide-react';
import { faceCheckService, type FaceCheckStatus } from '@/services/faceCheckService';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/utils/date';

const STATUS_LABEL: Record<FaceCheckStatus, string> = {
    ok: 'Tasdiqlandi',
    no_face: "Kadrda yuz yo'q",
    multiple_faces: 'Bir nechta odam',
    different_person: 'Boshqa odam',
    no_reference: "Profil surati yo'q",
    no_camera: 'Kamera ochilmadi',
};

const STATUS_CLASS: Record<FaceCheckStatus, string> = {
    ok: 'bg-emerald-500/10 text-emerald-600',
    no_face: 'bg-amber-500/10 text-amber-600',
    multiple_faces: 'bg-destructive/10 text-destructive',
    different_person: 'bg-destructive/10 text-destructive',
    no_reference: 'bg-muted text-muted-foreground',
    no_camera: 'bg-muted text-muted-foreground',
};

/**
 * Yuz nazorati jurnali — faqat dars o'qituvchisi va adminga ochiq.
 * Qaror avtomatik qabul qilinmaydi: ro'yxat o'qituvchi ko'rib chiqishi uchun.
 */
export const LessonFaceCheckReport = ({ lessonId }: { lessonId: number }) => {
    const [expanded, setExpanded] = useState<number | null>(null);
    const query = useQuery({
        queryKey: ['lesson-face-checks', lessonId],
        queryFn: () => faceCheckService.report(lessonId),
    });

    if (query.isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;
    const students = query.data?.students ?? [];
    if (students.length === 0) {
        return <p className="text-sm text-muted-foreground">Hozircha tekshiruvlar yo'q.</p>;
    }

    return (
        <div className="space-y-2">
            {students.map((student) => {
                const isOpen = expanded === student.user_id;
                return (
                    <div key={student.user_id} className="rounded-xl border border-border/60">
                        <button
                            className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            onClick={() => setExpanded(isOpen ? null : student.user_id)}
                        >
                            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                            <span className="min-w-0 flex-1 truncate font-medium">{student.user_name || `#${student.user_id}`}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{student.total} ta tekshiruv</span>
                            {student.failed > 0 ? (
                                <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                    {student.failed} muammo
                                </span>
                            ) : (
                                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                    Muammosiz
                                </span>
                            )}
                        </button>

                        {isOpen && (
                            <div className="space-y-2 border-t border-border/60 px-4 py-3">
                                {student.checks.map((check) => (
                                    <div key={check.id} className="flex flex-wrap items-center gap-3 text-sm">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[check.status]}`}>
                                            {STATUS_LABEL[check.status]}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {check.stage === 'join' ? 'Kirishda' : 'Dars davomida'} · {formatDateTime(check.created_at)}
                                        </span>
                                        {/* Surat faqat muammoli tekshiruvda saqlanadi. */}
                                        {check.has_image && (
                                            <a
                                                href={faceCheckService.imageUrl(check.id)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-primary underline-offset-4 hover:underline"
                                            >
                                                Suratni ko'rish
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <ScanFace className="h-3.5 w-3.5" />
                Tekshiruv avtomatik: yorug'lik yoki burilib turish ham «muammo» bo'lib chiqishi mumkin — qaror sizda.
            </p>
        </div>
    );
};
