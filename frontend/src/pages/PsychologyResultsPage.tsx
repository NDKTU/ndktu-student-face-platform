import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMyResults, useMethods, useDeleteResult, useResultFilterOptions } from '@/hooks/usePsychology';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { ClearFiltersButton } from '@/components/faculty/OrganizationToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Brain, Eye, Calendar, Trash2, Search, Users, Building2, IdCard } from 'lucide-react';
import type { TestResultResponse, TestResultUserInfo } from '@/services/psychologyService';
import { DiagnosisCard } from '@/components/psychology/DiagnosisCard';
import { AnswerRow } from '@/components/psychology/AnswerRow';
import { formatDateTime } from '@/utils/date';

/** 1..5 — bazadagi haqiqiy kurslar (`groups.course`). */
const COURSES = [1, 2, 3, 4, 5];

const GENDER_LABELS: Record<string, string> = { male: 'Erkak', female: 'Ayol' };

/** Ism yo'q bo'lsa (talaba bo'lmagan foydalanuvchi) — login. */
const displayName = (user?: TestResultUserInfo) => user?.full_name || user?.username || '—';

/** «KM-11 · 2-kurs · Kimyo fakulteti» — bo'sh qismlar tushib qoladi. */
const studyLine = (user?: TestResultUserInfo) =>
    [user?.group_name, user?.course ? `${user.course}-kurs` : null, user?.faculty_name].filter(Boolean).join(' · ');

