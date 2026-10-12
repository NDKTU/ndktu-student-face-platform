import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { GroupChecklist, type GroupSource } from '@/components/generalTest/GroupChecklist';
import { toggleGroup } from '@/components/generalTest/labels';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useZoomCapabilities, useZoomTeacherOptions, useZoomTeacherSubjects } from '@/hooks/useZoomSessions';
import { zoomSessionService, type ZoomSession, type ZoomSessionPayload } from '@/services/zoomSessionService';

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

/** Server `repository.py::auto_title` bilan bir xil: «Fan — Familiya I.O. (101-23, 102-23 +2)». */
const TITLE_GROUPS_SHOWN = 3;
const buildAutoTitle = (subject?: string, teacher?: string, groupNames: string[] = []) => {
    if (!subject) return '';
    let title = teacher ? `${subject} — ${shortTeacherName(teacher)}` : subject;
    const names = [...groupNames].sort();
    if (names.length) {
        let shown = names.slice(0, TITLE_GROUPS_SHOWN).join(', ');
        if (names.length > TITLE_GROUPS_SHOWN) shown += ` +${names.length - TITLE_GROUPS_SHOWN}`;
        title += ` (${shown})`;
    }
    return title.slice(0, 255);
};

interface Props {
    editing: ZoomSession | null;
    onClose: () => void;
    onSubmit: (payload: ZoomSessionPayload) => void;
    isPending: boolean;
    error?: string | null;
}

