import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useScheduleSync } from '@/hooks/useHemisSchedule';
import type { ScheduleSyncResult } from '@/services/hemisScheduleService';
import { apiErrorMessage } from '@/utils/apiError';

const Stat = ({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) => (
    <div className="rounded-xl border border-border p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
);

/**
 * HEMIS dars jadvalini sinxronlash.
 *
 * Joriy o'quv yili to'liq o'qiladi (~191 sahifa, 4–5 daqiqa). Preview
 * bosqichi yo'q: jadval faqat o'qiladigan zerkalo, uni boshqa hech narsa
 * o'zgartirmaydi, yo'qolgan darslar esa o'chirilmaydi — nofaol qilinadi.
 *
 * Bitta to'siq bor: 10% dan ko'p dars bir martada yo'qolsa, bekend ularni
 * nofaol qilmaydi (HEMIS uzilishda xato emas, qisqa ro'yxat bilan 200
 * qaytaradi). Admin buni ko'radi va belgini qo'yib qayta ishga tushiradi.
 */
export const HemisScheduleSync = () => {
    const { t } = useTranslation();
    const sync = useScheduleSync();
    const [result, setResult] = useState<ScheduleSyncResult | null>(null);
    const [confirmBulk, setConfirmBulk] = useState(false);

    // Faqat 10% to'sig'i tasdiq bilan yechiladi; to'liq o'tilmagan prognoz
    // shunchaki keyingisiga qoldiriladi — u yerda belgi yordam bermaydi.
    const needsBulkConfirm = Boolean(result?.complete && result.deactivation_skipped);

    const run = () =>
        sync.mutate(confirmBulk, {
            onSuccess: (data) => {
                setResult(data);
                setConfirmBulk(false);
                toast.success(t('Jadval yangilandi: {{count}} ta dars', { count: data.saved }));
            },
            onError: (error: unknown) => {
                toast.error(apiErrorMessage(error, t("Jadvalni sinxronlab bo'lmadi")));
            },
        });

    return (
        <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4" />
                    {t('Dars jadvali')}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                    <Link to="/admin/hemis-schedule">
                        <Button variant="ghost" size="sm">
                            {t("Jadvalni ko'rish")}
                        </Button>
                    </Link>
                    <Button size="sm" onClick={run} disabled={sync.isPending}>
                        {sync.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        {t('Sinxronlash')}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    {t(
                        "Joriy o'quv yilining jadvali HEMIS'dan to'liq o'qiladi. Har kecha 03:00 da avtomatik ishlaydi. HEMIS'dan yo'qolgan darslar o'chirilmaydi — nofaol qilinadi.",
                    )}
                </p>

                {sync.isPending && (
                    <div className="flex items-center gap-2 rounded-xl bg-primary/5 p-3 text-sm text-primary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("Sinxronlanmoqda — bu 4–5 daqiqa davom etadi, sahifani yopmang")}
                    </div>
                )}

                {result && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <Stat label={t('Saqlandi')} value={`${result.saved} / ${result.hemis_total}`} />
                            <Stat label={t('Nofaol qilindi')} value={result.deactivated} />
                            <Stat
                                label={t("HEMIS raqamisiz o'qituvchi")}
                                value={result.without_employee_number}
                                tone={result.without_employee_number ? 'text-warning' : ''}
                            />
                            <Stat label={t("O'quv yili")} value={result.education_years.join(', ') || '—'} />
                        </div>

                        {result.deactivation_skipped ? (
                            <div className="flex gap-2 rounded-xl border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{result.deactivation_skipped}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 p-3 text-sm text-success">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                {t("To'liq o'tildi, jadval HEMIS bilan mos")}
                            </div>
                        )}

                        {needsBulkConfirm && (
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm hover:bg-accent/40">
                                <input
                                    type="checkbox"
                                    checked={confirmBulk}
                                    onChange={(e) => setConfirmBulk(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0"
                                />
                                <span>
                                    <span className="font-semibold">
                                        {t("Ko'p darsni nofaol qilishni tasdiqlayman")}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {t(
                                            "HEMIS'da jadval haqiqatan qisqargan bo'lsa belgilang va qayta sinxronlang. Uzilish bo'lsa — keyinroq qayta urinib ko'ring.",
                                        )}
                                    </span>
                                </span>
                            </label>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
