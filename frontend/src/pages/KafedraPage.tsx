import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Pencil,
    Plus,
    Trash2,
    ArrowRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { kafedraService, type Kafedra, type KafedraStats } from '@/services/kafedraService';
import { useKafedras, useDeleteKafedra, useFaculties } from '@/hooks/useReferenceData';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { HiddenBadge, ShowHiddenSwitch, VisibilityButton } from '@/components/common/VisibilityControls';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KafedraModal } from '@/components/kafedra/KafedraModal';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Combobox } from '@/components/ui/Combobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';

type SortField = 'name' | 'speciality_count' | 'teacher_count';
type SortOrder = 'asc' | 'desc';

export const KafedraPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const facultyIdParam = searchParams.get('faculty_id');
    const [selectedFacultyFilter, setSelectedFacultyFilter] = useState<string>(facultyIdParam || 'all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    // Yashirilganlarni koʻrsatish — faqat adminda maʼnoga ega.
    const [showHidden, setShowHidden] = useState(false);
    const pageSize = 15;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedKafedra, setSelectedKafedra] = useState<Kafedra | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [kafedraToDelete, setKafedraToDelete] = useState<Kafedra | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [stats, setStats] = useState<Map<number, KafedraStats>>(new Map());

    const { data: facultiesData } = useFaculties();
    const faculties = facultiesData?.faculties || [];

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Synchronize URL query parameter
    useEffect(() => {
        if (facultyIdParam && facultyIdParam !== selectedFacultyFilter) {
            setSelectedFacultyFilter(facultyIdParam);
        }
    }, [facultyIdParam]);

    const facultyIdNum = selectedFacultyFilter === 'all' ? undefined : Number(selectedFacultyFilter);

    const {
        data: kafedrasData,
        isLoading: isKafedrasLoading,
        isError: isKafedrasError,
        refetch,
    } = useKafedras(currentPage, pageSize, debouncedSearch, facultyIdNum, true, showHidden);

    const rawKafedras = kafedrasData?.kafedras || [];
    const totalPages = kafedrasData ? Math.ceil(kafedrasData.total / pageSize) : 1;
    const totalCount = kafedrasData?.total ?? rawKafedras.length;

    const deleteKafedraMutation = useDeleteKafedra();

    useEffect(() => {
        kafedraService
            .getKafedraStats(facultyIdNum)
            .then((items) => setStats(new Map(items.map((item) => [item.kafedra_id, item]))))
            .catch(() => setStats(new Map()));
    }, [facultyIdNum]);

    const handleFacultyFilterChange = (val: string) => {
        setSelectedFacultyFilter(val);
        setCurrentPage(1);
        const nextParams = new URLSearchParams(searchParams);
        if (val === 'all') {
            nextParams.delete('faculty_id');
        } else {
            nextParams.set('faculty_id', val);
        }
        setSearchParams(nextParams);
    };

    const facultyOptions = useMemo(() => {
        const options = faculties.map((f) => ({
            value: f.id.toString(),
            label: f.name,
        }));
        return [{ value: 'all', label: 'Barcha fakultetlar' }, ...options];
    }, [faculties]);

    const currentFacultyObj = useMemo(
        () => faculties.find((f) => String(f.id) === selectedFacultyFilter),
        [faculties, selectedFacultyFilter]
    );

    const getFacultyName = (facultyId: number) => {
        const faculty = faculties.find((f) => f.id === facultyId);
        return faculty ? faculty.name : `ID: ${facultyId}`;
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const sortedKafedras = useMemo(() => {
        return [...rawKafedras].sort((a, b) => {
            const statA = stats.get(a.id);
            const statB = stats.get(b.id);
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sortField === 'speciality_count') {
                valA = statA?.speciality_count ?? 0;
                valB = statB?.speciality_count ?? 0;
            } else if (sortField === 'teacher_count') {
                valA = statA?.teacher_count ?? 0;
                valB = statB?.teacher_count ?? 0;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rawKafedras, sortField, sortOrder, stats]);

    const handleDeleteClick = (kafedra: Kafedra) => {
        setKafedraToDelete(kafedra);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!kafedraToDelete) return;
        deleteKafedraMutation.mutate(
            { id: kafedraToDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Kafedra o'chirildi");
                    setIsDeleteModalOpen(false);
                    setKafedraToDelete(null);
                    setCascadeWarnings([]);
                    refetch();
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        toast.error("O'chirishda xatolik yuz berdi");
                        setIsDeleteModalOpen(false);
                        setKafedraToDelete(null);
                        setCascadeWarnings([]);
                    }
                },
            }
        );
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />;
        }
        return sortOrder === 'asc' ? (
            <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-primary" />
        ) : (
            <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
        );
    };

    const renderActions = (kafedra: Kafedra) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {!isExternal(kafedra) && (
                <>
                    <PermissionGate permission="update:kafedra">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Tahrirlash"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedKafedra(kafedra);
                                setIsModalOpen(true);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:kafedra">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                            title="O'chirish"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(kafedra);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
            <VisibilityButton
                entity="kafedra"
                row={kafedra}
                label={kafedra.name}
                className="h-8 w-8 p-0"
            />
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary gap-1"
                onClick={() => navigate(`/specialities?kafedra_id=${kafedra.id}`)}
            >
                <span>Mutaxassisliklar</span>
                <ArrowRight className="h-3.5 w-3.5" />
            </Button>
        </div>
    );

    // Breadcrumb path
    const breadcrumbItems = useMemo(() => {
        if (currentFacultyObj) {
            return [
                { label: 'Fakultetlar', onClick: () => navigate('/faculties') },
                { label: currentFacultyObj.name, onClick: () => navigate(`/kafedras?faculty_id=${currentFacultyObj.id}`) },
                { label: 'Kafedralar' },
            ];
        }
        return [{ label: 'Kafedralar' }];
    }, [currentFacultyObj, navigate]);

    return (
        <div className="space-y-5">
            {/* Unified Dynamic Breadcrumbs */}
            <OrganizationBreadcrumbs
                items={breadcrumbItems}
                title={currentFacultyObj ? `${currentFacultyObj.name} — kafedralar` : 'Kafedralar'}
                description={
                    currentFacultyObj
                        ? `${currentFacultyObj.name} fakultetiga qarashli kafedralar ro'yxati`
                        : "Universitet barcha kafedralari va ularning ta'lim ko'rsatkichlari"
                }
            />

            {/* Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Kafedra nomi bo'yicha qidirish..."
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                totalCount={totalCount}
                totalLabel="Kafedralar"
                extraFilters={
                    <>
                    <div className="w-[200px] sm:w-[260px]">
                        <Combobox
                            options={facultyOptions}
                            value={selectedFacultyFilter}
                            onChange={handleFacultyFilterChange}
                            placeholder="Fakultet bo'yicha saralash"
                        />
                    </div>
                        <ShowHiddenSwitch value={showHidden} onChange={setShowHidden} />
                    </>
                }
                actions={
                    <PermissionGate permission="create:kafedra">
                        <Button
                            size="sm"
                            onClick={() => {
                                setSelectedKafedra(null);
                                setIsModalOpen(true);
                            }}
                            className="h-9 gap-1.5 font-semibold shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Qo'shish</span>
                        </Button>
                    </PermissionGate>
                }
            />

            {/* Content */}
            {isKafedrasError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isKafedrasLoading ? (
                viewMode === 'table' ? (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
                        ))}
                    </div>
                )
            ) : sortedKafedras.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={7}
                        title="Kafedralar topilmadi"
                        description={
                            searchTerm || selectedFacultyFilter !== 'all'
                                ? "Tanlangan mezonlarga mos kafedra topilmadi."
                                : "Hozircha kafedra qo'shilmagan."
                        }
                    />
                </div>
            ) : viewMode === 'table' ? (
                /* High-Density Optimized Table View */
                <Table className="min-w-full border-separate border-spacing-0">
                    <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="border-b border-border/80">
                            <TableHead className="w-[50px] text-center font-bold font-mono text-xs">#</TableHead>
                            <TableHead
                                onClick={() => handleSort('name')}
                                className="group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Kafedra Nomi</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">Fakultet</TableHead>
                            <TableHead
                                onClick={() => handleSort('speciality_count')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>Mutaxassisliklar</span>
                                    {renderSortIcon('speciality_count')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('teacher_count')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>O'qituvchilar</span>
                                    {renderSortIcon('teacher_count')}
                                </div>
                            </TableHead>
                            <TableHead className="text-center font-bold text-xs">Holati</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">Amallar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedKafedras.map((kafedra, index) => {
                            const item = stats.get(kafedra.id);
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const isActive = kafedra.is_active !== false;

                            return (
                                <TableRow
                                    key={kafedra.id}
                                    onClick={() => navigate(`/specialities?kafedra_id=${kafedra.id}`)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Kafedra Nomi */}
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                    tileFor(kafedra.id)
                                                )}
                                            >
                                                {initialsOf(kafedra.name)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                    {kafedra.name}
                                                </p>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                    <ExternalSourceBadge row={kafedra} />
                                                    <InactiveBadge row={kafedra} />
                                                    <HiddenBadge row={kafedra} />
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Fakultet */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="badge badge-primary text-xs capitalize">
                                            {getFacultyName(kafedra.faculty_id)}
                                        </span>
                                    </TableCell>

                                    {/* Mutaxassisliklar */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[28px] rounded-lg bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                                            {item ? item.speciality_count : '—'}
                                        </span>
                                    </TableCell>

                                    {/* O'qituvchilar */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[28px] rounded-lg bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {item ? item.teacher_count : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Holati */}
                                    <TableCell className="text-center">
                                        {isActive ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span>Faol</span>
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/15 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                                                <XCircle className="h-3 w-3" />
                                                <span>Nofaol</span>
                                            </span>
                                        )}
                                    </TableCell>

                                    {/* Amallar */}
                                    <TableCell className="text-right pr-4">
                                        {renderActions(kafedra)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {sortedKafedras.map((kafedra) => {
                        const item = stats.get(kafedra.id);
                        return (
                            <CatalogCard
                                key={kafedra.id}
                                id={kafedra.id}
                                title={kafedra.name}
                                subtitle={
                                    <span className="inline-flex flex-wrap items-center gap-1.5">
                                        <span className="badge badge-primary text-xs capitalize">
                                            {getFacultyName(kafedra.faculty_id)}
                                        </span>
                                        <ExternalSourceBadge row={kafedra} />
                                        <InactiveBadge row={kafedra} />
                                        <HiddenBadge row={kafedra} />
                                    </span>
                                }
                                metrics={[
                                    { label: 'Mutaxassislik', value: item?.speciality_count ?? '—' },
                                    { label: "O'qituvchi", value: item?.teacher_count ?? '—', accent: true },
                                ]}
                                actions={renderActions(kafedra)}
                                onClick={() => navigate(`/specialities?kafedra_id=${kafedra.id}`)}
                            />
                        );
                    })}
                </CatalogGrid>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    isLoading={isKafedrasLoading}
                />
            )}

            {/* Modals */}
            <KafedraModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                kafedra={selectedKafedra}
                faculties={faculties}
                defaultFacultyId={facultyIdNum}
                onSuccess={() => {
                    setIsModalOpen(false);
                    refetch();
                }}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCascadeWarnings([]);
                    setKafedraToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Kafedrani o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                Diqqat! Ushbu kafedrani o'chirish quyidagi ma'lumotlarni ham o'chiradi:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">
                                Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!
                            </p>
                        </div>
                    ) : (
                        `Siz haqiqatan ham "${kafedraToDelete?.name}" kafedrasini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default KafedraPage;
