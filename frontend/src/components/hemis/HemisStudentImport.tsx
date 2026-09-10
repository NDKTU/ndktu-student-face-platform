import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
    hemisService,
    type StudentSyncPreview,
    type StudentSyncResult,
    type StudentSyncSelection,
} from '@/services/hemisService';

/** Sukut bo'yicha hammasi tanlangan: odatiy import aynan shunday. */
const ALL_SELECTED: StudentSyncSelection = {
    include_create: true,
    include_update: true,
    include_no_group: true,
};

/**
 * Bitta toifa uchun tanlov qatori.
 *
 * Nol bo'lganda ham ko'rsatiladi, lekin o'chirilgan holatda: «guruhsiz 0 ta»
 * — bu foydali xabar, ro'yxatdan qator yo'qolib qolgani esa admin nimadir
 * o'tkazib yuborgandek taassurot qoldirardi.
 */
const CategoryRow = ({
    label,
    hint,
    count,
    checked,
    onChange,
    tone,
}: {
    label: string;
    hint: string;
    count: number;
    checked: boolean;
    onChange: (value: boolean) => void;
    tone: string;
}) => (
    <label
        className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
            count === 0 ? 'opacity-60' : 'cursor-pointer hover:bg-accent/40'
        }`}
    >
        <input
            type="checkbox"
            checked={checked}
            disabled={count === 0}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
                    {count} ta
                </span>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        </span>
    </label>
);

/**
 * Talabalarni HEMIS'dan import qilish.
 *
 * Avval preview — bazaga hech narsa yozmaydi va nima o'zgarishini ko'rsatadi;
 * keyin apply. Admin uchta toifadan qaysi birini import qilishni o'zi
 * tanlaydi: yangilar, yangilanadiganlar va guruhsizlar.
 *
 * Toifalar kesishadi — guruhsiz talaba ayni paytda yangi yoki yangilanadigan
 * ham bo'ladi. Shuning uchun «guruhsiz» belgisi olib tashlansa, backend
 * ularni qolgan ikkala ro'yxatdan ham chiqaradi.
 */
export const HemisStudentImport = () => {
    const queryClient = useQueryClient();
    const [preview, setPreview] = useState<StudentSyncPreview | null>(null);
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [selection, setSelection] = useState<StudentSyncSelection>(ALL_SELECTED);
    const [result, setResult] = useState<StudentSyncResult | null>(null);

    const runPreview = useMutation({
        mutationFn: () => hemisService.previewStudents(),
        // Natijani bu yerda tozalamaymiz: import tugagach preview o'zi
        // qayta o'qiladi, va tozalasak admin hisobotni ko'rishga ulgurmasdi.
        // «Tekshirish» tugmasi uni alohida tozalaydi.
        onSuccess: (data) => {
            setPreview(data);
            setConfirmBulk(false);
            // Bo'sh toifaning belgisi hech narsani anglatmaydi va «tanlangan»
            // sonini chalg'itardi, shuning uchun uni o'chirib qo'yamiz.
            setSelection({
                include_create: data.create_count > 0,
                include_update: data.update_count > 0,
                include_no_group: data.no_group_count > 0,
            });
        },
        onError: () => toast.error("Ma'lumotni o'qib bo'lmadi — token yoki bog'lanishni tekshiring"),
    });

    const runApply = useMutation({
        mutationFn: () =>
            hemisService.applyStudents({
                incremental: false,
                allow_bulk_create: confirmBulk,
                ...selection,
            }),
        onSuccess: (data) => {
            setResult(data);
            toast.success(`Import tugadi: ${data.created} yaratildi, ${data.updated} yangilandi`);
            queryClient.invalidateQueries({ queryKey: ['students'] });
            // Preview endi eskirgan: qayta o'qib, yangi holatni ko'rsatamiz.
            void runPreview.mutateAsync();
        },
        onError: (error: unknown) => {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data
                ?.detail;
            toast.error(detail || "Importni bajarib bo'lmadi");
        },
    });

    const toggle = (key: keyof StudentSyncSelection) => (value: boolean) =>
        setSelection((prev) => ({ ...prev, [key]: value }));

    /**
     * Nechta talaba haqiqatan tegiladi.
     *
     * Guruhsizlar alohida toifa emas — ular yangi va yangilanadiganlarning
     * ichida turadi, shuning uchun belgisi olib tashlanganda ularni ayiramiz,
     * qo'shmaymiz. Aks holda son haqiqatdan katta chiqardi.
     */
    const selectedCount = (() => {
        if (!preview) return 0;
        let total = 0;
        if (selection.include_create) total += preview.create_count;
        if (selection.include_update) total += preview.update_count;
        if (!selection.include_no_group) total -= preview.no_group_count;
        return Math.max(0, total);
    })();

    const nothingSelected = !selection.include_create && !selection.include_update;
    const blocked =
        Boolean(preview?.needs_bulk_confirm && selection.include_create && !confirmBulk) ||
        nothingSelected ||
        selectedCount === 0;

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" />
                    Talabalar importi
                </CardTitle>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setResult(null);
                        runPreview.mutate();
                    }}
                    disabled={runPreview.isPending}
                >
                    {runPreview.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Tekshirish
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {!preview && !runPreview.isPending && (
                    <p className="text-sm text-muted-foreground">
                        «Tekshirish» HEMIS'dagi barcha faol talabalarni o'qib, nima o'zgarishini
                        ko'rsatadi. Bazaga hech narsa yozilmaydi. Avval guruhlarni bog'lang —
                        aks holda talabalar guruhsiz qoladi.
                    </p>
                )}

                {runPreview.isPending && (
                    <p className="text-sm text-muted-foreground">HEMIS o'qilmoqda (~1 daqiqa)…</p>
                )}

                {preview && (
                    <>
                        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                            <span className="rounded-full bg-muted px-2.5 py-1">
                                HEMIS'da faol: {preview.hemis_total}
                            </span>
                            <span className="rounded-full bg-muted px-2.5 py-1">
                                Bog'langan guruhlar: {preview.linked_groups}
                            </span>
                        </div>

                        {preview.missing_locally > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Bizda bor, HEMIS faollarida yo'q: {preview.missing_locally} ta
                                {preview.missing_examples.length > 0 && (
                                    <> (masalan {preview.missing_examples.slice(0, 5).join(', ')})</>
                                )}
                                . Hech kim o'chirilmaydi va bloklanmaydi — bu faqat ro'yxat.
                            </p>
                        )}

                        {/* ── Toifalar: nima import qilinsin ─────────────── */}
                        <div className="space-y-2">
                            <p className="text-sm font-medium">Nima import qilinsin?</p>

                            <CategoryRow
                                label="Yangi talabalar"
                                hint="Bazamizda yo'q — yangi yozuv sifatida yaratiladi."
                                count={preview.create_count}
                                checked={selection.include_create}
                                onChange={toggle('include_create')}
                                tone="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            />

                            <CategoryRow
                                label="Yangilanadigan talabalar"
                                hint="Bazamizda bor, HEMIS'dagi ma'lumoti o'zgargan. HEMIS ID orqali topiladi — dublikat yaratilmaydi."
                                count={preview.update_count}
                                checked={selection.include_update}
                                onChange={toggle('include_update')}
                                tone="bg-sky-500/15 text-sky-700 dark:text-sky-400"
                            />

                            <CategoryRow
                                label="Guruhsiz talabalar"
                                hint="Guruhi hali bog'lanmagan — guruhsiz import bo'ladi. Belgi olib tashlansa, ular yuqoridagi ikkala toifadan ham chiqariladi."
                                count={preview.no_group_count}
                                checked={selection.include_no_group}
                                onChange={toggle('include_no_group')}
                                tone="bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            />
                        </div>

                        {preview.no_group_count > 0 && selection.include_no_group && (
                            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    {preview.no_group_count} ta talabaning guruhi hali bog'lanmagan —
                                    ular guruhsiz import bo'ladi. Yuqoridagi «Guruhlarni bog'lash»
                                    bo'limini oldin tugatgan ma'qul.
                                </span>
                            </div>
                        )}

                        {preview.needs_bulk_confirm && selection.include_create && (
                            <label className="flex items-start gap-2 rounded-xl border border-border/60 p-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={confirmBulk}
                                    onChange={(e) => setConfirmBulk(e.target.checked)}
                                    className="mt-0.5"
                                />
                                <span>
                                    <span className="font-semibold">
                                        {preview.create_count} ta yangi talaba yaratilishini tasdiqlayman
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        Ommaviy yaratish ataylab qo'sh tasdiq talab qiladi: birinchi
                                        to'ldirish minglab yozuv degani.
                                    </span>
                                </span>
                            </label>
                        )}

                        {/* ── Yakuniy hisob va tugma ─────────────────────── */}
                        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                            <Button
                                onClick={() => runApply.mutate()}
                                disabled={blocked || runApply.isPending}
                            >
                                {runApply.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                Import qilish
                            </Button>

                            <span className="text-sm text-muted-foreground">
                                {nothingSelected ? (
                                    <span className="text-amber-700 dark:text-amber-400">
                                        Hech bo'lmasa bitta toifa tanlanishi kerak.
                                    </span>
                                ) : (
                                    <>
                                        Tanlangan: <span className="font-semibold text-foreground">
                                            {selectedCount} ta talaba
                                        </span>
                                    </>
                                )}
                            </span>
                        </div>

                        {runApply.isPending && (
                            <p className="text-sm text-muted-foreground">
                                Import ketmoqda… Minglab yozuv uchun bu bir necha daqiqa oladi.
                            </p>
                        )}

                        {result && (
                            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    Import tugadi: <span className="font-semibold">{result.created}</span>{' '}
                                    yaratildi ·{' '}
                                    <span className="font-semibold">{result.updated}</span> yangilandi
                                    {result.excluded > 0 && (
                                        <>
                                            {' '}
                                            · <span className="font-semibold">{result.excluded}</span>{' '}
                                            o'tkazib yuborildi (tanlanmagan)
                                        </>
                                    )}
                                    {result.skipped > 0 && (
                                        <>
                                            {' '}
                                            · <span className="font-semibold">{result.skipped}</span>{' '}
                                            yaroqsiz yozuv
                                        </>
                                    )}
                                </span>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};
