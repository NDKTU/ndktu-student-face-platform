import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Image as ImageIcon, LogIn, LogOut, ScanFace, UserX, Video } from 'lucide-react';
import { useState } from 'react';
import { zoomSessionService, type AbsencePeriod, type FaceCheckStudentSummary, type ZoomVisit } from '@/services/zoomSessionService';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatTime } from '@/utils/date';

/** Davrdagi statuslardan sababni ko'rsatamiz: ular bir xil og'irlikda emas. */
const REASON_LABEL: Record<string, string> = {
    no_face: "yuz ko'rinmadi",
    multiple_faces: 'bir nechta odam',
    different_person: 'boshqa odam',
    spoof: 'rasm yoki ekran',
};

const formatMinutes = (seconds: number) => {
    const total = Math.round(seconds / 60);
    if (total < 60) return `${total} daq`;
    return `${Math.floor(total / 60)} soat ${total % 60} daq`;
};

const periodReasons = (period: AbsencePeriod) => {
    const unique = [...new Set(period.statuses.map((s) => REASON_LABEL[s] ?? s))];
    return unique.join(', ');
};

/** «10:05–10:20, 10:40–hozir»: chiqib, qayta kirgani bir qarashda ko'rinsin. */
const formatVisits = (visits: ZoomVisit[]) =>
    visits.map((visit) => `${formatTime(visit.joined_at)}–${visit.left_at ? formatTime(visit.left_at) : 'oxirigacha'}`).join(', ');

/** Talaba necha marta kirgan: Zoom ma'lumoti bo'lsa — undan, aks holda kirishdagi yuz tasdiqlaridan. */
const entryCount = (student: FaceCheckStudentSummary) =>
    (student.zoom_visits?.length ?? 0) || (student.admitted_at?.length ?? 0);

/**
 * Har bir kirish alohida qator: qachon kirdi, qachon chiqdi, qancha o'tirdi.
 * Talaba qatori bosilganda ochiladi.
 *
 * Asosiy manba — Zoom webhook (`zoom_visits`). U kelmagan bo'lsa (qo'lda
 * havola, webhook sozlanmagan) — kirishdagi yuz tasdiqlari: har qayta kirish
 * yangi tekshiruv, lekin chiqish vaqti shunda noma'lum.
 */
