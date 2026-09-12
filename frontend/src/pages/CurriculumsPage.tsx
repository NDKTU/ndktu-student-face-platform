import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { curriculumService } from '@/services/curriculumService';
import { useFaculties, useKafedras } from '@/hooks/useReferenceData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { ClearFiltersButton } from '@/components/faculty/OrganizationToolbar';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { ExternalSourceBadge, InactiveBadge } from '@/components/common/ExternalSourceBadge';

const PAGE_SIZE = 20;

/** EPMOS'dagi ta'lim shakllari. Bo'sh qiymat — «hammasi». */
const EDUCATION_FORMS = ['Kunduzgi', 'Kechki', 'Sirtqi', 'Masofaviy'];
const EDUCATION_TYPES = ['Bakalavr', 'Magistr'];

/**
 * O'quv rejalar ro'yxati.
 *
 * Faqat ko'rish: rejalar EPMOS'dan sinxronizatsiya orqali keladi va qo'lda
 * tahrirlanmaydi. Qo'shish/o'zgartirish tugmalari ataylab yo'q — backend
 * bunday so'rovni rad etadi, va ishlamaydigan tugma buzuqlikdek ko'rinardi.
 */
export const CurriculumsPage = () => {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [faculty, setFaculty] = useState('all');
    const [kafedra, setKafedra] = useState('all');
    const [form, setForm] = useState('all');
    const [type, setType] = useState('all');
    const [page, setPage] = useState(1);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [search]);

    const activeFilterCount =
        (search ? 1 : 0) +
        (faculty !== 'all' ? 1 : 0) +
        (kafedra !== 'all' ? 1 : 0) +
        (form !== 'all' ? 1 : 0) +
        (type !== 'all' ? 1 : 0);

    const handleClearFilters = () => {
        setSearch('');
        setFaculty('all');
        setKafedra('all');
        setForm('all');
        setType('all');
        setPage(1);
    };

    const { data: facultiesData } = useFaculties();
    // Filtr ro'yxati tanlangan fakultetga qisqaradi…
    const { data: kafedrasData } = useKafedras(
        1,
        200,
        undefined,
        faculty !== 'all' ? Number(faculty) : undefined,
    );
    // …lekin jadvaldagi nomlar uchun hammasi kerak: fakultet bo'yicha
    // filtrlanganda ham reja o'z kafedrasining nomini ko'rsatishi kerak.
    const { data: allKafedrasData } = useKafedras(1, 500);

    const filters = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            name: debouncedSearch || undefined,
            faculty_id: faculty !== 'all' ? Number(faculty) : undefined,
            kafedra_id: kafedra !== 'all' ? Number(kafedra) : undefined,
            education_form: form !== 'all' ? form : undefined,
            education_type: type !== 'all' ? type : undefined,
        }),
        [page, debouncedSearch, faculty, kafedra, form, type],
    );

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['curriculums', filters],
        queryFn: () => curriculumService.getCurriculums(filters),
    });

    const facultyName = useMemo(
        () => new Map((facultiesData?.faculties ?? []).map((f) => [f.id, f.name])),
        [facultiesData],
    );
    const kafedraName = useMemo(
        () => new Map((allKafedrasData?.kafedras ?? []).map((k) => [k.id, k.name])),
        [allKafedrasData],
    );

    const rows = data?.curriculums ?? [];
    const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

    const resetFilters = () => {
        setSearch('');
        setFaculty('all');
        setKafedra('all');
        setForm('all');
        setType('all');
        setPage(1);
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="O'quv rejalar"
                description="EPMOS'dan ko'chirilgan o'quv rejalar. Bu yerda faqat ko'rinadi — o'zgartirish EPMOS'da qilinadi."
            />

            <Card>
                <CardContent className="space-y-3 pt-6">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <Input
                            type="search"
                            name="search"
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            placeholder="Reja nomi bo'yicha qidirish…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="lg:col-span-2"
                        />
                        <Combobox
                            options={[
                                { value: 'all', label: 'Barcha fakultetlar' },
                                ...(facultiesData?.faculties ?? []).map((f) => ({
                                    value: String(f.id),
                                    label: f.name,
                                })),
                            ]}
                            value={faculty}
                            onChange={(v) => {
                                setFaculty(v);
                                // Kafedra tanlovi fakultetga bog'liq: fakultet
                                // almashsa, eski kafedra ro'yxatda qolmaydi.
                                setKafedra('all');
                                setPage(1);
                            }}
                            placeholder="Fakultet"
                        />
                        <Combobox
                            options={[
                                { value: 'all', label: 'Barcha kafedralar' },
                                ...(kafedrasData?.kafedras ?? []).map((k) => ({
                                    value: String(k.id),
                                    label: k.name,
                                })),
                            ]}
                            value={kafedra}
                            onChange={(v) => {
                                setKafedra(v);
                                setPage(1);
                            }}
                            placeholder="Kafedra"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <Combobox
                                options={[
                                    { value: 'all', label: 'Shakl' },
                                    ...EDUCATION_FORMS.map((f) => ({ value: f, label: f })),
                                ]}
                                value={form}
                                onChange={(v) => {
                                    setForm(v);
                                    setPage(1);
                                }}
                                placeholder="Shakl"
                            />
                            <Combobox
                                options={[
                                    { value: 'all', label: 'Daraja' },
                                    ...EDUCATION_TYPES.map((t) => ({ value: t, label: t })),
                                ]}
                                value={type}
                                onChange={(v) => {
                                    setType(v);
                                    setPage(1);
                                }}
                                placeholder="Daraja"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {data && (
                            <div className="text-sm text-muted-foreground">
                                Jami: {data.total} ta reja
                            </div>
                        )}
                        <ClearFiltersButton
                            className="ml-auto"
                            count={activeFilterCount}
                            onClick={handleClearFilters}
                        />
                    </div>
                </CardContent>
            </Card>

            {isError ? (
                <ErrorState
                    title="Ro'yxatni yuklab bo'lmadi"
                    onRetry={() => refetch()}
                />
            ) : isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Reja nomi</TableHead>
                                        <TableHead className="hidden md:table-cell">Fakultet</TableHead>
                                        <TableHead className="hidden lg:table-cell">Kafedra</TableHead>
                                        <TableHead className="hidden sm:table-cell">Shakl</TableHead>
                                        <TableHead className="hidden sm:table-cell">Daraja</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.length === 0 ? (
                                        <TableEmpty
                                            colSpan={5}
                                            icon={<BookOpen className="h-8 w-8" />}
                                            title="O'quv reja topilmadi"
                                            description={
                                                data?.total === 0
                                                    ? "Rejalar hali ko'chirilmagan. EPMOS sinxronizatsiyasida «O'quv rejalarni sinxronlash» ni bajaring."
                                                    : 'Filtrlarga mos reja yo‘q.'
                                            }
                                            action={
                                                data?.total !== 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={resetFilters}
                                                        className="text-sm text-primary underline-offset-4 hover:underline"
                                                    >
                                                        Filtrlarni tozalash
                                                    </button>
                                                ) : undefined
                                            }
                                        />
                                    ) : (
                                        rows.map((row) => (
                                            <TableRow key={row.id}>
                                                <TableCell className="font-medium">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span>{row.name}</span>
                                                        <ExternalSourceBadge row={row} />
                                                        <InactiveBadge row={row} />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    {row.faculty_id
                                                        ? facultyName.get(row.faculty_id) ?? '—'
                                                        : '—'}
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {row.kafedra_id
                                                        ? kafedraName.get(row.kafedra_id) ?? '—'
                                                        : '—'}
                                                </TableCell>
                                                <TableCell className="hidden sm:table-cell">{row.education_form ?? '—'}</TableCell>
                                                <TableCell className="hidden sm:table-cell">{row.education_type ?? '—'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                isLoading={isLoading}
            />
        </div>
    );
};

export default CurriculumsPage;
