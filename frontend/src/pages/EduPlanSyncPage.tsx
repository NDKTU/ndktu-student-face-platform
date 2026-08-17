import { useMemo, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Database,
    Link2,
    Loader2,
    PlusCircle,
    RefreshCw,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
    useEduPlanApply,
    useEduPlanPreview,
    useEduPlanStatus,
    useEduPlanWorkloadSync,
} from '@/hooks/useEduPlan';
import {
    proposalKey,
    type ApplyResponse,
    type Decision,
    type EduPlanEntity,
    type PreviewResponse,
    type Proposal,
    type WorkloadSyncResult,
} from '@/services/eduplanService';

const ENTITY_LABEL: Record<EduPlanEntity, string> = {
    faculty: 'Факультеты',
    kafedra: 'Кафедры',
    department: 'Отделы',
    speciality: 'Специальности',
    group: 'Группы',
    subject: 'Предметы',
    employee: 'Сотрудники',
};

/** Выбор администратора по конфликту: id локальной строки либо «создать новую». */
type ConflictChoice = number | 'create' | undefined;

const EduPlanSyncPage = () => {
    const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useEduPlanStatus();
    const previewMutation = useEduPlanPreview();
    const applyMutation = useEduPlanApply();
    const workloadMutation = useEduPlanWorkloadSync();

    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
    const [applyDeactivations, setApplyDeactivations] = useState(false);
    const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
    const [workloadResult, setWorkloadResult] = useState<WorkloadSyncResult | null>(null);

    const conflicts = useMemo(
        () => preview?.proposals.filter((p) => p.action === 'conflict') ?? [],
        [preview],
    );
    const unresolved = conflicts.filter((p) => choices[proposalKey(p)] === undefined).length;

    const runPreview = async () => {
        setApplyResult(null);
        setWorkloadResult(null);
        setChoices({});
        const data = await previewMutation.mutateAsync();
        setPreview(data);
    };

    const runApply = async () => {
        if (!preview) return;

        // В решения попадают только разобранные конфликты. Остальные
        // предложения бэкенд применяет сам: они однозначны.
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

    const runWorkloads = async () => {
        const result = await workloadMutation.mutateAsync(undefined);
        setWorkloadResult(result);
    };

    const errorText = (e: unknown) => {
        const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        if (typeof detail === 'string') return detail;
        return (e as Error)?.message ?? 'Неизвестная ошибка';
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-3">
                <Database className="h-6 w-6 text-[#242CBB]" />
                <div>
                    <h1 className="text-2xl font-semibold">Синхронизация с EduPlan</h1>
                    <p className="text-sm text-gray-500">
                        Односторонний импорт оргструктуры. Записи в EduPlan не производятся.
                    </p>
                </div>
            </div>

            {/* ── Состояние подключения ─────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Подключение</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {statusLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Проверяем доступ…
                        </div>
                    ) : !status?.configured ? (
                        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                <div className="font-medium">Интеграция не настроена</div>
                                <div>{status?.detail}</div>
                            </div>
                        </div>
                    ) : !status.reachable ? (
                        <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                <div className="font-medium">EduPlan недоступен</div>
                                <div>{status.detail}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                <div className="font-medium">EduPlan отвечает</div>
                                <div>
                                    {status.base_url}
                                    {status.active_academic_year
                                        ? ` · активный учебный год: ${status.active_academic_year.name}`
                                        : ' · активный учебный год не задан'}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => refetchStatus()}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Проверить снова
                        </Button>
                        <Button
                            onClick={runPreview}
                            disabled={!status?.reachable || previewMutation.isPending}
                        >
                            {previewMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Database className="mr-2 h-4 w-4" />
                            )}
                            Предпросмотр изменений
                        </Button>
                    </div>

                    {previewMutation.isError && (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                            {errorText(previewMutation.error)}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Сводка предпросмотра ──────────────────────────────── */}
            {preview && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Что изменится · снимок от{' '}
                            {new Date(preview.generated_at).toLocaleString('ru-RU')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="py-2 pr-4">Справочник</th>
                                        <th className="py-2 pr-4">В EduPlan</th>
                                        <th className="py-2 pr-4">Создать</th>
                                        <th className="py-2 pr-4">Связать</th>
                                        <th className="py-2 pr-4">Обновить</th>
                                        <th className="py-2 pr-4">Без изменений</th>
                                        <th className="py-2 pr-4">Конфликты</th>
                                        <th className="py-2">Пропали</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.summary.map((s) => (
                                        <tr key={s.entity} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-medium">{ENTITY_LABEL[s.entity]}</td>
                                            <td className="py-2 pr-4">{s.total_external}</td>
                                            <td className="py-2 pr-4 text-emerald-700">{s.create || '—'}</td>
                                            <td className="py-2 pr-4 text-blue-700">{s.link || '—'}</td>
                                            <td className="py-2 pr-4">{s.update || '—'}</td>
                                            <td className="py-2 pr-4 text-gray-400">{s.unchanged || '—'}</td>
                                            <td className="py-2 pr-4 text-amber-700">{s.conflict || '—'}</td>
                                            <td className="py-2 text-gray-500">{s.deactivate || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                            Однозначные предложения применяются автоматически. Разберите конфликты
                            ниже — связать вслепую нельзя, иначе студенты и история результатов
                            останутся привязаны не к той записи.
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Разбор конфликтов ─────────────────────────────────── */}
            {preview && conflicts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Требуют решения: {unresolved} из {conflicts.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {conflicts.map((p: Proposal) => {
                            const key = proposalKey(p);
                            return (
                                <div key={key} className="rounded-md border p-3">
                                    <div className="mb-2 flex items-center gap-2 text-sm">
                                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                                        <span className="font-medium">{p.external_name}</span>
                                        <span className="text-gray-400">
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
                                                        ? 'border-[#242CBB] bg-[#242CBB]/10 text-[#242CBB]'
                                                        : 'border-gray-200 hover:border-gray-300'
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
                                                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <PlusCircle className="mr-1 inline h-3.5 w-3.5" />
                                            Создать новую
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

            {/* ── Применение ────────────────────────────────────────── */}
            {preview && (
                <Card>
                    <CardContent className="space-y-3 pt-6">
                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={applyDeactivations}
                                onChange={(e) => setApplyDeactivations(e.target.checked)}
                            />
                            <span>
                                Помечать неактивными записи, пропавшие из EduPlan.
                                <span className="block text-gray-500">
                                    Ничего не удаляется: на факультетах, группах и предметах висят
                                    результаты тестов.
                                </span>
                            </span>
                        </label>

                        {unresolved > 0 && (
                            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                Неразобранные конфликты ({unresolved}) будут пропущены — их можно
                                разобрать в следующий раз.
                            </div>
                        )}

                        <Button onClick={runApply} disabled={applyMutation.isPending}>
                            {applyMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Применить
                        </Button>

                        {applyMutation.isError && (
                            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                                {errorText(applyMutation.error)}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── Результат применения ──────────────────────────────── */}
            {applyResult && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Результат</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="py-2 pr-4">Справочник</th>
                                        <th className="py-2 pr-4">Создано</th>
                                        <th className="py-2 pr-4">Связано</th>
                                        <th className="py-2 pr-4">Обновлено</th>
                                        <th className="py-2 pr-4">Деактивировано</th>
                                        <th className="py-2">Пропущено</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {applyResult.results.map((r) => (
                                        <tr key={r.entity} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-medium">{ENTITY_LABEL[r.entity]}</td>
                                            <td className="py-2 pr-4">{r.created}</td>
                                            <td className="py-2 pr-4">{r.linked}</td>
                                            <td className="py-2 pr-4">{r.updated}</td>
                                            <td className="py-2 pr-4">{r.deactivated}</td>
                                            <td className="py-2">{r.skipped}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {applyResult.results.some((r) => r.errors.length > 0) && (
                            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                                <div className="mb-1 font-medium">Не применено:</div>
                                <ul className="list-inside list-disc space-y-0.5">
                                    {applyResult.results.flatMap((r) =>
                                        r.errors.map((err, i) => (
                                            <li key={`${r.entity}-${i}`}>
                                                {ENTITY_LABEL[r.entity]}: {err}
                                            </li>
                                        )),
                                    )}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── Нагрузка ──────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Нагрузка преподавателей</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-gray-500">
                        Собирает связки преподаватель · предмет · группа из нагрузки активного
                        учебного года. Требует, чтобы преподаватели, предметы и группы уже были
                        связаны с EduPlan.
                    </p>
                    <Button
                        variant="outline"
                        onClick={runWorkloads}
                        disabled={!status?.reachable || workloadMutation.isPending}
                    >
                        {workloadMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Импортировать нагрузку
                    </Button>

                    {workloadMutation.isError && (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                            {errorText(workloadMutation.error)}
                        </div>
                    )}

                    {workloadResult && (
                        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            <Stat label="Строк нагрузки" value={workloadResult.workloads_total} />
                            <Stat label="Назначений" value={workloadResult.assignments_resolved} />
                            <Stat label="Создано" value={workloadResult.created} />
                            <Stat label="Обновлено" value={workloadResult.updated} />
                            <Stat label="Деактивировано" value={workloadResult.deactivated} />
                            <Stat label="Потоков развёрнуто" value={workloadResult.stream_expanded} />
                            <Stat
                                label="Без преподавателя"
                                value={workloadResult.unresolved_teacher}
                                muted
                            />
                            <Stat label="Без группы" value={workloadResult.unresolved_group} muted />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

const Stat = ({ label, value, muted }: { label: string; value: number; muted?: boolean }) => (
    <div className={`rounded-md border p-2 ${muted ? 'text-gray-500' : ''}`}>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
    </div>
);

export default EduPlanSyncPage;
