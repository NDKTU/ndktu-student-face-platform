import { useMemo, useState } from 'react';
import { TeacherLoadGroups } from '@/components/zoom/TeacherLoadGroups';
import { loadGroups, loadSubjects, loadTypes } from '@/utils/teacherLoad';
import { cn } from '@/lib/utils';
import { COURSE_TYPE_OPTIONS, courseTypeNameLabel, type CourseType } from '@/services/courseTypes';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeField } from '@/components/ui/TimeField';
import { PairPicker } from '@/components/zoom/PairPicker';
import { formatLongDate, pairRange } from '@/utils/dateTimeInput';
import { SwitchField } from '@/components/ui/SwitchField';
import { FaceControlPicker } from '@/components/common/FaceControlPicker';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { GroupChecklist, type GroupSource } from '@/components/generalTest/GroupChecklist';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePairTimes, useZoomCapabilities, useZoomTeacherLoad, useZoomTeacherOptions, useZoomTeacherSubjects } from '@/hooks/useZoomSessions';
import {
    zoomSessionService,
    type ZoomSeriesOptions,
    type ZoomSeriesRepeat,
    type ZoomSeriesScope,
    type ZoomSession,
    type ZoomSessionPayload,
} from '@/services/zoomSessionService';
import { formatDate } from '@/utils/date';

/** Guruhlar Zoom seansining o'z endpointidan — elementar test ruxsati talab qilinmasin. */
const ZOOM_GROUP_SOURCE: GroupSource = {
    key: 'zoom-session',
    groupOptions: zoomSessionService.groupOptions,
    filterOptions: zoomSessionService.filterOptions,
};

/** Vaqt doim Toshkent bo'yicha kiritiladi — brauzer qaysi zonada bo'lishidan qat'i nazar. */
const TASHKENT_OFFSET = '+05:00';

/** Serverdan kelgan ISO (`2026-10-09T12:00:00+05:00`) → sana va vaqt maydonlari. */
const splitIso = (iso?: string) => {
    if (!iso) return { date: '', time: '' };
    const local = new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000).toISOString();
    return { date: local.slice(0, 10), time: local.slice(11, 16) };
};

const todayInTashkent = () => splitIso(new Date().toISOString()).date;

/** «Aliyev Vali Sobirovich» → «Aliyev V.S.» — server ham shunday qisqartiradi. */
const shortTeacherName = (fullName: string) => {
    const [last, ...rest] = fullName.trim().split(/\s+/);
    const initials = rest.slice(0, 2).map((part) => `${part[0]}.`).join('');
    return [last, initials].filter(Boolean).join(' ');
};

/** Server `naming.py::auto_title` bilan bir xil: «Fan (amaliyot) — Familiya I.O. (101-23, 102-23 +2)». */
const TITLE_GROUPS_SHOWN = 3;
const buildAutoTitle = (subject?: string, teacher?: string, groupNames: string[] = [], type?: CourseType | null) => {
    if (!subject) return '';
    const typed = type ? `${subject} (${courseTypeNameLabel(type)})` : subject;
    let title = teacher ? `${typed} — ${shortTeacherName(teacher)}` : typed;
    const names = [...groupNames].sort();
    if (names.length) {
        let shown = names.slice(0, TITLE_GROUPS_SHOWN).join(', ');
        if (names.length > TITLE_GROUPS_SHOWN) shown += ` +${names.length - TITLE_GROUPS_SHOWN}`;
        title += ` (${shown})`;
    }
    return title.slice(0, 255);
};

/** Bekend bilan bir xil chegara (`SERIES_MAX_OCCURRENCES`). */
const SERIES_MAX = 30;
const REPEAT_STEP: Record<ZoomSeriesRepeat, number> = { weekly: 7, biweekly: 14 };

