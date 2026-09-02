import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { AUDIENCE_LABELS, STATUS_LABELS, toIsoOrNull, toLocalInput } from './labels';
import { useAudienceOptions, useCreateAnnouncement, useUpdateAnnouncement } from '@/hooks/useAnnouncements';
import type {
    Announcement,
    AnnouncementPayload,
    AnnouncementStatus,
    AudienceKind,
} from '@/services/announcementService';

const STATUSES: AnnouncementStatus[] = ['draft', 'published', 'archived'];
const AUDIENCES: AudienceKind[] = ['all', 'faculty', 'group', 'level'];

const formOf = (announcement: Announcement): typeof emptyState => ({
    title: announcement.title,
    body: announcement.body ?? '',
    imageUrl: announcement.image_url ?? null,
    status: announcement.status,
    pinned: announcement.pinned,
    publishAt: toLocalInput(announcement.publish_at),
    expiresAt: toLocalInput(announcement.expires_at),
    registrationEnabled: announcement.registration_enabled,
    eventAt: toLocalInput(announcement.event_at),
    location: announcement.location ?? '',
    linkUrl: announcement.link_url ?? '',
    capacity: announcement.capacity != null ? String(announcement.capacity) : '',
    registrationDeadline: toLocalInput(announcement.registration_deadline),
    audienceKind: announcement.audience_kind,
    audienceValues: announcement.audience_values ?? [],
});

interface Props {
    editing: Announcement | null;
    onDone: () => void;
    onCancel: () => void;
}

const emptyState = {
    title: '',
    body: '',
    imageUrl: null as string | null,
    status: 'draft' as AnnouncementStatus,
    pinned: false,
    publishAt: '',
    expiresAt: '',
    registrationEnabled: false,
    eventAt: '',
    location: '',
    linkUrl: '',
    capacity: '',
    registrationDeadline: '',
    audienceKind: 'all' as AudienceKind,
    audienceValues: [] as (string | number)[],
};

