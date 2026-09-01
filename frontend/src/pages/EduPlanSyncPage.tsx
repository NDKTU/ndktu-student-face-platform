import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Link2,
    Loader2,
    PlusCircle,
    RefreshCw,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import {
    useClearEduPlanSettings,
    useEduPlanApply,
    useEduPlanPreview,
    useEduPlanRun,
    useInvalidateMirrored,
    useEduPlanSettings,
    useEduPlanStatus,
    useUpdateEduPlanSettings,
} from '@/hooks/useEduPlan';
import { KeyRound, Save, Trash2 } from 'lucide-react';
import {
    proposalKey,
    type ApplyResponse,
    type ApplyResult,
    type Decision,
    type EduPlanEntity,
    type PreviewResponse,
    type Proposal,
    eduplanService,
    type RunResponse,
    type RunState,
} from '@/services/eduplanService';

const ENTITY_LABEL: Record<EduPlanEntity, string> = {
    faculty: 'Fakultetlar',
    kafedra: 'Kafedralar',
    department: "Bo'limlar",
    speciality: 'Mutaxassisliklar',
    group: 'Guruhlar',
    subject: 'Fanlar',
    employee: 'Xodimlar',
};

/** Выбор администратора по конфликту: id локальной строки либо «создать новую». */
type ConflictChoice = number | 'create' | undefined;

/** Текст ошибки API для уведомлений: detail из ответа либо message исключения. */
const errorText = (e: unknown) => {
    const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return (e as Error)?.message ?? "Noma'lum xatolik";
};