/** `YYYY-MM-DD` + kunlar → `YYYY-MM-DD`. UTC'da hisoblanadi — mintaqa sanani surmasin. */
const addDaysIso = (iso: string, days: number) => {
    const value = new Date(`${iso}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};

/** Seriyaning barcha sanalari: birinchisidan `until` gacha (kiradi), har `step` kunda. */
const seriesDates = (first: string, until: string, repeat: ZoomSeriesRepeat): string[] => {
    const dates: string[] = [];
    if (!first || !until || until < first) return dates;
    for (let current = first; current <= until && dates.length <= SERIES_MAX; current = addDaysIso(current, REPEAT_STEP[repeat])) {
        dates.push(current);
    }
    return dates;
};

export interface ZoomFormExtra {
    /** Yangi seans takrorlanadi — har sana alohida seans bo'lib yaratiladi. */
    series?: ZoomSeriesOptions;
    /** Seriyadagi seansni tahrirlash: faqat shu yoki shu va keyingilari. */
    scope?: ZoomSeriesScope;
}

interface Props {
    editing: ZoomSession | null;
    onClose: () => void;
    onSubmit: (payload: ZoomSessionPayload, extra: ZoomFormExtra) => void;
    isPending: boolean;
    error?: string | null;
}

export function ZoomSessionFormModal({ editing, onClose, onSubmit, isPending, error }: Props) {
    const start = splitIso(editing?.starts_at);
    const end = splitIso(editing?.ends_at);
    // Nom qo'lda yozilmaydi: server uni fan, o'qituvchi va guruhlardan yasaydi.
    const [pickedTeacherId, setTeacherId] = useState<number | null>(editing?.teacher_user_id ?? null);
    const [pickedTeacherName, setTeacherName] = useState(editing?.teacher_name ?? '');
    const [teacherSearch, setTeacherSearch] = useState('');
    const [subjectId, setSubjectId] = useState<number | null>(editing?.subject_id ?? null);
    const [link, setLink] = useState(editing?.link_url ?? '');
    const [date, setDate] = useState(start.date || todayInTashkent());
    const [startTime, setStartTime] = useState(start.time || '12:00');
    const [endTime, setEndTime] = useState(end.time || '13:20');
    const { data: pairs = [] } = usePairTimes();
    const range = pairRange(pairs, startTime, endTime);
    const pairLabel = range ? (range[0] === range[1] ? `${range[0]}-juftlik` : `${range[0]}–${range[1]}-juftlik`) : '';
    const minutes = (Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5))) - (Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)));
    const durationLabel = minutes > 0
        ? [Math.floor(minutes / 60) && `${Math.floor(minutes / 60)} soat`, minutes % 60 && `${minutes % 60} daq`].filter(Boolean).join(' ')
        : '';
    const [groups, setGroups] = useState<Map<number, string>>(
        () => new Map((editing?.groups ?? []).map((g) => [g.id, g.name])),
    );
    const [faceCheck, setFaceCheck] = useState(editing?.face_check_enabled ?? true);
    const [randomChecks, setRandomChecks] = useState(editing?.random_face_checks ?? true);
    const [isActive, setIsActive] = useState(editing?.is_active ?? true);
    const [localError, setLocalError] = useState<string | null>(null);
    // Takrorlash — faqat yangi seansda. «Qachongacha» standart: 8 hafta keyin.
    const [repeat, setRepeat] = useState<'' | ZoomSeriesRepeat>('');
    const [repeatUntil, setRepeatUntil] = useState(() => addDaysIso(start.date || todayInTashkent(), 7 * 8));
    const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
    const allDates = repeat ? seriesDates(date, repeatUntil, repeat) : [];
    const chosenDates = allDates.filter((d) => !skipped.has(d));
    // Tahrirda: seriyadagi seans bo'lsa — faqat shu yoki shu va keyingilari.
    const inSeries = Boolean(editing?.series_id);
    const [scope, setScope] = useState<ZoomSeriesScope>('one');
    const followingCount =
        editing?.series_position && editing.series_total ? editing.series_total - editing.series_position + 1 : 0;

    const { data: teacherData } = useZoomTeacherOptions(useDebouncedValue(teacherSearch));
    // O'qituvchi o'zi yaratyapti — tanlov yo'q, u o'zi (server ham shuni talab qiladi).
    const ownTeacher = teacherData?.locked ? teacherData.teachers[0] : undefined;
    const locked = Boolean(ownTeacher);
    const teacherId = ownTeacher?.user_id ?? pickedTeacherId;
    const teacherName = ownTeacher?.name ?? pickedTeacherName;
    const teacherOptions = useMemo<ComboboxOption[]>(() => {
        const options = (teacherData?.teachers ?? []).map((t) => ({
            value: String(t.user_id),
            label: t.name,
            hint: t.kafedra_name ?? undefined,
        }));
        // Tanlangani qidiruv natijasida bo'lmasa ham tugmada ko'rinib tursin.
        if (teacherId != null && !options.some((o) => o.value === String(teacherId))) {
            options.unshift({ value: String(teacherId), label: teacherName || `#${teacherId}`, hint: undefined });
        }
        return options;
    }, [teacherData, teacherId, teacherName]);
    const { data: subjects, isFetching: subjectsLoading } = useZoomTeacherSubjects(teacherId);
    // EPOS yuklamasi: guruhlar, ularda o'tadigan fanlar va turlar shundan tanlanadi.
    // Yuklama bo'lmasa (yangi xodim, sinxrondan oldin) — avvalgidek butun ro'yxat.
    const { data: load, isFetching: loadLoading } = useZoomTeacherLoad(teacherId);
    const loadItems = useMemo(() => load?.items ?? [], [load]);
    const hasLoad = loadItems.length > 0;
    const groupsFromLoad = useMemo(() => loadGroups(loadItems), [loadItems]);
    const [showAllGroups, setShowAllGroups] = useState(false);
    const subjectChoices = hasLoad ? loadSubjects(loadItems, groups.keys()) : (subjects ?? []);
    const allowedTypes = hasLoad ? loadTypes(loadItems, subjectId, groups.keys()) : [];
    const subjectName =
        subjectChoices.find((s) => s.id === subjectId)?.name
        ?? subjects?.find((s) => s.id === subjectId)?.name
        ?? editing?.subject_name
        ?? undefined;

    /** Fan tanlandi — yuklamada bitta tur bo'lsa, o'zi qo'yiladi; joriy tur yuklamada bo'lmasa — birinchisi. */
    const pickSubject = (id: number | null, groupIds: number[] = [...groups.keys()]) => {
        setSubjectId(id);
        if (!hasLoad || id == null) return;
        const types = loadTypes(loadItems, id, groupIds) as CourseType[];
        if (types.length === 1 || (types.length > 0 && (!trainingType || !types.includes(trainingType)))) {
            setTrainingType(types[0]);
        }
    };

    /** Guruh belgilandi — fan tanlangan guruhlarda umumiy bo'lmay qolsa tushadi, yagona variant bo'lsa — o'zi tanlanadi. */
    const toggleGroupById = (id: number, name: string) => {
        const next = new Map(groups);
        if (next.has(id)) next.delete(id);
        else next.set(id, name);
        setGroups(next);
        if (!hasLoad) return;
        const options = loadSubjects(loadItems, next.keys());
        if (subjectId != null && !options.some((option) => option.id === subjectId)) {
            pickSubject(options.length === 1 ? options[0].id : null, [...next.keys()]);
        } else if (subjectId == null && next.size > 0 && options.length === 1) {
            pickSubject(options[0].id, [...next.keys()]);
        }
    };
    // Yangi seansda — ma'ruza; eski (tursiz) seansni tahrirlashda tanlanmagan qoladi.
    const [trainingType, setTrainingType] = useState<CourseType | null>(editing ? editing.training_type ?? null : 'lecture');
    const autoTitle = buildAutoTitle(subjectName, teacherName, [...groups.values()], trainingType);
    // Yangi seansda — server Zoom API sozlangan bo'lsa, uchrashuvni o'zi
    // yaratishi mumkin. Tahrirda tanlov yo'q: seans qanday yaratilgan bo'lsa, shunday qoladi.
    const { data: capabilities } = useZoomCapabilities(true);
    // Zoom API sozlangan bo'lsa, uchrashuvni doim LMS o'zi yaratadi (tanlov olib tashlangan):
    // talaba shaxsiy havola bilan kiradi, raqam va parolni bilgan begona kira olmaydi.
    const managed = editing ? editing.zoom_managed : Boolean(capabilities?.auto_create);
    // Akkaunt: '' — avtomatik (bo'sh akkaunt yoki havoladan aniqlanadi).
    const [accountId, setAccountId] = useState<string>(
        editing && !editing.zoom_managed && editing.zoom_account_id != null ? String(editing.zoom_account_id) : '',
    );
    const accountOptions = (capabilities?.accounts ?? []).filter((account) => !managed || account.auto_create);
    // Rejim almashsa, tanlangan akkaunt ro'yxatdan chiqib qolishi mumkin — unda «avtomatik».
    const selectedAccount = accountOptions.some((account) => String(account.id) === accountId) ? accountId : '';
    // Akkaunt bitta bo'lsa tanlovning ma'nosi yo'q; API yaratgan seans esa o'z akkauntida qoladi.
    const showAccountSelect = !editing?.zoom_managed && (capabilities?.accounts.length ?? 0) > 1;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (teacherId == null) return setLocalError("O'qituvchini tanlang");
        if (subjectId == null) return setLocalError('Fanni tanlang');
        if (!managed && !link.trim()) return setLocalError("Zoom havolasini qo'ying");
        if (!date || !startTime || !endTime) return setLocalError('Sana va vaqtni kiriting');
        if (endTime <= startTime) return setLocalError("Tugash vaqti boshlanishdan keyin bo'lishi kerak");
        if (groups.size === 0) return setLocalError('Kamida bitta guruhni tanlang');
        if (repeat) {
            if (allDates.length > SERIES_MAX) {
                return setLocalError(`Seriyada ${SERIES_MAX} tadan ko'p dars bo'lmasin — «Qachongacha»ni yaqinroq qo'ying`);
            }
            if (chosenDates.length === 0) return setLocalError('Kamida bitta sanani belgilang');
        }
        setLocalError(null);
        const extra: ZoomFormExtra = editing
            ? { scope: inSeries ? scope : 'one' }
            : repeat
              ? { series: { repeat, repeat_until: repeatUntil, skip_dates: allDates.filter((d) => skipped.has(d)) } }
              : {};
        onSubmit({
            title: null,
            teacher_user_id: teacherId,
            subject_id: subjectId,
            training_type: trainingType,
            link_url: managed ? null : link.trim(),
            zoom_account_id: selectedAccount === '' || editing?.zoom_managed ? null : Number(selectedAccount),
            starts_at: `${date}T${startTime}:00${TASHKENT_OFFSET}`,
            ends_at: `${date}T${endTime}:00${TASHKENT_OFFSET}`,
            group_ids: [...groups.keys()],
            face_check_enabled: faceCheck,
            random_face_checks: randomChecks,
            is_active: isActive,
        }, extra);
    };

    return (
        <Modal isOpen onClose={onClose} title={editing ? 'Seansni tahrirlash' : 'Yangi Zoom seans'} className="md:max-w-2xl">
            <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">O'qituvchi</span>
                    <Combobox
                        options={teacherOptions}
                        value={teacherId != null ? String(teacherId) : ''}
                        onChange={(value) => {
                            const picked = teacherOptions.find((o) => o.value === value);
                            setTeacherId(value ? Number(value) : null);
                            setTeacherName(picked?.label ?? '');
                            // Guruh va fan o'qituvchiniki bo'lishi shart — boshqasida ular bo'lmasligi mumkin.
                            setSubjectId(null);
                            setGroups(new Map());
                            setShowAllGroups(false);
                        }}
                        onSearchChange={setTeacherSearch}
                        placeholder="O'qituvchini tanlang"
                        searchPlaceholder="F.I.Sh. bo'yicha qidirish..."
                        disabled={locked}
                    />
                    <p className="text-xs text-muted-foreground">
                        Darsni olib boradi: yuz tekshiruvisiz kiradi va uchrashuvni host sifatida boshlaydi
                    </p>
                </div>
                <div className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Guruhlar</span>
                    {teacherId == null ? (
                        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                            Avval o'qituvchini tanlang — uning guruhlari shu yerda chiqadi
                        </p>
                    ) : loadLoading && !load ? (
                        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                            Yuklama olinmoqda...
                        </p>
                    ) : hasLoad ? (
                        <>
                            <p className="text-xs text-muted-foreground">
                                EPMOS yuklamasi{load?.semester ? ` (${load.semester.toLowerCase()} semestr)` : ''} — o'qituvchi
                                dars o'tadigan guruhlar. Oqim ma'ruzasi uchun bir nechtasini belgilang.
                            </p>
                            <TeacherLoadGroups groups={groupsFromLoad} selected={groups} onToggle={toggleGroupById} />
                            {showAllGroups ? (
                                <GroupChecklist
                                    selected={groups}
                                    onToggle={(group) => toggleGroupById(group.id, group.name)}
                                    source={ZOOM_GROUP_SOURCE}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowAllGroups(true)}
                                    className="text-xs font-medium text-primary hover:underline"
                                >
                                    + Boshqa guruhni qo'shish (yuklamada yo'q)
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-amber-600">
                                EPMOS yuklamasi topilmadi — guruhni umumiy ro'yxatdan tanlang
                            </p>
                            <GroupChecklist
                                selected={groups}
                                onToggle={(group) => toggleGroupById(group.id, group.name)}
                                source={ZOOM_GROUP_SOURCE}
                            />
                        </>
                    )}
                    {groups.size > 0 && (
                        <p className="text-xs text-muted-foreground">Tanlangan: {[...groups.values()].join(', ')}</p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="zoom-subject" className="text-sm font-medium text-foreground">
                        Fan
                    </label>
                    <Select
                        id="zoom-subject"
                        value={subjectId == null ? '' : String(subjectId)}
                        onChange={(next) => pickSubject(next ? Number(next) : null)}
                        disabled={teacherId == null || subjectsLoading || loadLoading}
                        placeholder={
                            teacherId == null
                                ? "Avval o'qituvchini tanlang"
                                : subjectsLoading || loadLoading
                                    ? 'Yuklanmoqda...'
                                    : subjectChoices.length
                                        ? 'Fanni tanlang'
                                        : hasLoad
                                            ? "Tanlangan guruhlarda umumiy fan yo'q"
                                            : "O'qituvchiga fan biriktirilmagan"
                        }
                        options={[
                            // Saqlangan seansning fani yuklama tanlovida bo'lmasa ham ko'rinib tursin.
                            ...(subjectId != null && subjectName && !subjectChoices.some((subject) => subject.id === subjectId)
                                ? [{ value: String(subjectId), label: subjectName }]
                                : []),
                            ...subjectChoices.map((subject) => ({ value: String(subject.id), label: subject.name })),
                        ]}
                    />
                </div>
                <div className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Mashg'ulot turi</span>
                    {allowedTypes.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                            yuklamada bor
                        </span>
                    )}
                    <div role="radiogroup" aria-label="Mashg'ulot turi" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {COURSE_TYPE_OPTIONS.map((option) => {
                            const active = trainingType === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => setTrainingType(option.value)}
                                    title={allowedTypes.includes(option.value) ? 'EPMOS yuklamasida bor' : undefined}
                                    className={cn(
                                        'relative h-10 rounded-lg border text-sm font-medium transition',
                                        active
                                            ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/30'
                                            : 'border-input hover:border-primary/50',
                                    )}
                                >
                                    {option.label}
                                    {allowedTypes.includes(option.value) && (
                                        <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5">
                    <div className="text-xs text-muted-foreground">Nomi (o'zi yasaladi)</div>
                    <div className="mt-0.5 text-sm font-medium text-foreground">
                        {autoTitle || "Fan, o'qituvchi va guruhlarni tanlang"}
                    </div>
                </div>
                {editing?.zoom_managed && (
                    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                        Uchrashuv LMS tomonidan Zoom'da yaratilgan
                        {editing.zoom_account_name ? ` («${editing.zoom_account_name}» akkauntida)` : ''} — nom va
                        vaqt o'zgarsa, Zoom'da ham yangilanadi.
                    </p>
                )}
                {showAccountSelect && (
                    <div className="space-y-1.5">
                        <label htmlFor="zoom-account" className="text-sm font-medium text-foreground">
                            Zoom akkaunt
                        </label>
                        <Select
                            id="zoom-account"
                            value={selectedAccount}
                            onChange={setAccountId}
                            options={[
                                { value: '', label: managed ? "Avtomatik — shu vaqtda bo'sh akkaunt" : 'Avtomatik — havoladan aniqlanadi' },
                                ...accountOptions.map((account) => ({ value: String(account.id), label: account.name })),
                            ]}
                        />
                        <p className="text-xs text-muted-foreground">
                            {managed
                                ? 'Bitta litsenziya bir vaqtda bitta uchrashuv: band akkaunt tanlanmaydi.'
                                : "Havola qaysi akkauntdagi uchrashuvniki bo'lsa, o'sha — boshqa akkaunt kaliti bilan talaba kira olmaydi."}
                        </p>
                    </div>
                )}
                {!managed && (
                    <div>
                        <Input
                            label="Zoom havolasi"
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                            placeholder="https://us05web.zoom.us/j/89012345678?pwd=..."
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            Zoom'da «Copy Invite Link» orqali olingan havola. Talabalarga ko'rsatilmaydi — ular faqat shu
                            sahifa orqali, yuz tasdiqlangach kiradi. Zoom'da Waiting Room'ni yoqib qo'ying.
                        </p>
                    </div>
                )}
                <div className="space-y-3">
                    <DatePicker label="Sana" value={date} onChange={setDate} />
                    <PairPicker
                        start={startTime}
                        end={endTime}
                        onChange={(nextStart, nextEnd) => {
                            setStartTime(nextStart);
                            setEndTime(nextEnd);
                        }}
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <TimeField label="Boshlanishi" value={startTime} onChange={setStartTime} />
                        <TimeField label="Tugashi" value={endTime} onChange={setEndTime} />
                    </div>
                    {date && startTime && endTime && (
                        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">
                            {formatLongDate(date)}
                            {pairLabel && ` · ${pairLabel}`} · {startTime}–{endTime}
                            {durationLabel && <span className="text-muted-foreground"> ({durationLabel})</span>}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Toshkent vaqti. Talaba boshlanishdan 10 daqiqa oldin kira oladi, tugagach — kira olmaydi.
                        Boshqa guruhlar bu seansni ko'rmaydi.
                    </p>
                </div>
                {!editing && (
                    <div className="space-y-3 rounded-lg border border-border px-3 py-3">
                        {/* «Qachongacha» faqat takrorlashda — ungacha ro'yxat butun kenglikda, yonida bo'sh joy qolmasin. */}
                        <div className={cn('grid grid-cols-1 gap-3', repeat && 'sm:grid-cols-2')}>
                            <div className="space-y-1.5">
                                <label htmlFor="zoom-repeat" className="text-sm font-medium text-foreground">
                                    Takrorlash
                                </label>
                                <Select
                                    id="zoom-repeat"
                                    value={repeat}
                                    onChange={(next) => {
                                        setRepeat(next as '' | ZoomSeriesRepeat);
                                        setSkipped(new Set());
                                    }}
                                    options={[
                                        { value: '', label: 'Takrorlanmaydi — bitta seans' },
                                        { value: 'weekly', label: 'Har hafta' },
                                        { value: 'biweekly', label: 'Har 2 haftada (numerator / denominator)' },
                                    ]}
                                />
                            </div>
                            {repeat && (
                                <DatePicker
                                    label="Qachongacha"
                                    value={repeatUntil}
                                    min={date}
                                    onChange={(next) => {
                                        setRepeatUntil(next);
                                        setSkipped(new Set());
                                    }}
                                />
                            )}
                        </div>
                        {repeat && (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    Har bir sana — alohida seans va alohida Zoom uchrashuvi. Bayram yoki ta'til kunini
                                    belgidan chiqaring — u yaratilmaydi.
                                </p>
                                {allDates.length > SERIES_MAX ? (
                                    <p className="text-sm text-destructive">
                                        {SERIES_MAX} tadan ko'p sana — «Qachongacha»ni yaqinroq qo'ying
                                    </p>
                                ) : allDates.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Sana tanlanmagan</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {allDates.map((d) => {
                                            const on = !skipped.has(d);
                                            return (
                                                <label
                                                    key={d}
                                                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                                                        on
                                                            ? 'border-primary/30 bg-primary/10 text-primary'
                                                            : 'border-border text-muted-foreground line-through'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={on}
                                                        onChange={() =>
                                                            setSkipped((prev) => {
                                                                const next = new Set(prev);
                                                                if (next.has(d)) next.delete(d);
                                                                else next.add(d);
                                                                return next;
                                                            })
                                                        }
                                                        className="h-3.5 w-3.5"
                                                    />
                                                    {formatDate(d)}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                {allDates.length > 0 && allDates.length <= SERIES_MAX && (
                                    <p className="text-xs font-medium text-foreground">
                                        Yaratiladi: {chosenDates.length} ta seans
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {editing && inSeries && (
                    <div className="space-y-2 rounded-lg border border-border px-3 py-3" role="radiogroup" aria-label="O'zgartirish doirasi">
                        <div className="text-sm font-medium text-foreground">
                            Seriyadagi seans
                            {editing.series_position && editing.series_total
                                ? ` (${editing.series_position} / ${editing.series_total})`
                                : ''}
                        </div>
                        {(['one', 'following'] as const).map((value) => (
                            <label key={value} className="flex cursor-pointer items-start gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="zoom-scope"
                                    checked={scope === value}
                                    onChange={() => setScope(value)}
                                    className="mt-0.5"
                                />
                                <span>
                                    {value === 'one' ? 'Faqat shu seans' : `Shu va keyingi seanslar${followingCount ? ` (${followingCount} ta)` : ''}`}
                                    {value === 'following' && (
                                        <span className="block text-xs text-muted-foreground">
                                            Vaqt o'zgarsa, keyingilari ham shuncha suriladi — har biri o'z kunida qoladi
                                        </span>
                                    )}
                                </span>
                            </label>
                        ))}
                    </div>
                )}
                <FaceControlPicker
                    value={!faceCheck ? 'off' : randomChecks ? 'continuous' : 'entry'}
                    onChange={(level) => {
                        setFaceCheck(level !== 'off');
                        setRandomChecks(level === 'continuous');
                    }}
                    hints={{
                        off: "Talaba yuz tekshiruvisiz kiradi",
                        entry: "Kirishda HEMIS surati bilan solishtiriladi — mos kelmasa, kirmaydi",
                        continuous: "Kirishda va dars davomida ~daqiqada bir tasodifiy tekshiruv — hisobotda kim qancha kadrda",
                    }}
                />
                <SwitchField
                    id="zoom-active"
                    title="Faol"
                    description="O'chirilgan seans talabalarga ko'rinmaydi"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                />
                {(localError || error) && <p className="text-sm text-destructive">{localError || error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" isLoading={isPending}>
                        Saqlash
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
