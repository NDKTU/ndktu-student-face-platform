import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { GroupChecklist, type GroupSource } from '@/components/generalTest/GroupChecklist';
import { toggleGroup } from '@/components/generalTest/labels';
import { useZoomCapabilities } from '@/hooks/useZoomSessions';
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
    const [title, setTitle] = useState(editing?.title ?? '');
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
        if (!title.trim()) return setLocalError('Nomini kiriting');
        if (!managed && !link.trim()) return setLocalError("Zoom havolasini qo'ying");
        if (!date || !startTime || !endTime) return setLocalError('Sana va vaqtni kiriting');
        if (endTime <= startTime) return setLocalError("Tugash vaqti boshlanishdan keyin bo'lishi kerak");
        if (groups.size === 0) return setLocalError('Kamida bitta guruhni tanlang');
        setLocalError(null);
        onSubmit({
            title: title.trim(),
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
                <Input label="Nomi" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: Ma'lumotlar bazasi — ma'ruza" />
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