export function ZoomSessionFormModal({ editing, onClose, onSubmit, isPending, error }: Props) {
    const start = splitIso(editing?.starts_at);
    const end = splitIso(editing?.ends_at);
    // Bo'sh nom — server fan, o'qituvchi va guruhlardan o'zi yasaydi.
    const [title, setTitle] = useState(editing?.title ?? '');
    const [pickedTeacherId, setTeacherId] = useState<number | null>(editing?.teacher_user_id ?? null);
    const [pickedTeacherName, setTeacherName] = useState(editing?.teacher_name ?? '');
    const [teacherSearch, setTeacherSearch] = useState('');
    const [subjectId, setSubjectId] = useState<number | null>(editing?.subject_id ?? null);
    const [link, setLink] = useState(editing?.link_url ?? '');
    const [date, setDate] = useState(start.date || todayInTashkent());
    const [startTime, setStartTime] = useState(start.time || '12:00');
    const [endTime, setEndTime] = useState(end.time || '13:20');
    const [groups, setGroups] = useState<Map<number, string>>(
        () => new Map((editing?.groups ?? []).map((g) => [g.id, g.name])),
    );
    const [faceCheck, setFaceCheck] = useState(editing?.face_check_enabled ?? true);
    const [isActive, setIsActive] = useState(editing?.is_active ?? true);
    const [localError, setLocalError] = useState<string | null>(null);

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
    const subjectName = subjects?.find((s) => s.id === subjectId)?.name ?? editing?.subject_name ?? undefined;
    const autoTitle = buildAutoTitle(subjectName, teacherName, [...groups.values()]);
    // Yangi seansda — server Zoom API sozlangan bo'lsa, uchrashuvni o'zi
    // yaratishi mumkin. Tahrirda tanlov yo'q: seans qanday yaratilgan bo'lsa, shunday qoladi.
    const { data: capabilities } = useZoomCapabilities(true);
    const [autoCreateChoice, setAutoCreateChoice] = useState(true);
    const managed = editing ? editing.zoom_managed : Boolean(capabilities?.auto_create) && autoCreateChoice;
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
        setLocalError(null);
        onSubmit({
            title: title.trim() || null,
            teacher_user_id: teacherId,
            subject_id: subjectId,
            link_url: managed ? null : link.trim(),
            zoom_account_id: selectedAccount === '' || editing?.zoom_managed ? null : Number(selectedAccount),
            starts_at: `${date}T${startTime}:00${TASHKENT_OFFSET}`,
            ends_at: `${date}T${endTime}:00${TASHKENT_OFFSET}`,
            group_ids: [...groups.keys()],
            face_check_enabled: faceCheck,
            is_active: isActive,
        });
    };

    return (
        <Modal isOpen onClose={onClose} title={editing ? 'Seansni tahrirlash' : 'Yangi Zoom seans'} className="md:max-w-2xl">
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <span className="text-sm font-medium text-foreground">O'qituvchi</span>
                        <Combobox
                            options={teacherOptions}
                            value={teacherId != null ? String(teacherId) : ''}
                            onChange={(value) => {
                                const picked = teacherOptions.find((o) => o.value === value);
                                setTeacherId(value ? Number(value) : null);
                                setTeacherName(picked?.label ?? '');
                                // Fan o'qituvchiniki bo'lishi shart — boshqa o'qituvchida u bo'lmasligi mumkin.
                                setSubjectId(null);
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
                        <label htmlFor="zoom-subject" className="text-sm font-medium text-foreground">
                            Fan
                        </label>
                        <select
                            id="zoom-subject"
                            value={subjectId ?? ''}
                            onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}
                            disabled={teacherId == null || subjectsLoading}
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60"
                        >
                            <option value="">
                                {teacherId == null
                                    ? "Avval o'qituvchini tanlang"
                                    : subjectsLoading
                                        ? 'Yuklanmoqda...'
                                        : subjects?.length
                                            ? 'Fanni tanlang'
                                            : "O'qituvchiga fan biriktirilmagan"}
                            </option>
                            {subjects?.map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                    {subject.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div>
                    <Input
                        label="Nomi"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={autoTitle || "Fan va o'qituvchini tanlang — nom o'zi yasaladi"}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        Bo'sh qoldirsangiz, nom fan, o'qituvchi va guruhlardan o'zi yasaladi
                        {editing && title ? " — o'zingiz yozgan nomni o'chirsangiz, qayta yasaladi" : ''}
                    </p>
                </div>
                {!editing && capabilities?.auto_create && (
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
                        <label htmlFor="zoom-auto-create" className="cursor-pointer">
                            <div className="text-sm font-medium">Zoom'da avtomatik yaratish</div>
                            <div className="text-xs text-muted-foreground">
                                Uchrashuvni LMS o'zi yaratadi. Talaba shaxsiy havola bilan kiradi — raqam va parolni
                                bilgan begona odam kira olmaydi
                            </div>
                        </label>
                        <Switch id="zoom-auto-create" checked={autoCreateChoice} onCheckedChange={setAutoCreateChoice} />
                    </div>
                )}
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
                        <select
                            id="zoom-account"
                            value={selectedAccount}
                            onChange={(e) => setAccountId(e.target.value)}
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        >
                            <option value="">
                                {managed ? "Avtomatik — shu vaqtda bo'sh akkaunt" : 'Avtomatik — havoladan aniqlanadi'}
                            </option>
                            {accountOptions.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {account.name}
                                </option>
                            ))}
                        </select>
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Input label="Sana" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    <Input label="Boshlanishi" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    <Input label="Tugashi" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    <p className="text-xs text-muted-foreground sm:col-span-3">
                        Toshkent vaqti. Talaba boshlanishdan 10 daqiqa oldin kira oladi, tugagach — kira olmaydi.
                        Boshqa guruhlar bu seansni ko'rmaydi.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Guruhlar</span>
                    <GroupChecklist
                        selected={groups}
                        onToggle={(group) => setGroups((prev) => toggleGroup(prev, group))}
                        source={ZOOM_GROUP_SOURCE}
                    />
                    {groups.size > 0 && (
                        <p className="text-xs text-muted-foreground">Tanlangan: {[...groups.values()].join(', ')}</p>
                    )}
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
                    <label htmlFor="zoom-face-check" className="cursor-pointer">
                        <div className="text-sm font-medium">Yuz nazorati</div>
                        <div className="text-xs text-muted-foreground">
                            Kirishda yuz HEMIS surati bilan solishtiriladi (mos kelmasa — kirmaydi), dars davomida
                            tasodifiy tekshiriladi
                        </div>
                    </label>
                    <Switch id="zoom-face-check" checked={faceCheck} onCheckedChange={setFaceCheck} />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
                    <label htmlFor="zoom-active" className="cursor-pointer">
                        <div className="text-sm font-medium">Faol</div>
                        <div className="text-xs text-muted-foreground">O'chirilgan seans talabalarga ko'rinmaydi</div>
                    </label>
                    <Switch id="zoom-active" checked={isActive} onCheckedChange={setIsActive} />
                </div>
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