function InfoField({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
    return (
        <div className={wide ? 'col-span-2' : undefined}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="break-words font-medium text-foreground">{value || '—'}</p>
        </div>
    );
}

function ResultDetailModal({
    result,
    onClose,
    showUser,
}: {
    result: TestResultResponse | null;
    onClose: () => void;
    /** Talaba o'z natijasini ko'radi — u haqidagi blok ortiqcha. */
    showUser: boolean;
}) {
    if (!result) return null;
    const questions = result.method?.questions ?? [];
    const questionsById = new Map(questions.map(q => [q.id, q]));
    const user = result.user;

    return (
        <Modal isOpen={!!result} onClose={onClose} title={`Natija #${result.id}`}>
            <div className="flex flex-col gap-4">
                {/* Kim topshirgan */}
                {showUser && <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {user?.is_student ? 'Talaba' : 'Foydalanuvchi'}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <InfoField label="F.I.Sh." value={displayName(user)} wide />
                        <InfoField label="Login" value={user?.username} />
                        {user?.is_student && (
                            <>
                                <InfoField label="Talaba ID" value={user.student_id_number} />
                                <InfoField label="Fakultet" value={user.faculty_name} wide />
                                <InfoField label="Yo'nalish" value={user.speciality} wide />
                                <InfoField label="Guruh" value={user.group_name} />
                                <InfoField label="Kurs" value={user.course ? `${user.course}-kurs` : null} />
                                <InfoField label="Ta'lim shakli" value={user.education_form} />
                                <InfoField label="Jinsi" value={user.gender ? GENDER_LABELS[user.gender] ?? user.gender : null} />
                                <InfoField label="Telefon" value={user.phone} wide />
                            </>
                        )}
                    </div>
                </div>}

                {/* Test */}
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <InfoField label="Metod" value={result.method?.name} />
                        <InfoField label="Vaqt" value={formatDateTime(result.created_at)} />
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
    const [pageSize, setPageSize] = useState(20);
    const [methodFilter, setMethodFilter] = useState<number | undefined>(undefined);
    const [facultyFilter, setFacultyFilter] = useState<string>('');
    const [courseFilter, setCourseFilter] = useState<string>('');
    const [groupFilter, setGroupFilter] = useState<string>('');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search.trim());
    const [selected, setSelected] = useState<TestResultResponse | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const deleteResult = useDeleteResult();
    const { activeRole, hasPermission } = useAuth();
    // Talaba ko'rinishi: bekend faqat o'z natijalarini beradi, tashkiliy
    // filtrlar va kim topshirgani esa unga kerak emas (filtr variantlari
    // talabaga yopiq ham).
    const isStudentView = activeRole?.name.toLowerCase() === 'student';
    const canDelete = !isStudentView && hasPermission('delete:psychology_results');

    const { data: methodsData } = useMethods(1, 100);
    // Fakultet va guruhlar natijalar endpointidan: umumiy ro'yxatlar
    // `read:faculty`/`read:group` talab qiladi va o'qituvchida bu ruxsat
    // bo'lmagani uchun filtr ko'rinmay qolardi.
    const { data: filterOptions } = useResultFilterOptions(!isStudentView);
    const facultyOptions = useMemo(
        () => (filterOptions?.faculties ?? []).map(f => ({ value: String(f.id), label: f.name })),
        [filterOptions],
    );
    const courseOptions = COURSES.map(c => ({ value: String(c), label: `${c}-kurs` }));
    const groupOptions = useMemo(
        () =>
            (filterOptions?.groups ?? [])
                .filter(g => !facultyFilter || g.faculty_id === Number(facultyFilter))
                .filter(g => !courseFilter || g.course === Number(courseFilter))
                .map(g => ({ value: String(g.id), label: g.name })),
        [filterOptions, facultyFilter, courseFilter],
    );

    const activeFilterCount =
        (methodFilter ? 1 : 0) + (facultyFilter ? 1 : 0) + (courseFilter ? 1 : 0) + (groupFilter ? 1 : 0)
        + (search.trim() ? 1 : 0);

    const { data, isLoading, isError, refetch } = useMyResults({
        method_id: methodFilter,
        faculty_id: facultyFilter ? Number(facultyFilter) : undefined,
        course: courseFilter ? Number(courseFilter) : undefined,
        group_id: groupFilter ? Number(groupFilter) : undefined,
        search: debouncedSearch || undefined,
        page,
        limit: pageSize,
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title={isStudentView ? 'Psixologik natijalarim' : 'Psixologik test natijalari'}
                description={
                    isStudentView
                        ? 'Siz topshirgan psixologik testlar va ularning natijalari'
                        : 'Barcha foydalanuvchilarning topshirgan testlari'
                }
            />

            {/* Filter */}
            <Card>
                <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center">
                    {!isStudentView && <Input
                        placeholder="F.I.Sh., login yoki talaba ID..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        leftAddon={<Search className="h-4 w-4" />}
                        className="sm:w-72"
                        aria-label="Talabani qidirish"
                    />}

                    <div className="flex items-center gap-2">
                        <label className="shrink-0 text-xs font-medium text-muted-foreground">Metod:</label>
                        <select
                            value={methodFilter ?? ''}
                            onChange={e => { setMethodFilter(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
                            className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
                        >
                            <option value="">Barchasi</option>
                            {methodsData?.methods.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    {!isStudentView && <>
                    <div className="w-full sm:w-[220px]">
                        <Combobox
                            options={facultyOptions}
                            value={facultyFilter}
                            onChange={value => {
                                setFacultyFilter(value);
                                setGroupFilter('');
                                setPage(1);
                            }}
                            placeholder="Barcha fakultetlar"
                            searchPlaceholder="Fakultetni qidirish..."
                        />
                    </div>

                    <div className="w-full sm:w-[140px]">
                        <Combobox
                            options={courseOptions}
                            value={courseFilter}
                            onChange={value => {
                                setCourseFilter(value);
                                setGroupFilter('');
                                setPage(1);
                            }}
                            placeholder="Barcha kurslar"
                        />
                    </div>

                    <div className="w-full sm:w-[180px]">
                        <Combobox
                            options={groupOptions}
                            value={groupFilter}
                            onChange={value => { setGroupFilter(value); setPage(1); }}
                            placeholder="Barcha guruhlar"
                            searchPlaceholder="Guruhni qidirish..."
                        />
                    </div>
                    </>}

                    <ClearFiltersButton
                        count={activeFilterCount}
                        onClick={() => {
                            setMethodFilter(undefined);
                            setFacultyFilter('');
                            setCourseFilter('');
                            setGroupFilter('');
                            setSearch('');
                            setPage(1);
                        }}
                    />
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
                        <div className="mt-4 flex flex-col gap-2">
                            {Array.from({ length: 6 }, (_, i) => (
                                <Skeleton key={i} className="h-16 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : isError ? (
                        <ErrorState onRetry={() => refetch()} />
                    ) : !data?.results.length ? (
                        <EmptyState
                            icon={<Brain className="h-6 w-6" />}
                            title="Hozircha natijalar yo'q"
                            description="Tanlangan filtrlar bo'yicha natija topilmadi."
                        />
                    ) : (
                        <>
                            <div className="mt-4 flex flex-col gap-2">
                                {data.results.map(r => (
                                    <div
                                        key={r.id}
                                        onClick={() => { if (deletingId !== null && deletingId !== r.id) setDeletingId(null); }}
                                        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
                                    >
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                            <Brain className="h-4 w-4 text-primary" />
                                        </div>
                                        {/* Birinchi qator — kim: psixolog natijani talaba
                                            bo'yicha izlaydi, metod nomi esa ikkinchi darajali. */}
                                        {isStudentView ? (
                                        <div className="flex-1 min-w-0 basis-56">
                                            <p className="truncate font-medium text-foreground">{r.method?.name ?? 'Metod o\'chirilgan'}</p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {formatDateTime(r.created_at)}
                                                </span>
                                                {r.diagnosis?.type === 'sum' && r.diagnosis.label && (
                                                    <span className="font-medium text-foreground/80">{r.diagnosis.label}</span>
                                                )}
                                            </div>
                                        </div>
                                        ) : (
                                        <div className="flex-1 min-w-0 basis-56">
                                            <p className="truncate font-medium text-foreground">
                                                {displayName(r.user)}
                                                {r.user?.full_name && (
                                                    <span className="ml-2 text-xs font-normal text-muted-foreground">@{r.user.username}</span>
                                                )}
                                            </p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                {r.user?.student_id_number && (
                                                    <span className="flex items-center gap-1">
                                                        <IdCard className="h-3 w-3" />
                                                        {r.user.student_id_number}
                                                    </span>
                                                )}
                                                {studyLine(r.user) ? (
                                                    <span className="flex min-w-0 items-center gap-1">
                                                        <Users className="h-3 w-3 shrink-0" />
                                                        <span className="truncate">{studyLine(r.user)}</span>
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <Building2 className="h-3 w-3" />
                                                        Talaba emas
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground/80">{r.method?.name ?? 'Metod o\'chirilgan'}</span>
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {formatDateTime(r.created_at)}
                                                </span>
                                                <span>{r.answers.length} javob</span>
                                            </div>
                                        </div>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => setSelected(r)}
                                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                                            >
                                                <Eye className="h-3.5 w-3.5" /> Ko'rish
                                            </button>
                                            {canDelete && <button
                                                onClick={() => {
                                                    if (deletingId === r.id) {
                                                        deleteResult.mutate(r.id, {
                                                            onSuccess: () => {
                                                                setDeletingId(null);
                                                                toast.success("Natija o'chirildi");
                                                            },
                                                            onError: () => toast.error("Natijani o'chirishda xatolik yuz berdi"),
                                                        });
                                                    } else {
                                                        setDeletingId(r.id);
                                                    }
                                                }}
                                                className={`flex items-center justify-center rounded-lg p-1.5 transition-colors ${
                                                    deletingId === r.id
                                                        ? 'bg-destructive text-destructive-foreground'
                                                        : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                                                }`}
                                                title={deletingId === r.id ? "Tasdiqlash uchun bosing" : "O'chirish"}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <Pagination
                                currentPage={page}
                                totalPages={Math.ceil(data.total / pageSize)}
                                onPageChange={setPage}
                                totalItems={data.total}
                                pageSize={pageSize}
                                onPageSizeChange={setPageSize}
                            />
                        </>
                    )}
                </CardContent>
            </Card>

            <ResultDetailModal result={selected} onClose={() => setSelected(null)} showUser={!isStudentView} />
        </div>
    );
}
