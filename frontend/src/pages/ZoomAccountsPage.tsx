import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Pencil, Plus, ShieldCheck, Trash2, Video, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { useAuth } from '@/context/AuthContext';
import { useCheckZoomAccount, useDeleteZoomAccount, useSaveZoomAccount, useZoomAccounts } from '@/hooks/useZoomAccounts';
import type { ZoomAccount, ZoomAccountCheck, ZoomAccountPayload } from '@/services/zoomAccountService';
import { apiErrorMessage } from '@/utils/apiError';
import { cn } from '@/lib/utils';

const WEBHOOK_PATH = '/api/zoom/webhook';

const Flag = ({ ok, label }: { ok: boolean; label: string }) => (
    <span
        className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground',
        )}
    >
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {label}
    </span>
);

const CheckResult = ({ result }: { result: ZoomAccountCheck }) => (
    <div className="space-y-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
        {result.api_ok == null ? (
            <p className="text-muted-foreground">Zoom API sozlanmagan — seans faqat havola bilan yaratiladi.</p>
        ) : result.api_ok ? (
            <p className="text-emerald-600">
                Zoom API ishlayapti. Host: {result.host_email}
                {result.host_licensed ? ' — litsenziyali' : ''}
            </p>
        ) : (
            <p className="text-destructive">Zoom API kalitni qabul qilmadi: {result.api_message}</p>
        )}
        {result.api_ok && !result.host_licensed && <p className="text-amber-600">{result.api_message}</p>}
        <p className={result.sdk_configured ? 'text-muted-foreground' : 'text-destructive'}>
            {result.sdk_configured
                ? "Meeting SDK kaliti kiritilgan. U faqat talaba kirganda tekshiriladi: 4011 xatosi — SDK ilovasi boshqa akkauntda."
                : "Meeting SDK kaliti yo'q — talabalar sahifada kira olmaydi."}
        </p>
    </div>
);

interface FormProps {
    editing: ZoomAccount | null;
    onClose: () => void;
}

/** Sir maydoni: tahrirda bo'sh qoldirilsa — saqlangani o'zgarmaydi. */
const secretPlaceholder = (saved: boolean | undefined) =>
    saved ? "Saqlangan — o'zgartirish uchun yangisini kiriting" : '';

