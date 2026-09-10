import { useState } from 'react';
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Loader2,
    RefreshCw,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { usePreviewEntity, useSyncEntity, useSyncWorkloads } from '@/hooks/useEduPlan';
import {
    ENTITY_DEPENDENCIES,
    ENTITY_LABEL,
    SYNC_ENTITIES,
    type EduPlanEntity,
    type EntitySyncResponse,
    type PreviewResponse,
    type WorkloadSyncResult,
} from '@/services/eduplanService';

/** Xato matni: API `detail` i, bo'lmasa istisno xabari. */
const errorText = (e: unknown) => {
    const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return (e as Error)?.message ?? "Noma'lum xatolik";
};

/** Bo'lim tugmasidagi matn: «Fakultetlarni sinxronlash». */
const buttonLabel = (entity: EduPlanEntity) => `${ENTITY_LABEL[entity]}ni sinxronlash`;

/**
 * Qo'llashdan oldingi ko'rib chiqish natijasi.
 *
 * Faqat ma'noli qatorlar: «o'zgarishsiz» ni ko'rsatish shovqin bo'lardi,
 * chunki takroriy prognda deyarli hamma satr shunday bo'ladi.
 */
const PreviewSummary = ({ preview, entity }: { preview: PreviewResponse; entity: EduPlanEntity }) => {
    const row = preview.summary.find((s) => s.entity === entity);
    if (!row) return null;

    const parts = [
        { label: 'yangi', value: row.create, tone: 'text-emerald-600 dark:text-emerald-400' },
        { label: "bog'lanadi", value: row.link, tone: 'text-blue-600 dark:text-blue-400' },
        { label: 'yangilanadi', value: row.update, tone: 'text-amber-600 dark:text-amber-400' },
        { label: 'nofaol bo‘ladi', value: row.deactivate, tone: 'text-muted-foreground' },
        { label: 'ikkilanish', value: row.conflict, tone: 'text-red-600 dark:text-red-400' },
    ].filter((p) => p.value > 0);

    return (
        <div className="mt-2 space-y-1 text-sm">
            <div className="text-muted-foreground">
                EPMOS'da {row.total_external} ta · o'zgarishsiz {row.unchanged} ta
            </div>
            {parts.length === 0 ? (
                <div className="text-muted-foreground">Hammasi joyida — o'zgarish yo'q.</div>
            ) : (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {parts.map((p) => (
                        <span key={p.label} className={p.tone}>
                            {p.label}: <span className="font-medium">{p.value}</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Sinxronlash tugagandan keyingi natija. */
const SyncResult = ({ result }: { result: EntitySyncResponse }) => {
    const parts = [
        { label: "qo'shildi", value: result.created },
        { label: "bog'landi", value: result.linked },
        { label: 'yangilandi', value: result.updated },
        { label: 'nofaol qilindi', value: result.deactivated },
        { label: "o'tkazib yuborildi", value: result.skipped },
    ].filter((p) => p.value > 0);

    return (
        <div className="mt-2 space-y-2 text-sm">
            <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                    {parts.length === 0
                        ? `Tayyor — o'zgarish bo'lmadi (EPMOS'da ${result.total_external} ta yozuv).`
                        : parts.map((p) => `${p.label}: ${p.value}`).join(' · ')}
                </div>
            </div>

            {result.requires_decision > 0 && (
                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                        {result.requires_decision} ta yozuv admin qarorini kutmoqda: nomi bo'yicha bir
                        nechta lokal yozuv mos keldi. Ularni quyidagi «Ziddiyatlar» bo'limida hal qiling.
                    </div>
                </div>
            )}

            {result.errors.length > 0 && (
                <div className="space-y-1">
                    {result.errors.slice(0, 5).map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-red-600 dark:text-red-400">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{err}</span>
                        </div>
                    ))}
                    {result.errors.length > 5 && (
                        <div className="text-muted-foreground">
                            …va yana {result.errors.length - 5} ta xatolik
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Bitta bo'limning kartasi: ko'rib chiqish, tasdiqlash, natija.
 *
 * Har bir karta o'z mutatsiyasiga ega — shuning uchun bo'lim komponenti,
 * bitta umumiy ro'yxat emas: `isPending` faqat bosilgan tugmada yonadi.
 */
const EntityCard = ({ entity, disabled }: { entity: EduPlanEntity; disabled: boolean }) => {
    const previewMutation = usePreviewEntity(entity);
    const syncMutation = useSyncEntity(entity);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [result, setResult] = useState<EntitySyncResponse | null>(null);

    const busy = previewMutation.isPending || syncMutation.isPending;
    const deps = ENTITY_DEPENDENCIES[entity];

    const runPreview = async () => {
        setResult(null);
        try {
            setPreview(await previewMutation.mutateAsync());
        } catch {
            setPreview(null);
        }
    };

    const runSync = async () => {
        try {
            const data = await syncMutation.mutateAsync(false);
            setResult(data);
            // Ko'rib chiqish endi eskirgan: u qo'llanguncha bo'lgan holatni
            // ko'rsatadi va ekranda qolsa chalg'itardi.
            setPreview(null);
        } catch {
            setResult(null);
        }
    };

    return (
        <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="font-medium">{ENTITY_LABEL[entity]}</div>
                    {deps.length > 0 && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <ArrowRight className="h-3 w-3" />
                            {deps.map((d) => ENTITY_LABEL[d]).join(', ')} allaqachon bog'langan bo'lishi kerak
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={runPreview} disabled={disabled || busy}>
                        {previewMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Ko'rish
                    </Button>
                    <Button size="sm" onClick={runSync} disabled={disabled || busy}>
                        {syncMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        {buttonLabel(entity)}
                    </Button>
                </div>
            </div>

            {syncMutation.isPending && (
                <div className="mt-2 text-sm text-muted-foreground">
                    EPMOS o'qilmoqda va o'zgarishlar qo'llanmoqda…
                </div>
            )}

            {previewMutation.isError && (
                <div className="mt-2 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Ko'rib chiqib bo'lmadi: {errorText(previewMutation.error)}</span>
                </div>
            )}
            {syncMutation.isError && (
                <div className="mt-2 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Sinxronlanmadi: {errorText(syncMutation.error)}</span>
                </div>
            )}

            {preview && !result && (
                <>
                    <PreviewSummary preview={preview} entity={entity} />
                    <div className="mt-2 text-xs text-muted-foreground">
                        Bu faqat ko'rsatuv — hech narsa yozilmadi. Qo'llash uchun «
                        {buttonLabel(entity)}» tugmasini bosing.
                    </div>
                </>
            )}

            {result && <SyncResult result={result} />}
        </div>
    );
};

/**
 * Yuklamalar kartasi.
 *
 * Ma'lumotnomalardan farqli: yuklama yangi satr yaratmaydi, faqat
 * allaqachon bog'langan o'qituvchi, fan va guruhlarni bir-biriga ulaydi.
 * Shuning uchun ikkilanish ham, ko'rib chiqish ham yo'q — bir bosishda
 * qo'llanadi, natijada esa nimasi bog'lanmagani ko'rsatiladi.
 */
const WorkloadCard = ({ disabled }: { disabled: boolean }) => {
    const mutation = useSyncWorkloads();
    const [result, setResult] = useState<WorkloadSyncResult | null>(null);

    const run = async () => {
        try {
            setResult(await mutation.mutateAsync());
        } catch {
            setResult(null);
        }
    };

    const unresolved = result
        ? result.unresolved_teacher + result.unresolved_subject + result.unresolved_group
        : 0;

    return (
        <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="font-medium">Yuklamalar</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        O'qituvchilar, Fanlar, Guruhlar allaqachon bog'langan bo'lishi kerak
                    </div>
                </div>
                <Button size="sm" onClick={run} disabled={disabled || mutation.isPending}>
                    {mutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Yuklamalarni sinxronlash
                </Button>
            </div>

            {mutation.isPending && (
                <div className="mt-2 text-sm text-muted-foreground">
                    Yuklama o'qilmoqda va biriktirmalar tuzilmoqda… Bu eng og'ir bo'lim:
                    27 000 dan ortiq qator o'qiladi, odatda 15–30 soniya oladi.
                </div>
            )}

            {mutation.isError && (
                <div className="mt-2 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Sinxronlanmadi: {errorText(mutation.error)}</span>
                </div>
            )}

            {result && (
                <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            {result.workloads_total} qatordan {result.assignments_resolved} biriktirma ·
                            qo'shildi: {result.created} · yangilandi: {result.updated} · nofaol qilindi:{' '}
                            {result.deactivated}
                        </div>
                    </div>
                    {unresolved > 0 && (
                        <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                {unresolved} qator bog'lanmadi: o'qituvchi {result.unresolved_teacher} ·
                                fan {result.unresolved_subject} · guruh {result.unresolved_group}. Avval
                                shu bo'limlarni sinxronlang.
                            </div>
                        </div>
                    )}

                    {result.workloads_without_teacher > 0 && (
                        <div className="text-muted-foreground">
                            {result.workloads_without_teacher} qatorda EPMOS'ning o'zida o'qituvchi hali
                            biriktirilmagan — ular o'tkazib yuborildi. Bu xato emas: o'qituvchi
                            tayinlangach, keyingi sinxronlashda o'zi qo'shiladi.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Sinxronlash menyusi: har bir bo'lim uchun alohida tugma.
 *
 * Bo'limlar bir-biriga bog'liq (kafedra fakultetsiz bog'lanmaydi), lekin
 * har birini alohida ishga tushirish mumkin: bog'liqlik qayta olib
 * kelinmaydi, allaqachon saqlangan ko'zgudan o'qiladi. Ota-ona bog'lanmagan
 * bo'lsa, satr aniq xato bilan o'tkazib yuboriladi — jimgina emas.
 *
 * Tartib yuqoridan pastga: fakultet → kafedra → mutaxassislik → guruh.
 * Birinchi marta shu tartibda bosib chiqish kerak, keyin istalganini
 * alohida yangilash mumkin.
 */
export const EntitySyncMenu = ({ disabled }: { disabled: boolean }) => (
    <Card>
        <CardHeader>
            <CardTitle className="text-base">Bo'limlar bo'yicha sinxronlash</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Har bir bo'lim mustaqil ishlaydi: bittasini sinxronlash qolganlarini qayta
                yuklamaydi. Hech narsa o'chirilmaydi — EPMOS'dan yo'qolgan yozuvlar nofaol deb
                belgilanadi, chunki ularga test natijalari va jurnallar bog'langan.
            </p>

            {/* Foydalanuvchi ko'radigan tartib: ma'lumotnomalar, keyin ular
                ustiga quriladigan yuklama, oxirida o'quv rejalar. */}
            {SYNC_ENTITIES.filter((e) => e !== 'curriculum').map((entity) => (
                <EntityCard key={entity} entity={entity} disabled={disabled} />
            ))}

            <WorkloadCard disabled={disabled} />

            <EntityCard entity="curriculum" disabled={disabled} />
        </CardContent>
    </Card>
);
