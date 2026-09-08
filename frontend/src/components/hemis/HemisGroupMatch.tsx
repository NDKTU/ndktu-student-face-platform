import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, KeyRound, Link2, Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import {
    hemisService,
    type GroupMatchPreview,
    type GroupMatchProposal,
} from '@/services/hemisService';
import { cn } from '@/lib/utils';

const KIND_LABELS: Record<GroupMatchProposal['kind'], string> = {
    auto: 'Avtomatik',
    review: 'Tasdiqlash kerak',
    unmatched: 'Mos yo‘q',
    already: 'Bog‘langan',
};

const REASON_LABELS: Record<GroupMatchProposal['reason'], string> = {
    vote: 'talabalar bo‘yicha',
    name: 'nomi bo‘yicha',
    existing: 'oldindan',
    none: '—',
};

/**
 * HEMIS guruhlarini bizdagi guruhlar bilan bog'lash.
 *
 * Nima uchun alohida qadam. `groups.hemis_group_id` — yagona ishonchli
 * bog'lovchi: nomlar ikki tizimda muntazam farq qiladi («3B-24 KM (NMT)» va
 * «3B-24 KM (N.M.T)»). Bog'lamasdan talabalarni import qilsak, minglab odam
 * guruhsiz, bir qismi esa begona guruhda qolardi.
 */
