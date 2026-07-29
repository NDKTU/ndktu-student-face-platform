import { useState } from 'react';
import { useMyResults, useMethods, useDeleteResult } from '@/hooks/usePsychology';
import { useFaculties } from '@/hooks/useReferenceData';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/context/AuthContext';
import PermissionGate from '@/components/auth/PermissionGate';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Loader2, Brain, ClipboardList, Eye, Calendar, User as UserIcon, FilterX, Trash2 } from 'lucide-react';
import type { TestResultResponse } from '@/services/psychologyService';
import { DiagnosisCard } from '@/components/psychology/DiagnosisCard';
import { AnswerRow } from '@/components/psychology/AnswerRow';

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('uz-UZ', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

function ResultDetailModal({ result, onClose }: { result: TestResultResponse | null; onClose: () => void }) {
    if (!result) return null;
    const questions = result.method?.questions ?? [];
    const questionsById = new Map(questions.map(q => [q.id, q]));

    return (
        <Modal isOpen={!!result} onClose={onClose} title={`Natija #${result.id}`}>
            <div className="flex flex-col gap-4">
                {/* Meta */}
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Metod</p>
                            <p className="font-medium text-foreground">{result.method?.name ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Foydalanuvchi</p>
                            <p className="font-medium text-foreground">{result.user?.username ?? '—'}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Vaqt</p>
                            <p className="font-medium text-foreground">{formatDate(result.created_at)}</p>
                        </div>
                    </div>
                </div>

                {/* Diagnosis */}
                <DiagnosisCard diagnosis={result.diagnosis} />

                {/* Answers */}
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Javoblar ({result.answers.length})
                    </p>
                    <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                        {result.answers.map((a, i) => (
                            <AnswerRow
                                key={i}
                                index={i}
                                question={questionsById.get(a.question_id)}
                                value={a.value}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button variant="outline" onClick={onClose}>Yopish</Button>
                </div>
            </div>
        </Modal>
    );
}

export default function PsychologyResultsPage() {
    const [page, setPage] = useState(1);
    const [methodFilter, setMethodFilter] = useState<number | undefined>(undefined);
    const [facultyFilter, setFacultyFilter] = useState<string>('');
    const [groupFilter, setGroupFilter] = useState<string>('');
    const [selected, setSelected] = useState<TestResultResponse | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const deleteResult = useDeleteResult();
    const { hasPermission } = useAuth();

    const { data: methodsData } = useMethods(1, 100);
    const { data: facultiesData } = useFaculties(1, 100, undefined, hasPermission('read:faculty'));
    const { data: groupsData } = useGroups(
        1,
        100,
        '',
        undefined,
        facultyFilter ? Number(facultyFilter) : undefined,
        hasPermission('read:group'),
    );
    const facultyOptions = facultiesData?.faculties.map(f => ({ value: String(f.id), label: f.name })) ?? [];
    const groupOptions = groupsData?.groups.map(g => ({ value: String(g.id), label: g.name })) ?? [];

    const hasActiveFilter = !!(methodFilter || facultyFilter || groupFilter);

    const { data, isLoading, isError } = useMyResults({
        method_id: methodFilter,
        faculty_id: facultyFilter ? Number(facultyFilter) : undefined,
        group_id: groupFilter ? Number(groupFilter) : undefined,
        page,
    });

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <ClipboardList className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">Psixologik test natijalari</h1>
                        <p className="text-xs text-muted-foreground">Barcha foydalanuvchilarning topshirgan testlari</p>
                    </div>
                </div>
            </div>

            {/* Filter */}
            <Card className="mb-4">
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-muted-foreground">Metod:</label>
                        <select
                            value={methodFilter ?? ''}
                            onChange={e => { setMethodFilter(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
                            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="">Barchasi</option>
                            {methodsData?.methods.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <PermissionGate permission="read:faculty">
                        <div className="w-[200px]">
                            <Combobox
                                options={facultyOptions}
                                value={facultyFilter}
                                onChange={value => {
                                    setFacultyFilter(value);
                                    setGroupFilter('');
                                    setPage(1);
                                }}
                                placeholder="Barcha fakultetlar"
                            />
                        </div>
                    </PermissionGate>

                    <PermissionGate permission="read:group">
                        <div className="w-[200px]">
                            <Combobox
                                options={groupOptions}
                                value={groupFilter}
                                onChange={value => { setGroupFilter(value); setPage(1); }}
                                placeholder="Barcha guruhlar"
                            />
                        </div>
                    </PermissionGate>

                    {hasActiveFilter && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                setMethodFilter(undefined);
                                setFacultyFilter('');
                                setGroupFilter('');
                                setPage(1);
                            }}
                        >
                            <FilterX className="h-4 w-4" />
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* List */}
            <Card>
                <CardHeader className="pb-0">
                    <p className="text-sm text-muted-foreground">
                        Jami: <span className="font-medium text-foreground">{data?.total ?? 0}</span> ta natija
                    </p>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : isError ? (
                        <p className="py-8 text-center text-sm text-destructive">Xatolik yuz berdi</p>
                    ) : !data?.results.length ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center">
                            <Brain className="h-10 w-10 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">Hozircha natijalar yo'q</p>
                        </div>
                    ) : (
                        <>
                            <div className="mt-4 flex flex-col gap-2">
                                {data.results.map(r => (
                                    <div
                                        key={r.id}
                                        onClick={() => { if (deletingId !== null && deletingId !== r.id) setDeletingId(null); }}
                                        className="flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
                                    >
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                            <Brain className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-foreground truncate">{r.method?.name ?? 'Metod o\'chirilgan'}</p>
                                            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <UserIcon className="h-3 w-3" />
                                                    {r.user?.username ?? '—'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {formatDate(r.created_at)}
                                                </span>
                                                <span>{r.answers.length} javob</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => setSelected(r)}
                                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                                            >
                                                <Eye className="h-3.5 w-3.5" /> Ko'rish
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (deletingId === r.id) {
                                                        deleteResult.mutate(r.id, {
                                                            onSuccess: () => setDeletingId(null),
                                                        });
                                                    } else {
                                                        setDeletingId(r.id);
                                                    }
                                                }}
                                                className={`flex items-center justify-center rounded-lg p-1.5 transition-colors ${
                                                    deletingId === r.id
                                                        ? 'bg-destructive text-white'
                                                        : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                                                }`}
                                                title={deletingId === r.id ? "Tasdiqlash uchun bosing" : "O'chirish"}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {data.total > 20 && (
                                <div className="mt-4">
                                    <Pagination
                                        currentPage={page}
                                        totalPages={Math.ceil(data.total / 20)}
                                        onPageChange={setPage}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <ResultDetailModal result={selected} onClose={() => setSelected(null)} />
        </div>
    );
}
