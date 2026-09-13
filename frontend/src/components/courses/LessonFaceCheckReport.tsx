import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Image as ImageIcon, LogOut, ScanFace } from 'lucide-react';
import { useState } from 'react';
import { faceCheckService, type AbsencePeriod, type FaceCheckStudentSummary } from '@/services/faceCheckService';
import { Skeleton } from '@/components/ui/Skeleton';

/** Davrdagi statuslardan sababni ko'rsatamiz: ular bir xil og'irlikda emas. */
const REASON_LABEL: Record<string, string> = {
    no_face: "yuz ko'rinmadi",
    multiple_faces: 'bir nechta odam',
    different_person: 'boshqa odam',
};

const formatClock = (iso: string) =>
    new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

const formatMinutes = (seconds: number) => {
    const total = Math.round(seconds / 60);
    if (total < 60) return `${total} daq`;
    return `${Math.floor(total / 60)} soat ${total % 60} daq`;
};

const periodReasons = (period: AbsencePeriod) => {
    const unique = [...new Set(period.statuses.map((s) => REASON_LABEL[s] ?? s))];
    return unique.join(', ');
};

/**
 * Vaqt chizig'i: kuzatuv oynasi bo'ylab yuz ko'ringan va ko'rinmagan qismlar.
 *
 * Chiziq talabaning **o'z** oynasiga nisbatan chiziladi (birinchi tekshiruvdan
 * oxirgisigacha), dars sanasiga emas: kech kirgan talabani «darsning 100%ida
 * yo'q edi» deb ko'rsatish noto'g'ri bo'lardi.
 */
const Timeline = ({ student }: { student: FaceCheckStudentSummary }) => {
    const span = Math.max(1, student.tracked_seconds);
    const startMs = student.first_check ? new Date(student.first_check).getTime() : 0;

    return (
        <div className="space-y-1">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-emerald-500/25">
                {student.periods.map((period, index) => {
                    const offset = ((new Date(period.start).getTime() - startMs) / 1000 / span) * 100;
                    const width = (period.duration_seconds / span) * 100;
                    return (
                        <span
                            key={index}
                            className="absolute inset-y-0 bg-destructive/70"
                            style={{
                                left: `${Math.max(0, Math.min(100, offset))}%`,
                                // Juda qisqa davr ham ko'rinsin — aks holda
                                // chiziqda umuman bilinmay ketardi.
                                width: `${Math.max(1.5, Math.min(100, width))}%`,
                            }}
                            title={`${formatClock(period.start)} — ${period.end ? formatClock(period.end) : 'oxirigacha'}`}
                        />
                    );
                })}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{student.first_check ? formatClock(student.first_check) : ''}</span>
                <span>{student.last_check ? formatClock(student.last_check) : ''}</span>
            </div>
        </div>
    );
};

/**
 * Yuz nazorati hisoboti — faqat dars o'qituvchisi va adminga ochiq.
 * Qaror avtomatik qabul qilinmaydi: hisobot o'qituvchi ko'rib chiqishi uchun.
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
                const presentRatio = student.tracked_seconds > 0
                    ? Math.round(((student.tracked_seconds - student.absent_seconds) / student.tracked_seconds) * 100)
                    : 100;

                return (
                    <div key={student.user_id} className="rounded-xl border border-border/60">
                        <button
                            className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            onClick={() => setExpanded(isOpen ? null : student.user_id)}
                        >
                            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                            <span className="min-w-0 flex-1 truncate font-medium">
                                {student.user_name || `#${student.user_id}`}
                            </span>
                            {student.absent_seconds > 0 ? (
                                <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                    {formatMinutes(student.absent_seconds)} yo'q
                                </span>
                            ) : (
                                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                    Doim kadrda
                                </span>
                            )}
                            <span className="shrink-0 text-xs text-muted-foreground">{presentRatio}%</span>
                        </button>

                        <div className="px-4 pb-3">
                            <Timeline student={student} />
                        </div>

                        {isOpen && (
                            <div className="space-y-2 border-t border-border/60 px-4 py-3 text-sm">
                                <p className="text-xs text-muted-foreground">
                                    Kuzatuv: {formatMinutes(student.tracked_seconds)} · {student.total} ta tekshiruv
                                    {' '}({student.passed} tasdiqlandi, {student.failed} muammoli)
                                </p>

                                {student.periods.length === 0 ? (
                                    <p className="text-xs text-emerald-600">Yuz butun davomida kadrda bo'lgan.</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {student.periods.map((period, index) => (
                                            <li key={index} className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className="font-medium">
                                                    {formatClock(period.start)} — {period.end ? formatClock(period.end) : 'oxirigacha'}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {formatMinutes(period.duration_seconds)} · {periodReasons(period)}
                                                </span>
                                                {/* Dalil: davr boshidan olingan 1-2 kadr. Surat
                                                    himoyalangan endpoint orqali beriladi. */}
                                                {period.image_check_ids.map((checkId, position) => (
                                                    <a
                                                        key={checkId}
                                                        href={faceCheckService.imageUrl(checkId)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                                                    >
                                                        <ImageIcon className="h-3 w-3" />
                                                        {position === 0 ? 'Surat' : `Surat ${position + 1}`}
                                                    </a>
                                                ))}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {/* Ikki xil «qaytmadi» bir xil emas: biri kamerada
                                    ko'rinmagan, ikkinchisi umuman kuzatuvdan chiqqan. */}
                                {student.ended_absent && (
                                    <p className="text-xs text-amber-600">Dars oxirigacha yuz qaytmadi.</p>
                                )}
                                {student.left_early && (
                                    <p className="flex items-center gap-1.5 text-xs text-amber-600">
                                        <LogOut className="h-3.5 w-3.5" />
                                        Tekshiruvlar erta to'xtagan — brauzerni yopgan yoki Zoom ilovasiga o'tgan bo'lishi mumkin.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <ScanFace className="h-3.5 w-3.5" />
                Tekshiruv avtomatik va taxminan daqiqada bir marta. Qisqa yo'qolishlar qayd etilmaydi —
                davr faqat ketma-ket ikki kadrda yuz topilmasa ochiladi. Qaror sizda.
            </p>
        </div>
    );
};