export const HemisGroupMatch = () => {
    const queryClient = useQueryClient();
    const [token, setToken] = useState('');
    const [preview, setPreview] = useState<GroupMatchPreview | null>(null);
    // hemis_group_id -> tanlangan mahalliy guruh (null — bog'lamaslik)
    const [decisions, setDecisions] = useState<Record<number, number | null>>({});
    const [filter, setFilter] = useState<'all' | GroupMatchProposal['kind']>('review');

    const settingsQuery = useQuery({
        queryKey: ['hemis-data-settings'],
        queryFn: () => hemisService.getDataSettings(),
    });

    const saveToken = useMutation({
        mutationFn: () => hemisService.saveDataSettings({ token: token.trim() }),
        onSuccess: () => {
            setToken('');
            queryClient.invalidateQueries({ queryKey: ['hemis-data-settings'] });
            toast.success('Token saqlandi');
        },
        onError: () => toast.error("Tokenni saqlab bo'lmadi"),
    });

    const testToken = useMutation({
        mutationFn: () => hemisService.testDataToken(),
        onSuccess: (data) => {
            if (data.ok) toast.success(`Token ishlayapti — ${data.total} ta faol talaba`);
            else toast.error(data.detail || 'Token qabul qilinmadi');
            queryClient.invalidateQueries({ queryKey: ['hemis-data-settings'] });
        },
        onError: () => toast.error('Tekshirib bo‘lmadi'),
    });

    const runPreview = useMutation({
        mutationFn: () => hemisService.previewGroupMatch(),
        onSuccess: (data) => {
            setPreview(data);
            setDecisions({});
            toast.success(`${data.hemis_groups} ta guruh solishtirildi`);
        },
        onError: () => toast.error("Solishtirib bo'lmadi — token yoki bog'lanishni tekshiring"),
    });

    const applyMatch = useMutation({
        mutationFn: () =>
            hemisService.applyGroupMatch({
                run_id: preview!.run_id,
                apply_auto: true,
                decisions: Object.entries(decisions).map(([hemisId, groupId]) => ({
                    hemis_group_id: Number(hemisId),
                    group_id: groupId,
                })),
            }),
        onSuccess: (result) => {
            toast.success(`${result.linked} ta guruh bog'landi`);
            if (result.conflicts.length > 0) {
                toast.error(`${result.conflicts.length} ta ziddiyat — ro'yxatni tekshiring`);
            }
            void runPreview.mutateAsync();
        },
        onError: () => toast.error("Bog'lashni saqlab bo'lmadi"),
    });

    const proposals = useMemo(() => {
        const list = preview?.proposals ?? [];
        return filter === 'all' ? list : list.filter((p) => p.kind === filter);
    }, [preview, filter]);

    const settings = settingsQuery.data;

    return (
        <div className="space-y-4">
            {/* Token */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="h-4 w-4" />
                        HEMIS ma'lumot API tokeni
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        {settings?.has_token ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Token saqlangan {settings.token_tail}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Token kiritilmagan
                            </span>
                        )}
                        {settings?.last_ok_at && (
                            <span className="text-xs text-muted-foreground">
                                oxirgi muvaffaqiyatli so'rov: {new Date(settings.last_ok_at).toLocaleString()}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                        <div className="w-full sm:w-[360px]">
                            <Input
                                type="password"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Yangi tokenni qo'ying"
                                label="Token"
                            />
                        </div>
                        <Button
                            onClick={() => saveToken.mutate()}
                            disabled={!token.trim() || saveToken.isPending}
                        >
                            Saqlash
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => testToken.mutate()}
                            disabled={testToken.isPending || !settings?.has_token}
                        >
                            {testToken.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Tekshirish
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Token muddati tugaydi. Sinxronizatsiya 401 bilan to'xtasa — shu yerga yangisini qo'ying.
                        Saqlangan token hech qachon qaytarilmaydi, faqat oxirgi to'rt belgisi ko'rinadi.
                    </p>
                </CardContent>
            </Card>

            {/* Guruhlarni bog'lash */}
            <Card>
                <CardHeader className="flex-row items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Link2 className="h-4 w-4" />
                        Guruhlarni bog'lash
                    </CardTitle>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runPreview.mutate()}
                        disabled={runPreview.isPending || !settings?.has_token}
                    >
                        {runPreview.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Solishtirish
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {runPreview.isPending && (
                        <p className="text-sm text-muted-foreground">
                            HEMIS to'liq o'qilmoqda (49 sahifa, ~1 daqiqa)…
                        </p>
                    )}

                    {!preview && !runPreview.isPending && (
                        <p className="text-sm text-muted-foreground">
                            «Solishtirish» tugmasi HEMIS'dan barcha faol talabalarni o'qib, guruhlarni
                            taqqoslaydi. Bazaga hech narsa yozilmaydi — avval raqamlarni ko'rasiz.
                        </p>
                    )}

                    {preview && (
                        <>
                            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                                <span className="rounded-full bg-muted px-2.5 py-1">
                                    Talaba: {preview.hemis_total_students}
                                </span>
                                <span className="rounded-full bg-muted px-2.5 py-1">
                                    HEMIS guruh: {preview.hemis_groups} · bizda: {preview.local_groups}
                                </span>
                                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
                                    Avtomatik: {preview.auto_count}
                                </span>
                                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                                    Tasdiqlash: {preview.review_count}
                                </span>
                                <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-700 dark:text-rose-400">
                                    Mos yo'q: {preview.unmatched_count}
                                </span>
                                <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-700 dark:text-sky-400">
                                    Guruhsiz qoladi: {preview.students_without_group} talaba
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                {(['review', 'auto', 'unmatched', 'already', 'all'] as const).map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setFilter(key)}
                                        className={cn(
                                            'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                                            filter === key
                                                ? 'bg-primary text-white'
                                                : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        {key === 'all' ? 'Hammasi' : KIND_LABELS[key]}
                                    </button>
                                ))}
                            </div>

                            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border/60">
                                {proposals.length === 0 ? (
                                    <p className="p-6 text-center text-sm text-muted-foreground">
                                        Bu turkumda guruh yo'q.
                                    </p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/40 text-xs">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-bold">HEMIS guruhi</th>
                                                <th className="px-3 py-2 text-left font-bold">Holat</th>
                                                <th className="px-3 py-2 text-left font-bold">Bizdagi guruh</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {proposals.map((proposal) => {
                                                const chosen =
                                                    proposal.hemis_group_id in decisions
                                                        ? decisions[proposal.hemis_group_id]
                                                        : proposal.group_id;
                                                return (
                                                    <tr
                                                        key={proposal.hemis_group_id}
                                                        className="border-t border-border/50"
                                                    >
                                                        <td className="px-3 py-2">
                                                            <span className="font-medium">
                                                                {proposal.hemis_group_name}
                                                            </span>
                                                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                                <Users className="h-3 w-3" />
                                                                {proposal.student_count}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                                            {KIND_LABELS[proposal.kind]}
                                                            <span className="ml-1 opacity-70">
                                                                ({REASON_LABELS[proposal.reason]})
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {proposal.kind === 'auto' ||
                                                            proposal.kind === 'already' ? (
                                                                <span className="text-sm">
                                                                    {proposal.group_name}
                                                                </span>
                                                            ) : (
                                                                <div className="w-[260px]">
                                                                    <Combobox
                                                                        options={[
                                                                            { value: '', label: 'Bog‘lamaslik' },
                                                                            ...proposal.candidates.map((c) => ({
                                                                                value: String(c.group_id),
                                                                                label: c.name,
                                                                            })),
                                                                        ]}
                                                                        value={chosen ? String(chosen) : ''}
                                                                        onChange={(val) =>
                                                                            setDecisions((prev) => ({
                                                                                ...prev,
                                                                                [proposal.hemis_group_id]: val
                                                                                    ? Number(val)
                                                                                    : null,
                                                                            }))
                                                                        }
                                                                        placeholder="Guruhni tanlang"
                                                                    />
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    onClick={() => applyMatch.mutate()}
                                    disabled={applyMatch.isPending}
                                >
                                    {applyMatch.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Bog'lashni saqlash ({preview.auto_count} avtomatik
                                    {Object.keys(decisions).length > 0
                                        ? ` + ${Object.keys(decisions).length} qo'lda`
                                        : ''}
                                    )
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                    Talabalar importi keyingi qadamda — bu yerda faqat guruhlar bog'lanadi.
                                </span>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
