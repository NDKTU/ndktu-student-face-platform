import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { hemisService, type StudentSyncPreview } from '@/services/hemisService';

/**
 * Talabalarni HEMIS'dan import qilish.
 *
 * Avval preview — bazaga hech narsa yozmaydi va raqamlarni ko'rsatadi; keyin
 * apply. Ommaviy yaratish alohida belgi bilan tasdiqlanadi: birinchi
 * to'ldirish ming-minglab yozuv degani va u tasodifan bosilmasligi kerak.
 */
export const HemisStudentImport = () => {
    const queryClient = useQueryClient();
    const [preview, setPreview] = useState<StudentSyncPreview | null>(null);
    const [confirmBulk, setConfirmBulk] = useState(false);

    const runPreview = useMutation({
        mutationFn: () => hemisService.previewStudents(),
        onSuccess: (data) => {
            setPreview(data);
            setConfirmBulk(false);
        },
        onError: () => toast.error("Ma'lumotni o'qib bo'lmadi — token yoki bog'lanishni tekshiring"),
    });

    const runApply = useMutation({
        mutationFn: () =>
            hemisService.applyStudents({ incremental: false, allow_bulk_create: confirmBulk }),
        onSuccess: (result) => {
            toast.success(
                `Import tugadi: ${result.created} yaratildi, ${result.updated} yangilandi`
            );
            queryClient.invalidateQueries({ queryKey: ['students'] });
            void runPreview.mutateAsync();
        },
        onError: (error: unknown) => {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data
                ?.detail;
            toast.error(detail || "Importni bajarib bo'lmadi");
        },
    });

    const blocked = Boolean(preview?.needs_bulk_confirm && !confirmBulk);

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
                    onClick={() => runPreview.mutate()}
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
                            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
                                Yaratiladi: {preview.create_count}
                            </span>
                            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-700 dark:text-sky-400">
                                Yangilanadi: {preview.update_count}
                            </span>
                            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                                Guruhsiz qoladi: {preview.no_group_count}
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

                        {preview.no_group_count > 0 && (
                            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    {preview.no_group_count} ta talabaning guruhi hali bog'lanmagan —
                                    ular guruhsiz import bo'ladi. Yuqoridagi «Guruhlarni bog'lash»
                                    bo'limini oldin tugatgan ma'qul.
                                </span>
                            </div>
                        )}

                        {preview.needs_bulk_confirm && (
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

                        <Button onClick={() => runApply.mutate()} disabled={blocked || runApply.isPending}>
                            {runApply.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="mr-2 h-4 w-4" />
                            )}
                            Import qilish
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