const EntryExitList = ({ student, ended }: { student: FaceCheckStudentSummary; ended: boolean }) => {
    const visits = student.zoom_visits ?? [];
    const fromZoom = visits.length > 0;
    const rows: ZoomVisit[] = fromZoom ? visits : (student.admitted_at ?? []).map((joined_at) => ({ joined_at }));
    if (rows.length === 0) {
        return <p className="text-xs text-muted-foreground">Kirish ma'lumoti yo'q.</p>;
    }
    const openLabel = ended ? 'dars oxirigacha' : 'hozir darsda';
    return (
        <div className="space-y-1.5">
            <ol className="divide-y divide-border/60 rounded-lg border border-border/60 text-xs">
                {rows.map((visit, index) => {
                    const seconds = visit.left_at
                        ? (new Date(visit.left_at).getTime() - new Date(visit.joined_at).getTime()) / 1000
                        : null;
                    return (
                        <li key={index} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                            <span className="w-5 shrink-0 text-muted-foreground">{index + 1}.</span>
                            <span className="inline-flex items-center gap-1">
                                <LogIn className="h-3.5 w-3.5 text-emerald-600" />
                                Kirdi <span className="font-medium">{formatTime(visit.joined_at)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <LogOut className="h-3.5 w-3.5 text-amber-600" />
                                {visit.left_at ? (
                                    <>Chiqdi <span className="font-medium">{formatTime(visit.left_at)}</span></>
                                ) : fromZoom ? (
                                    <span className={ended ? 'text-muted-foreground' : 'font-medium text-emerald-600'}>{openLabel}</span>
                                ) : (
                                    <span className="text-muted-foreground">Chiqdi —</span>
                                )}
                            </span>
                            {seconds != null && (
                                <span className="ml-auto text-muted-foreground">{formatMinutes(Math.max(0, seconds))}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
            {!fromZoom && (
                <p className="text-xs text-muted-foreground">
                    Kirishlar yuz tasdig'idan. Chiqish vaqti noma'lum — Zoom ma'lumoti kelmagan.
                </p>
            )}
        </div>
    );
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
                            title={`${formatTime(period.start)} — ${period.end ? formatTime(period.end) : 'oxirigacha'}`}
                        />
                    );
                })}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{student.first_check ? formatTime(student.first_check) : ''}</span>
                <span>{student.last_check ? formatTime(student.last_check) : ''}</span>
            </div>
        </div>
    );
};

/**
 * Seans hisoboti — yaratuvchi va adminga ochiq. Guruhdagi har bir talaba:
 * kirganmi, qancha vaqt kadrda bo'lgan, muammoli kadrlar.
 * Qaror avtomatik qabul qilinmaydi: hisobot o'qituvchi ko'rib chiqishi uchun.
 */
export const ZoomFaceCheckReport = ({ sessionId }: { sessionId: number }) => {
    const [expanded, setExpanded] = useState<number | null>(null);
    const query = useQuery({
        queryKey: ['zoom-session-report', sessionId],
        queryFn: () => zoomSessionService.report(sessionId),
        // Dars davomida o'qituvchi kim kirganini kuzatib turadi.
        refetchInterval: 60_000,
    });

    if (query.isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;
    const students = query.data?.students ?? [];
    const zoomTracked = Boolean(query.data?.zoom_tracked);
    const outsiders = query.data?.outsiders ?? [];
    const randomChecks = query.data?.random_checks ?? true;
    const ended = Boolean(query.data?.ended);
    if (students.length === 0) {
        return <p className="text-sm text-muted-foreground">Seansga guruh talabalari biriktirilmagan.</p>;
    }

    return (
        <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
                Kirgan: {students.filter((s) => s.joined).length} / {students.length}
            </p>
            {students.map((student) => {
                if (!student.joined) {
                    return (
                        <div key={student.user_id} className="flex items-center gap-3 rounded-xl border border-dashed border-border/80 px-4 py-3">
                            <span className="min-w-0 flex-1 truncate font-medium">
                                {student.user_name || `#${student.user_id}`}
                                {student.group_name && <span className="ml-2 text-xs font-normal text-muted-foreground">{student.group_name}</span>}
                            </span>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                Kirmagan
                            </span>
                        </div>
                    );
                }
                const visits = student.zoom_visits ?? [];
                const zoomBadge = zoomTracked && (
                    <span
                        className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                        title={visits.length > 0
                            ? `Zoom'da: ${formatVisits(visits)}`
                            : "Zoom ma'lumoti bo'yicha uchrashuvda o'tirgan vaqt"}
                    >
                        <Video className="h-3.5 w-3.5" />
                        {student.zoom_seconds != null ? formatMinutes(student.zoom_seconds) : "Zoom'da yo'q"}
                    </span>
                );
                // Faqat kirishda tekshirilgan: kuzatuv chizig'i yo'q — kirishdagi natija, kirib-chiqishlar va Zoom'dagi vaqt.
                const isOpen = expanded === student.user_id;
                const toggle = () => setExpanded(isOpen ? null : student.user_id);
                const chevron = isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />;
                const nameCell = (
                    <span className="min-w-0 flex-1 truncate font-medium">
                        {student.user_name || `#${student.user_id}`}
                        {student.group_name && <span className="ml-2 text-xs font-normal text-muted-foreground">{student.group_name}</span>}
                    </span>
                );
                const entries = entryCount(student);
                const entriesBadge = entries > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <LogIn className="h-3.5 w-3.5" /> {entries} marta kirdi
                    </span>
                );
                const entriesPanel = isOpen && (
                    <div className="border-t border-border/60 px-4 py-3">
                        <EntryExitList student={student} ended={ended} />
                    </div>
                );
                if (!randomChecks && student.total > 0) {
                    return (
                        <div key={student.user_id} className="rounded-xl border border-border/60">
                            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={toggle}>
                                {chevron}
                                {nameCell}
                                {student.passed > 0 ? (
                                    <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                        Kirishda tasdiqlandi{student.first_check ? ` · ${formatTime(student.first_check)}` : ''}
                                    </span>
                                ) : (
                                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                        Tasdiqlanmadi · {student.total} urinish
                                    </span>
                                )}
                                {entriesBadge}
                                {zoomBadge}
                            </button>
                            {entriesPanel}
                        </div>
                    );
                }
                // Yuz nazoratisiz seans: faqat Zoom'dagi vaqt bor, kuzatuv chizig'i yo'q.
                if (student.total === 0) {
                    return (
                        <div key={student.user_id} className="rounded-xl border border-border/60">
                            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={toggle}>
                                {chevron}
                                {nameCell}
                                {entriesBadge}
                                {zoomBadge}
                            </button>
                            {entriesPanel}
                        </div>
                    );
                }
                const presentRatio = student.tracked_seconds > 0
                    ? Math.round(((student.tracked_seconds - student.absent_seconds) / student.tracked_seconds) * 100)
                    : 100;

                return (
                    <div key={student.user_id} className="rounded-xl border border-border/60">
                        <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={toggle}>
                            {chevron}
                            {nameCell}
                            {/* Chiqib ketganini «doim kadrda» yashirmasin: foiz faqat
                                talabaning o'z oynasi bo'yicha, darsning qolgani unda yo'q. */}
                            {student.left_early && student.last_check && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                                    <LogOut className="h-3 w-3" />
                                    {formatTime(student.last_check)} da chiqdi
                                </span>
                            )}
                            {student.absent_seconds > 0 ? (
                                <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                    {formatMinutes(student.absent_seconds)} yo'q
                                </span>
                            ) : !student.left_early && (
                                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                    Doim kadrda
                                </span>
                            )}
                            <span className="shrink-0 text-xs text-muted-foreground">{presentRatio}%</span>
                            {(student.zoom_visits?.length ?? 0) > 0 && entriesBadge}
                            {zoomBadge}
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
                                {(student.zoom_visits?.length ?? 0) > 0 && <EntryExitList student={student} ended={ended} />}

                                {student.periods.length === 0 ? (
                                    <p className="text-xs text-emerald-600">Yuz butun davomida kadrda bo'lgan.</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {student.periods.map((period, index) => (
                                            <li key={index} className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className="font-medium">
                                                    {formatTime(period.start)} — {period.end ? formatTime(period.end) : 'oxirigacha'}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {formatMinutes(period.duration_seconds)} · {periodReasons(period)}
                                                </span>
                                                {/* Dalil: davr boshidan olingan 1-2 kadr. Surat
                                                    himoyalangan endpoint orqali beriladi. */}
                                                {period.image_check_ids.map((checkId, position) => (
                                                    <button
                                                        key={checkId}
                                                        type="button"
                                                        onClick={() => void zoomSessionService.openImage(checkId)}
                                                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                                                    >
                                                        <ImageIcon className="h-3 w-3" />
                                                        {position === 0 ? 'Surat' : `Surat ${position + 1}`}
                                                    </button>
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
            {/* Zoom'da bo'lgan, lekin LMS orqali kirmagan: o'qituvchi o'zi yoki
                raqam va parolni bilib kirib olgan begona. */}
            {outsiders.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
                        <UserX className="h-4 w-4" /> LMS orqali kirmagan ishtirokchilar: {outsiders.length}
                    </p>
                    <ul className="space-y-0.5 text-xs">
                        {outsiders.map((outsider, index) => (
                            <li key={index} className="flex flex-wrap gap-x-2">
                                <span className="font-medium">{outsider.name || "Noma'lum"}</span>
                                <span className="text-muted-foreground">
                                    {formatTime(outsider.first_join)} dan · {formatMinutes(outsider.seconds)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                        Yuz tekshiruvidan o'tmagan. O'qituvchining o'zi ham shu ro'yxatda bo'lishi mumkin.
                    </p>
                </div>
            )}
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <ScanFace className="h-3.5 w-3.5" />
                {randomChecks
                    ? "Tekshiruv avtomatik va taxminan daqiqada bir marta. Qisqa yo'qolishlar qayd etilmaydi — davr faqat ketma-ket ikki kadrda yuz topilmasa ochiladi. Qaror sizda."
                    : "Bu seansda yuz faqat kirishda tekshirilgan — dars davomida kim qancha o'tirgani Zoom ma'lumotidan."}
            </p>
        </div>
    );
};
