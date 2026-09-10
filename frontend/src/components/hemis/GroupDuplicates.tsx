import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { groupService } from '@/services/groupService';

const dateLabel = (value?: string | null) => (value ? value.slice(0, 10) : '—');

/**
 * Takrorlangan guruhlarni birlashtirish — talabalarni import qilishdan
 * oldingi qadam.
 *
 * EPOS guruhning `external_id` sini almashtirsa, zerkalo uni tanimay yangi
 * qator yaratadi va eskisi talabalari, kurslari, yuklamalari bilan yonida
 * qolaveradi. Shundan keyin guruhlarni bog'lash ekranida har bir nomga
 * ikkita bir xil nomzod chiqadi va bog'lash to'xtaydi.
 */
export const GroupDuplicates = () => {
    const queryClient = useQueryClient();
    const [confirming, setConfirming] = useState(false);

    const preview = useQuery({
        queryKey: ['group-duplicates'],
        queryFn: () => groupService.previewDuplicates(),
        refetchOnWindowFocus: false,
    });

    const merge = useMutation({
        mutationFn: () => groupService.mergeDuplicates(),
        onSuccess: (result) => {
            const moved = Object.entries(result.moved)
                .map(([table, count]) => `${table}: ${count}`)
                .join(', ');
            toast.success(
                `${result.clusters} ta to'da birlashtirildi, ${result.archived} qator arxivga o'tdi`
                + (moved ? ` — ko'chirildi: ${moved}` : ''),
            );
            setConfirming(false);
            queryClient.invalidateQueries({ queryKey: ['group-duplicates'] });
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            queryClient.invalidateQueries({ queryKey: ['hemis-group-match'] });
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.detail || 'Birlashtirishda xatolik');
        },
    });

    const data = preview.data;
    const summary = data?.summary;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Copy className="h-4 w-4 text-primary" />
                    Takrorlangan guruhlar
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    EPOS guruhga yangi identifikator bersa, sinxronizatsiya uni tanimay ikkinchi
                    nusxa yaratadi. Bunday nusxalar bo'lsa, guruhlarni HEMIS bilan bog'lash
                    ishlamaydi — har bir nomga ikkita bir xil nomzod chiqadi. Shuning uchun bu
                    qadam talabalarni import qilishdan oldin bajariladi.
                </p>

                {preview.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Tekshirilmoqda…
                    </div>
                ) : summary && summary.clusters === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        Takrorlangan guruh yo'q.
                    </div>
                ) : summary ? (
                    <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Stat label="To'dalar" value={summary.clusters} />
                            <Stat label="Arxivga tushadi" value={summary.to_archive} />
                            <Stat label="Ko'chadigan talaba" value={summary.students_to_move} />
                            <Stat label="Ko'chadigan kurs" value={summary.courses_to_move} />
                        </div>

                        <div className="max-h-[24rem] overflow-auto rounded-xl border border-border">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-muted/60 text-xs">
                                    <tr>
                                        <th className="p-2 text-left font-semibold">Guruh</th>
                                        <th className="p-2 text-left font-semibold">EPOS id</th>
                                        <th className="p-2 text-left font-semibold">Oxirgi sinxron</th>
                                        <th className="p-2 text-left font-semibold">Bog'langan yozuvlar</th>
                                        <th className="p-2 text-left font-semibold">Holat</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.clusters.map((cluster) =>
                                        [cluster.keep, ...cluster.merge].map((row) => (
                                            <tr key={row.group_id} className="border-t border-border/60">
                                                <td className="p-2">{row.name}</td>
                                                <td className="p-2 font-mono text-xs text-muted-foreground">
                                                    {row.external_id ?? '—'}
                                                </td>
                                                <td className="p-2 text-xs text-muted-foreground">
                                                    {dateLabel(row.synced_at)}
                                                </td>
                                                <td className="p-2 text-xs text-muted-foreground">
                                                    {`talaba ${row.students}, kurs ${row.courses}, yuklama ${row.workloads}`}
                                                </td>
                                                <td className="p-2">
                                                    <span
                                                        className={
                                                            row.keep
                                                                ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success'
                                                                : 'rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground'
                                                        }
                                                    >
                                                        {row.keep ? 'Qoladi' : 'Arxivga'}
                                                    </span>
                                                </td>
                                            </tr>
                                        )),
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
                            <div className="mb-2 flex items-center gap-2 font-medium">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Qaysi nusxa qoladi
                            </div>
                            <p className="text-muted-foreground">
                                Oxirgi sinxronizatsiya tekkani, ya'ni EPOS hali biladigan qator.
                                Ikkinchisi o'chirilmaydi — arxivga o'tadi, uning talabalari,
                                kurslari, yuklamalari, darslari va davomati esa qoladigan nusxaga
                                ko'chiriladi.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {confirming ? (
                                <>
                                    <Button
                                        variant="danger"
                                        onClick={() => merge.mutate()}
                                        disabled={merge.isPending}
                                    >
                                        {merge.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Ha, birlashtirilsin
                                    </Button>
                                    <Button variant="outline" onClick={() => setConfirming(false)}>
                                        Bekor qilish
                                    </Button>
                                </>
                            ) : (
                                <Button onClick={() => setConfirming(true)}>
                                    {summary.clusters} ta to'dani birlashtirish
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={() => preview.refetch()}
                                disabled={preview.isFetching}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Qayta tekshirish
                            </Button>
                        </div>
                    </>
                ) : null}
            </CardContent>
        </Card>
    );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="font-display text-lg font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
    </div>
);