function ZoomAccountFormModal({ editing, onClose }: FormProps) {
    const save = useSaveZoomAccount();
    const [form, setForm] = useState({
        name: editing?.name ?? '',
        host_email: editing?.host_email ?? '',
        api_account_id: editing?.api_account_id ?? '',
        api_client_id: editing?.api_client_id ?? '',
        api_client_secret: '',
        webhook_secret_token: '',
        sdk_key: editing?.sdk_key ?? '',
        sdk_secret: '',
        is_active: editing?.is_active ?? true,
    });
    const [error, setError] = useState<string | null>(null);
    const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return setError('Nomini kiriting');
        if (!form.sdk_key.trim()) return setError('Meeting SDK Client ID ni kiriting');
        if (!editing && !form.sdk_secret.trim()) return setError('Meeting SDK Client Secret ni kiriting');
        setError(null);
        const data: ZoomAccountPayload = { ...form, name: form.name.trim(), sdk_key: form.sdk_key.trim() };
        save.mutate(
            { id: editing?.id, data },
            {
                onSuccess: () => {
                    toast.success(editing ? 'Akkaunt saqlandi' : "Akkaunt qo'shildi");
                    onClose();
                },
                onError: (cause) => setError(apiErrorMessage(cause, "Saqlab bo'lmadi")),
            },
        );
    };

    return (
        <Modal isOpen onClose={onClose} title={editing ? 'Akkauntni tahrirlash' : "Zoom akkaunt qo'shish"} className="md:max-w-2xl">
            <form onSubmit={submit} className="space-y-5">
                <Input label="Nomi" value={form.name} onChange={set('name')} placeholder="Masalan: Kimyo fakulteti" />

                <fieldset className="space-y-3 rounded-lg border border-border px-3 pb-3 pt-2">
                    <legend className="px-1 text-sm font-medium">Server-to-Server OAuth ilovasi</legend>
                    <p className="text-xs text-muted-foreground">
                        Uchrashuvni LMS o'zi yaratishi uchun. Ixtiyoriy — bo'sh qoldirilsa, seansga havolani qo'lda qo'yasiz.
                        To'ldirilsa, to'rttala maydon ham kerak.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input label="Account ID" value={form.api_account_id} onChange={set('api_account_id')} />
                        <Input label="Client ID" value={form.api_client_id} onChange={set('api_client_id')} />
                        <Input
                            label="Client Secret"
                            type="password"
                            autoComplete="new-password"
                            value={form.api_client_secret}
                            onChange={set('api_client_secret')}
                            placeholder={secretPlaceholder(editing?.has_api_secret)}
                        />
                        <Input
                            label="Host email (litsenziyali)"
                            type="email"
                            value={form.host_email}
                            onChange={set('host_email')}
                            placeholder="zoom@nsumt.uz"
                        />
                    </div>
                    <Input
                        label="Webhook Secret Token (Feature → Token)"
                        type="password"
                        autoComplete="new-password"
                        value={form.webhook_secret_token}
                        onChange={set('webhook_secret_token')}
                        placeholder={secretPlaceholder(editing?.has_webhook_secret)}
                    />
                </fieldset>

                <fieldset className="space-y-3 rounded-lg border border-border px-3 pb-3 pt-2">
                    <legend className="px-1 text-sm font-medium">General App + Meeting SDK ilovasi</legend>
                    <p className="text-xs text-muted-foreground">
                        Talaba sahifada kirishi uchun — majburiy. Ilova albatta SHU akkauntda yaratilgan bo'lsin, aks holda
                        Zoom 4011 xatosini beradi.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input label="Client ID" value={form.sdk_key} onChange={set('sdk_key')} />
                        <Input
                            label="Client Secret"
                            type="password"
                            autoComplete="new-password"
                            value={form.sdk_secret}
                            onChange={set('sdk_secret')}
                            placeholder={secretPlaceholder(editing?.has_sdk_secret)}
                        />
                    </div>
                </fieldset>

                <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
                    <label htmlFor="zoom-account-active" className="cursor-pointer">
                        <div className="text-sm font-medium">Faol</div>
                        <div className="text-xs text-muted-foreground">
                            Faolsiz akkauntga yangi seans tushmaydi; eski seanslari ishlashda davom etadi
                        </div>
                    </label>
                    <Switch
                        id="zoom-account-active"
                        checked={form.is_active}
                        onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
                    />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" isLoading={save.isPending}>
                        Saqlash
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * «Zoom akkauntlar»: universitetning bir nechta Zoom akkaunti. Har birida
 * ikki ilova (S2S + Meeting SDK) — kalitlar shu yerda kiritiladi. Bitta
 * litsenziya bir vaqtda bitta uchrashuv: LMS yangi seansni shu vaqtda bo'sh
 * akkauntga o'zi joylaydi.
 */
export default function ZoomAccountsPage() {
    const { hasPermission } = useAuth();
    const { data: accounts, isLoading, isError, refetch } = useZoomAccounts();
    const remove = useDeleteZoomAccount();
    const check = useCheckZoomAccount();
    const [editing, setEditing] = useState<ZoomAccount | null | 'new'>(null);
    const [toDelete, setToDelete] = useState<ZoomAccount | null>(null);
    const [checks, setChecks] = useState<Record<number, ZoomAccountCheck>>({});
    const webhookUrl = `${window.location.origin}${WEBHOOK_PATH}`;

    const runCheck = (account: ZoomAccount) =>
        check.mutate(account.id, {
            onSuccess: (result) => setChecks((prev) => ({ ...prev, [account.id]: result })),
            onError: (cause) => toast.error(apiErrorMessage(cause, "Tekshirib bo'lmadi")),
        });

    const copyWebhook = async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            toast.success('Nusxa olindi');
        } catch {
            toast.error("Nusxa olib bo'lmadi");
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Zoom akkauntlar"
                description="Har akkauntda ikki ilova: Server-to-Server OAuth va Meeting SDK — ikkalasi ham shu akkauntda"
                actions={
                    hasPermission('create:zoom_account') && (
                        <Button onClick={() => setEditing('new')}>
                            <Plus className="h-4 w-4" /> Akkaunt qo'shish
                        </Button>
                    )
                }
            />

            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center">
                <span className="text-muted-foreground">Webhook manzili (barcha akkauntlar uchun bitta):</span>
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{webhookUrl}</code>
                <Button variant="outline" size="sm" onClick={() => void copyWebhook()}>
                    <Copy className="h-4 w-4" /> Nusxa
                </Button>
            </div>

            {isLoading ? (
                <Skeleton className="h-32 w-full rounded-xl" />
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : !accounts?.length ? (
                <Card>
                    <EmptyState
                        icon={<Video className="h-6 w-6" />}
                        title="Zoom akkaunt qo'shilmagan"
                        description="Akkaunt qo'shing: Zoom Marketplace'da shu akkaunt egasi sifatida ikki ilova yarating va kalitlarini kiriting."
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {accounts.map((account) => (
                        <div
                            key={account.id}
                            className={cn(
                                'space-y-3 rounded-xl border border-border bg-card px-4 py-3',
                                !account.is_active && 'opacity-60',
                            )}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium">{account.name}</p>
                                        {account.from_env && (
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                serverdagi .env dan
                                            </span>
                                        )}
                                        {!account.is_active && <span className="text-xs text-muted-foreground">faolsiz</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Flag ok={account.api_enabled} label="Avtomatik yaratish" />
                                        <Flag ok={account.sdk_enabled} label="Meeting SDK" />
                                        <Flag ok={account.has_webhook_secret} label="Webhook" />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {account.host_email ? `Host: ${account.host_email} · ` : ''}
                                        Seanslar: {account.sessions_count}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        isLoading={check.isPending && check.variables === account.id}
                                        onClick={() => runCheck(account)}
                                    >
                                        <ShieldCheck className="h-4 w-4" /> Tekshirish
                                    </Button>
                                    {!account.from_env && hasPermission('update:zoom_account') && (
                                        <Button variant="ghost" size="sm" aria-label="Tahrirlash" onClick={() => setEditing(account)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    )}
                                    {!account.from_env && hasPermission('delete:zoom_account') && (
                                        <Button variant="ghost" size="sm" aria-label="O'chirish" onClick={() => setToDelete(account)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {checks[account.id] && <CheckResult result={checks[account.id]} />}
                        </div>
                    ))}
                </div>
            )}

            {editing && <ZoomAccountFormModal editing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

            <ConfirmDialog
                isOpen={Boolean(toDelete)}
                onClose={() => setToDelete(null)}
                onConfirm={() =>
                    toDelete &&
                    remove.mutate(toDelete.id, {
                        onSuccess: () => {
                            toast.success("Akkaunt o'chirildi");
                            setToDelete(null);
                        },
                        onError: (cause) => {
                            toast.error(apiErrorMessage(cause, "O'chirib bo'lmadi"));
                            setToDelete(null);
                        },
                    })
                }
                title="Akkauntni o'chirish"
                description={`«${toDelete?.name}» o'chirilsinmi? Seanslari bor akkauntni o'chirib bo'lmaydi — uni faolsizlantiring.`}
                confirmText="O'chirish"
                isLoading={remove.isPending}
                variant="danger"
            />
        </div>
    );
}