const EduPlanSyncPage = () => {
    const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useEduPlanStatus();
    const runMutation = useEduPlanRun();
    const previewMutation = useEduPlanPreview();
    const applyMutation = useEduPlanApply();
    const invalidateMirrored = useInvalidateMirrored();

    const [runResult, setRunResult] = useState<RunResponse | null>(null);
    // Fon progni holati. Progn daqiqalar davom etadi, shuning uchun uni
    // soʻrovda kutmaymiz — boshlaymiz va shu yerdan kuzatamiz.
    const [runState, setRunState] = useState<RunState | null>(null);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
    const [applyDeactivations, setApplyDeactivations] = useState(false);
    const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);

    const conflicts = useMemo(
        () => preview?.proposals.filter((p) => p.action === 'conflict') ?? [],
        [preview],
    );
    const unresolved = conflicts.filter((p) => choices[proposalKey(p)] === undefined).length;

    /**
     * Синхронизация одним действием: справочники и нагрузка сразу. Однозначные
     * предложения применяются автоматически, конфликты — нет: связать группу
     * вслепую означает оторвать студентов и историю результатов от нужной строки.
     *
     * Если конфликты остались, догружаем свежий предпросмотр — только он содержит
     * сами конфликты и кандидатов. Повторно применять `run_id` прогона нельзя:
     * предложения в нём заморожены и продублировали бы уже созданные строки.
     */
    const runSync = async () => {
        setApplyResult(null);
        setPreview(null);
        setChoices({});
        setRunResult(null);

        // Javob — natija emas, boshlangʻich holat. Natijani kuzatuvchi oladi.
        setRunState(await runMutation.mutateAsync());
    };

    /** Progn tugagach: keshni yangilash va ziddiyatlar boʻlsa ularni yuklash. */
    const finishRun = async (summary: RunResponse) => {
        setRunResult(summary);
        invalidateMirrored();
        if (summary.requires_decision > 0) {
            setPreview(await previewMutation.mutateAsync());
        }
    };

    // Sahifa ochilganda: progn ketayotgan boʻlsa unga ulanamiz, tugagan
    // boʻlsa natijasini koʻrsatamiz. Admin sahifani yopib ketgan boʻlsa ham
    // qaytganda nima boʻlganini koʻradi.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const state = await eduplanService.runState().catch(() => null);
            if (cancelled || !state) return;
            setRunState(state);
            if (state.status === 'done' && state.summary) void finishRun(state.summary);
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Progn ketayotganda holatni soʻrab turamiz.
    useEffect(() => {
        if (runState?.status !== 'running') return;

        const timer = setInterval(async () => {
            const state = await eduplanService.runState().catch(() => null);
            if (!state) return;
            setRunState(state);

            if (state.status === 'done' && state.summary) {
                void finishRun(state.summary);
            } else if (state.status === 'failed') {
                toast.error(state.error ?? 'Sinxronizatsiya xato bilan tugadi');
            }
        }, 3000);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runState?.status]);

    const runApply = async () => {
        if (!preview) return;

        // В решения попадают только разобранные конфликты. Остальное прогон уже применил.
        const decisions: Decision[] = conflicts
            .filter((p) => choices[proposalKey(p)] !== undefined)
            .map((p) => {
                const choice = choices[proposalKey(p)];
                return choice === 'create'
                    ? { key: proposalKey(p), action: 'create' as const }
                    : { key: proposalKey(p), action: 'link' as const, local_id: choice as number };
            });

        const result = await applyMutation.mutateAsync({
            run_id: preview.run_id,
            decisions,
            apply_deactivations: applyDeactivations,
        });
        setApplyResult(result);
        setPreview(null);
    };

    // Tugma progn tugagunicha bloklanadi — brauzer kutmaydi, lekin ikkinchi
    // marta bosish 409 beradi va bu foydalanuvchini chalkashtiradi.
    const syncing =
        runMutation.isPending || previewMutation.isPending || runState?.status === 'running';

    return (
        <div className="space-y-6 p-6">
            <PageHeader
                title="EduPlan bilan sinxronizatsiya"
                description="Tashkiliy tuzilmani bir tomonlama import qilish. EduPlan tizimiga hech narsa yozilmaydi."
            />

            <ConnectionSettingsCard />

            {/* ── 1-qadam: состояние подключения и запуск ───────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <StepBadge n={1} />
                        Ulanish va ishga tushirish
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {statusLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Ulanish tekshirilmoqda…
                        </div>
                    ) : !status?.configured ? (
                        <Notice tone="warning" icon={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}>
                            <div className="font-medium">Integratsiya sozlanmagan</div>
                            <div>{status?.detail}</div>
                        </Notice>
                    ) : !status.reachable ? (
                        <Notice tone="destructive" icon={<XCircle className="mt-0.5 h-4 w-4 shrink-0" />}>
                            <div className="font-medium">EduPlan bilan aloqa yo'q</div>
                            <div>{status.detail}</div>
                        </Notice>
                    ) : (
                        <Notice tone="success" icon={<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}>
                            <div className="font-medium">EduPlan javob bermoqda</div>
                            <div>
                                {status.base_url}
                                {status.active_academic_year
                                    ? ` · joriy o'quv yili: ${status.active_academic_year.name}`
                                    : " · joriy o'quv yili belgilanmagan"}
                            </div>
                        </Notice>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={runSync} disabled={!status?.reachable || syncing}>
                            {syncing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            EduPlan bilan sinxronlash
                        </Button>
                        <Button variant="outline" onClick={() => refetchStatus()} disabled={syncing}>
                            Ulanishni tekshirish
                        </Button>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        Ma'lumotnomalar va o'qituvchilar yuklamasi bir amalda ko'chiriladi. Hech narsa
                        o'chirilmaydi: EduPlan'dan yo'qolgan yozuvlar joyida qoladi, chunki fakultetlar,
                        guruhlar va fanlarga test natijalari bog'langan.
                    </p>

                    {syncing && (
                        <div className="text-sm text-muted-foreground">
                            {runState?.status === 'running'
                                ? "Sinxronizatsiya ketmoqda: EduPlan o'qilmoqda va bir ma'noli o'zgarishlar qo'llanmoqda. Bu bir necha daqiqa davom etadi — sahifani yopsangiz ham progn to'xtamaydi."
                                : "Ziddiyatlar ro'yxati tayyorlanmoqda…"}
                        </div>
                    )}

                    {runMutation.isError && (
                        <Notice tone="destructive">{errorText(runMutation.error)}</Notice>
                    )}
                    {runState?.status === 'failed' && runState.error && (
                        <Notice tone="destructive">{runState.error}</Notice>
                    )}
                    {previewMutation.isError && (
                        <Notice tone="warning">
                            Sinxronizatsiya o'tdi, lekin ziddiyatlar ro'yxatini yuklab bo'lmadi:{' '}
                            {errorText(previewMutation.error)}
                        </Notice>
                    )}
                </CardContent>
            </Card>

            {/* ── 2-qadam: итог прогона ─────────────────────────────── */}
            {runResult && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <StepBadge n={2} />
                            Nima ko'chirildi
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <DirectoriesTable rows={runResult.directories} />

                        {runResult.requires_decision > 0 ? (
                            <Notice tone="warning" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}>
                                Administrator qarorini kutayotgan yozuvlar: {runResult.requires_decision} ta.
                                Ular bog'lanmadi — nomi bo'yicha bir nechta lokal yozuv mos keldi, tanlovni
                                tizim o'zi qila olmaydi.
                            </Notice>
                        ) : (
                            <Notice tone="success" icon={<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}>
                                Hammasi bir ma'noli, administrator qarori talab qilinmaydi.
                            </Notice>
                        )}

                        <div>
                            <div className="mb-2 text-sm font-medium">O'qituvchilar yuklamasi</div>
                            {runResult.workloads ? (
                                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                                    <Stat label="Yuklama qatorlari" value={runResult.workloads.workloads_total} />
                                    <Stat label="Biriktirishlar" value={runResult.workloads.assignments_resolved} />
                                    <Stat label="Yaratildi" value={runResult.workloads.created} />
                                    <Stat label="Yangilandi" value={runResult.workloads.updated} />
                                    <Stat label="Nofaol qilindi" value={runResult.workloads.deactivated} />
                                    <Stat
                                        label="Potoklardan yoyildi"
                                        value={runResult.workloads.stream_expanded}
                                    />
                                    <Stat
                                        label="O'qituvchisi topilmadi"
                                        value={runResult.workloads.unresolved_teacher}
                                        muted
                                    />
                                    <Stat
                                        label="Guruhi topilmadi"
                                        value={runResult.workloads.unresolved_group}
                                        muted
                                    />
                                </div>
                            ) : (
                                <Notice tone="warning">
                                    Yuklama ko'chirilmadi: {runResult.workloads_error ?? "sababi noma'lum"}.
                                    Ma'lumotnomalar esa sinxronlangan.
                                </Notice>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── 3-qadam: разбор конфликтов ────────────────────────── */}
            {conflicts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <StepBadge n={3} />
                            Qaror kutilmoqda: {conflicts.length} tadan {unresolved} ta
                            <span className="badge badge-warning">Ziddiyat</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Har bir EduPlan yozuvi uchun uni qaysi lokal yozuvga bog'lashni tanlang yoki
                            yangisini yarating. Hal qilinmaganlari o'tkazib yuboriladi — ularga keyingi
                            sinxronizatsiyadan so'ng qaytish mumkin.
                        </p>

                        {conflicts.map((p: Proposal) => {
                            const key = proposalKey(p);
                            return (
                                <div key={key} className="rounded-md border border-border p-3">
                                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                                        <AlertTriangle className="h-4 w-4 text-warning" />
                                        <span className="font-medium">{p.external_name}</span>
                                        <span className="text-muted-foreground">
                                            · {ENTITY_LABEL[p.entity]} · EduPlan #{p.external_id}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {p.candidates.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() =>
                                                    setChoices((prev) => ({ ...prev, [key]: c.id }))
                                                }
                                                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                                                    choices[key] === c.id
                                                        ? 'border-primary bg-primary/10 text-primary'
                                                        : 'border-border hover:bg-muted/50'
                                                }`}
                                            >
                                                <Link2 className="mr-1 inline h-3.5 w-3.5" />
                                                {c.name} (#{c.id})
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setChoices((prev) => ({ ...prev, [key]: 'create' }))
                                            }
                                            className={`rounded-md border px-3 py-1.5 text-sm transition ${
                                                choices[key] === 'create'
                                                    ? 'border-success bg-success/10 text-success'
                                                    : 'border-border hover:bg-muted/50'
                                            }`}
                                        >
                                            <PlusCircle className="mr-1 inline h-3.5 w-3.5" />
                                            Yangisini yaratish
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        <label className="flex items-start gap-2 border-t border-border pt-3 text-sm">
                            <input
                                type="checkbox"
                                className="mt-1 accent-primary"
                                checked={applyDeactivations}
                                onChange={(e) => setApplyDeactivations(e.target.checked)}
                            />
                            <span>
                                EduPlan'dan yo'qolgan yozuvlar ham nofaol deb belgilansin.
                                <span className="block text-muted-foreground">
                                    Hech narsa o'chirilmaydi: fakultetlar, guruhlar va fanlarga test
                                    natijalari bog'langan.
                                </span>
                            </span>
                        </label>

                        <Button onClick={runApply} disabled={applyMutation.isPending}>
                            {applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Qarorlarni qo'llash
                        </Button>

                        {applyMutation.isError && (
                            <Notice tone="destructive">{errorText(applyMutation.error)}</Notice>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── 4-qadam: результат разбора конфликтов ─────────────── */}
            {applyResult && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <StepBadge n={4} />
                            Qarorlar qo'llandi
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <DirectoriesTable rows={applyResult.results} />

                        {applyResult.results.some((r) => r.errors.length > 0) && (
                            <Notice tone="warning">
                                <div className="mb-1 font-medium">Qo'llanmadi:</div>
                                <ul className="list-inside list-disc space-y-0.5">
                                    {applyResult.results.flatMap((r) =>
                                        r.errors.map((err, i) => (
                                            <li key={`${r.entity}-${i}`}>
                                                {ENTITY_LABEL[r.entity]}: {err}
                                            </li>
                                        )),
                                    )}
                                </ul>
                            </Notice>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

/** Номер шага в заголовке карточки — вместо полноценного степпера. */
const StepBadge = ({ n }: { n: number }) => (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
    </span>
);

/** Цветная плашка-уведомление на семантических токенах. */
const Notice = ({
    tone,
    icon,
    children,
}: {
    tone: 'success' | 'warning' | 'destructive';
    icon?: ReactNode;
    children: ReactNode;
}) => {
    const tones: Record<'success' | 'warning' | 'destructive', string> = {
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        destructive: 'bg-destructive/10 text-destructive',
    };
    return (
        <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${tones[tone]}`}>
            {icon}
            <div className="min-w-0">{children}</div>
        </div>
    );
};

/** Счётчик в таблице: бейдж по типу предложения, тире при нуле. */
const CountBadge = ({
    value,
    tone,
}: {
    value: number;
    tone: 'success' | 'primary' | 'warning' | 'destructive' | 'muted';
}) => {
    const tones: Record<typeof tone, string> = {
        success: 'badge-success',
        primary: 'badge-primary',
        warning: 'badge-warning',
        destructive: 'badge-destructive',
        muted: 'badge-muted',
    };
    return value ? (
        <span className={`badge ${tones[tone]}`}>{value}</span>
    ) : (
        <span className="text-muted-foreground">—</span>
    );
};

const DirectoriesTable = ({ rows }: { rows: ApplyResult[] }) => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Ma'lumotnoma</TableHead>
                    <TableHead>Yaratildi</TableHead>
                    <TableHead>Bog'landi</TableHead>
                    <TableHead>Yangilandi</TableHead>
                    <TableHead>Nofaol qilindi</TableHead>
                    <TableHead>O'tkazib yuborildi</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((r) => (
                    <TableRow key={r.entity}>
                        <TableCell className="font-medium">{ENTITY_LABEL[r.entity]}</TableCell>
                        <TableCell><CountBadge value={r.created} tone="success" /></TableCell>
                        <TableCell><CountBadge value={r.linked} tone="primary" /></TableCell>
                        <TableCell><CountBadge value={r.updated} tone="muted" /></TableCell>
                        <TableCell><CountBadge value={r.deactivated} tone="destructive" /></TableCell>
                        <TableCell><CountBadge value={r.skipped} tone="warning" /></TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);

const Stat = ({ label, value, muted }: { label: string; value: number; muted?: boolean }) => (
    <div className={`rounded-md border border-border p-2 ${muted ? 'text-muted-foreground' : ''}`}>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
    </div>
);

/** Форма учётных данных сервисного аккаунта: пароль EduPlan меняется часто,
 *  и админ вводит его здесь, а не в .env на сервере. */
const ConnectionSettingsCard = () => {
    const { data: saved, isLoading } = useEduPlanSettings();
    const updateMutation = useUpdateEduPlanSettings();
    const clearMutation = useClearEduPlanSettings();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [activeRole, setActiveRole] = useState('');
    const [baseUrl, setBaseUrl] = useState('');

    useEffect(() => {
        if (!saved) return;
        setUsername(saved.username ?? '');
        setActiveRole(saved.active_role ?? '');
        setBaseUrl(saved.base_url ?? '');
        setPassword('');
    }, [saved]);

    const needsPassword = !saved?.has_password || saved.source === 'env';

    const handleSave = () => {
        if (!username.trim()) {
            toast.error('Login kiritilishi shart');
            return;
        }
        if (needsPassword && !password) {
            toast.error('Parol kiritilishi shart');
            return;
        }
        updateMutation.mutate(
            {
                username: username.trim(),
                password: password || null,
                active_role: activeRole.trim(),
                base_url: baseUrl.trim() || null,
            },
            {
                onSuccess: () => {
                    toast.success("Ulanish ma'lumotlari saqlandi — ulanish qayta tekshirilmoqda");
                    setPassword('');
                },
                onError: (e) => toast.error(errorText(e)),
            }
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Ulanish sozlamalari
                    {saved && (
                        <span className={`badge ${saved.source === 'db' ? 'badge-primary' : 'badge-muted'}`}>
                            {saved.source === 'db' ? "Interfeysdan kiritilgan" : 'Server sozlamalaridan (.env)'}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    EduPlan servis akkauntining login va paroli. Parol o'zgarsa — shu yerda yangilang,
                    serverga kirish shart emas. Parol shifrlangan holda saqlanadi va qayta ko'rsatilmaydi.
                </p>
                {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Login"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="EduPlan foydalanuvchi nomi"
                            autoComplete="off"
                        />
                        <Input
                            label={saved?.has_password && saved.source === 'db' ? "Yangi parol (o'zgartirmaslik uchun bo'sh qoldiring)" : 'Parol'}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={saved?.has_password && saved.source === 'db' ? '••••••••' : 'EduPlan paroli'}
                            autoComplete="new-password"
                        />
                        <Input
                            label="Faol rol (X-Active-Role)"
                            value={activeRole}
                            onChange={(e) => setActiveRole(e.target.value)}
                            placeholder="masalan, admin"
                        />
                        <Input
                            label="EduPlan manzili"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="https://edu.plan.nsumt.uz/rest"
                        />
                    </div>
                )}
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSave} isLoading={updateMutation.isPending} disabled={isLoading}>
                        <Save className="mr-2 h-4 w-4" />
                        Saqlash va ulanishni tekshirish
                    </Button>
                    {saved?.source === 'db' && (
                        <Button
                            variant="outline"
                            className="text-destructive border-destructive hover:bg-destructive/10"
                            onClick={() =>
                                clearMutation.mutate(undefined, {
                                    onSuccess: () => toast.success("Saqlangan ma'lumotlar o'chirildi — server sozlamalari ishlatiladi"),
                                    onError: (e) => toast.error(errorText(e)),
                                })
                            }
                            isLoading={clearMutation.isPending}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Saqlanganni o'chirish
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default EduPlanSyncPage;