export const AnnouncementForm = ({ editing, onDone, onCancel }: Props) => {
    // Boshlang'ich holat `editing` dan bir marta yig'iladi: oyna har safar
    // `key` bilan qaytadan yaratiladi, shuning uchun effekt bilan sinxronlash
    // shart emas.
    const [form, setForm] = useState(() => (editing ? formOf(editing) : emptyState));
    const [error, setError] = useState('');

    const createAnnouncement = useCreateAnnouncement();
    const updateAnnouncement = useUpdateAnnouncement();
    const { data: audience } = useAudienceOptions();

    const saving = createAnnouncement.isPending || updateAnnouncement.isPending;

    const patch = <K extends keyof typeof emptyState>(key: K, value: (typeof emptyState)[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    // Auditoriya turi almashganda eski qiymatlar mos kelmaydi — tozalanadi.
    const setAudienceKind = (kind: AudienceKind) =>
        setForm((prev) => ({ ...prev, audienceKind: kind, audienceValues: [] }));

    const audienceChoices = useMemo(() => {
        if (!audience) return [];
        if (form.audienceKind === 'faculty') {
            return audience.faculties.map((name) => ({ value: name, label: name }));
        }
        if (form.audienceKind === 'level') {
            return audience.levels.map((name) => ({ value: name, label: name }));
        }
        if (form.audienceKind === 'group') {
            return audience.groups.map((group) => ({ value: String(group.id), label: group.name }));
        }
        return [];
    }, [audience, form.audienceKind]);

    const labelOfValue = (value: string | number) => {
        if (form.audienceKind === 'group') {
            return audience?.groups.find((group) => group.id === Number(value))?.name ?? String(value);
        }
        return String(value);
    };

    const addAudienceValue = (raw: string) => {
        if (!raw) return;
        const value: string | number = form.audienceKind === 'group' ? Number(raw) : raw;
        setForm((prev) =>
            prev.audienceValues.some((item) => String(item) === String(value))
                ? prev
                : { ...prev, audienceValues: [...prev.audienceValues, value] },
        );
    };

    const removeAudienceValue = (value: string | number) =>
        setForm((prev) => ({
            ...prev,
            audienceValues: prev.audienceValues.filter((item) => String(item) !== String(value)),
        }));

    const submit = () => {
        if (!form.title.trim()) { setError('Sarlavhani kiriting'); return; }
        if (form.audienceKind !== 'all' && form.audienceValues.length === 0) {
            setError(`${AUDIENCE_LABELS[form.audienceKind]} tanlanmagan`);
            return;
        }
        setError('');

        const payload: AnnouncementPayload = {
            title: form.title.trim(),
            body: form.body,
            image_url: form.imageUrl,
            status: form.status,
            pinned: form.pinned,
            publish_at: toIsoOrNull(form.publishAt),
            expires_at: toIsoOrNull(form.expiresAt),
            registration_enabled: form.registrationEnabled,
            event_at: toIsoOrNull(form.eventAt),
            location: form.location.trim() || null,
            link_url: form.linkUrl.trim() || null,
            capacity: form.capacity ? Number(form.capacity) : null,
            registration_deadline: toIsoOrNull(form.registrationDeadline),
            audience_kind: form.audienceKind,
            audience_values: form.audienceKind === 'all' ? [] : form.audienceValues,
        };

        const onError = (cause: unknown) => {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Saqlashda xatolik');
        };

        if (editing) {
            updateAnnouncement.mutate(
                { id: editing.id, data: payload },
                { onSuccess: () => { toast.success("E'lon yangilandi"); onDone(); }, onError },
            );
        } else {
            createAnnouncement.mutate(payload, {
                onSuccess: () => { toast.success("E'lon qo'shildi"); onDone(); },
                onError,
            });
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="mb-1 block text-sm font-medium">Sarlavha</label>
                <Input
                    value={form.title}
                    onChange={(event) => patch('title', event.target.value)}
                    placeholder="E'lon sarlavhasi"
                />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium">Matn</label>
                <textarea
                    className="min-h-32 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={form.body}
                    onChange={(event) => patch('body', event.target.value)}
                    placeholder="E'lon matni..."
                />
            </div>

            <ImageUploadField
                label="Banner (ixtiyoriy)"
                value={form.imageUrl}
                onChange={(url) => patch('imageUrl', url)}
                previewSize={96}
            />

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm font-medium">Holati</label>
                    <div className="flex flex-wrap gap-2">
                        {STATUSES.map((value) => (
                            <Button
                                key={value}
                                size="sm"
                                variant={form.status === value ? 'primary' : 'outline'}
                                onClick={() => patch('status', value)}
                            >
                                {STATUS_LABELS[value]}
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="flex items-end gap-2 pb-1">
                    <Switch
                        checked={form.pinned}
                        onCheckedChange={(checked) => patch('pinned', checked)}
                    />
                    <span className="text-sm font-medium">Tepaga qadash</span>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm font-medium">Ko'rsatish boshlanishi</label>
                    <Input
                        type="datetime-local"
                        value={form.publishAt}
                        onChange={(event) => patch('publishAt', event.target.value)}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium">Ko'rsatish tugashi</label>
                    <Input
                        type="datetime-local"
                        value={form.expiresAt}
                        onChange={(event) => patch('expiresAt', event.target.value)}
                    />
                </div>
            </div>

            {/* Auditoriya. «Barcha talabalar» dan boshqasida qiymat tanlash shart. */}
            <div>
                <label className="mb-1 block text-sm font-medium">Kim uchun</label>
                <div className="flex flex-wrap gap-2">
                    {AUDIENCES.map((kind) => (
                        <Button
                            key={kind}
                            size="sm"
                            variant={form.audienceKind === kind ? 'primary' : 'outline'}
                            onClick={() => setAudienceKind(kind)}
                        >
                            {AUDIENCE_LABELS[kind]}
                        </Button>
                    ))}
                </div>
                {form.audienceKind !== 'all' && (
                    <div className="mt-2 space-y-2">
                        <Combobox
                            options={audienceChoices}
                            onChange={addAudienceValue}
                            placeholder={`${AUDIENCE_LABELS[form.audienceKind]} qo'shish`}
                        />
                        {form.audienceValues.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {form.audienceValues.map((value) => (
                                    <span
                                        key={String(value)}
                                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                                    >
                                        {labelOfValue(value)}
                                        <button
                                            type="button"
                                            onClick={() => removeAudienceValue(value)}
                                            aria-label="Olib tashlash"
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-border/60 p-3">
                <div className="flex items-center gap-2">
                    <Switch
                        checked={form.registrationEnabled}
                        onCheckedChange={(checked) => patch('registrationEnabled', checked)}
                    />
                    <span className="text-sm font-medium">Tadbir — talaba ro'yxatdan o'tadi</span>
                </div>
                {form.registrationEnabled && (
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium">Tadbir vaqti</label>
                            <Input
                                type="datetime-local"
                                value={form.eventAt}
                                onChange={(event) => patch('eventAt', event.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium">Joyi</label>
                            <Input
                                value={form.location}
                                onChange={(event) => patch('location', event.target.value)}
                                placeholder="Bosh bino, katta zal"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium">Joylar soni</label>
                            <Input
                                type="number"
                                min={1}
                                value={form.capacity}
                                onChange={(event) => patch('capacity', event.target.value)}
                                placeholder="Cheklanmagan"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium">Yozilish muddati</label>
                            <Input
                                type="datetime-local"
                                value={form.registrationDeadline}
                                onChange={(event) => patch('registrationDeadline', event.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium">Havola (ixtiyoriy)</label>
                <Input
                    value={form.linkUrl}
                    onChange={(event) => patch('linkUrl', event.target.value)}
                    placeholder="https://..."
                />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel} disabled={saving}>Bekor qilish</Button>
                <Button onClick={submit} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Saqlash
                </Button>
            </div>
        </div>
    );
};
