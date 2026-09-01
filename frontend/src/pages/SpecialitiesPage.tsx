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
    GraduationCap,
} from 'lucide-react';
import { specialityService, type Speciality, type SpecialityStats } from '@/services/specialityService';
import { useDeleteSpeciality, useFaculties, useKafedras } from '@/hooks/useReferenceData';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { HiddenBadge, ShowHiddenSwitch, VisibilityButton } from '@/components/common/VisibilityControls';
import { OrganizationToolbar, FilterChipGroup } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { SpecialityModal } from '@/components/speciality/SpecialityModal';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Combobox } from '@/components/ui/Combobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

type DegreeFilter = 'all' | 'Bakalavr' | 'Magistr';
type SortField = 'name' | 'code' | 'group_count' | 'student_count';
type SortOrder = 'asc' | 'desc';

export const SpecialitiesPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    // Yashirilganlarni koʻrsatish — faqat adminda maʼnoga ega.
    const [showHidden, setShowHidden] = useState(false);
    const navigate = useNavigate();

    const facultyIdParam = searchParams.get('faculty_id');
    const kafedraIdParam = searchParams.get('kafedra_id');

    const [selectedFaculty, setSelectedFaculty] = useState<string>(facultyIdParam || 'all');
    const [selectedKafedra, setSelectedKafedra] = useState<string>(kafedraIdParam || 'all');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [degreeFilter, setDegreeFilter] = useState<DegreeFilter>('all');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [specialities, setSpecialities] = useState<Speciality[]>([]);
    const [stats, setStats] = useState<Map<number, SpecialityStats>>(new Map());
    const pageSize = 15;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selected, setSelected] = useState<Speciality | null>(null);
    const [toDelete, setToDelete] = useState<Speciality | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    const { data: facultiesData } = useFaculties();
    const { data: kafedrasData } = useKafedras(
        1,
        200,
        undefined,
        selectedFaculty !== 'all' ? Number(selectedFaculty) : undefined
    );
    const deleteSpeciality = useDeleteSpeciality();

    const faculties = facultiesData?.faculties || [];
    const kafedras = kafedrasData?.kafedras || [];

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [search]);

    // Synchronize URL query params
    useEffect(() => {
        if (facultyIdParam && facultyIdParam !== selectedFaculty) {
            setSelectedFaculty(facultyIdParam);
        }
        if (kafedraIdParam && kafedraIdParam !== selectedKafedra) {
            setSelectedKafedra(kafedraIdParam);
        }
    }, [facultyIdParam, kafedraIdParam]);

    const loadData = async () => {
        setIsLoading(true);
        setIsError(false);
        try {
            const kafedraIdNum = selectedKafedra !== 'all' ? Number(selectedKafedra) : undefined;
            const [list, counters] = await Promise.all([
                specialityService.getSpecialities(1, 1000, debouncedSearch, kafedraIdNum, showHidden),
                specialityService.getSpecialityStats(kafedraIdNum),
            ]);
            setSpecialities(list.specialities);
            setStats(new Map(counters.map((item) => [item.speciality_id, item])));
        } catch {
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [selectedKafedra, debouncedSearch, showHidden]);

    // Handle faculty change
    const handleFacultyChange = (fId: string) => {
        setSelectedFaculty(fId);
        setSelectedKafedra('all');
        setCurrentPage(1);
        const nextParams = new URLSearchParams(searchParams);
        if (fId === 'all') {
            nextParams.delete('faculty_id');
        } else {
            nextParams.set('faculty_id', fId);
        }
        nextParams.delete('kafedra_id');
        setSearchParams(nextParams);
    };

    // Handle kafedra change
    const handleKafedraChange = (kId: string) => {
        setSelectedKafedra(kId);
        setCurrentPage(1);
        const nextParams = new URLSearchParams(searchParams);
        if (kId === 'all') {
            nextParams.delete('kafedra_id');
        } else {
            nextParams.set('kafedra_id', kId);
        }
        setSearchParams(nextParams);
    };

    const facultyOptions = useMemo(() => {
        const list = faculties.map((f) => ({ value: String(f.id), label: f.name }));
        return [{ value: 'all', label: 'Barcha fakultetlar' }, ...list];
    }, [faculties]);

    const kafedraOptions = useMemo(() => {
        const list = kafedras.map((k) => ({ value: String(k.id), label: k.name }));
        return [{ value: 'all', label: 'Barcha kafedralar' }, ...list];
    }, [kafedras]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    // Find names for badges / breadcrumbs
    const currentFacultyObj = useMemo(
        () => faculties.find((f) => String(f.id) === selectedFaculty),
        [faculties, selectedFaculty]
    );
    const currentKafedraObj = useMemo(
        () => kafedras.find((k) => String(k.id) === selectedKafedra),
        [kafedras, selectedKafedra]
    );

    const getKafedraName = (kId: number) => {
        const k = kafedras.find((item) => item.id === kId);
        return k ? k.name : `Kafedra #${kId}`;
    };

    const filtered = useMemo(() => {
        return specialities.filter((item) => {
            const matchesDegree =
                degreeFilter === 'all' ||
                (degreeFilter === 'Bakalavr' && item.education_type?.toLowerCase() === 'bakalavr') ||
                (degreeFilter === 'Magistr' && item.education_type?.toLowerCase() === 'magistr');

            return matchesDegree;
        });
    }, [degreeFilter, specialities]);

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            const statA = stats.get(a.id);
            const statB = stats.get(b.id);
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sortField === 'code') {
                valA = a.external_id || '';
                valB = b.external_id || '';
            } else if (sortField === 'group_count') {
                valA = statA?.group_count ?? 0;
                valB = statB?.group_count ?? 0;
            } else if (sortField === 'student_count') {
                valA = statA?.student_count ?? 0;
                valB = statB?.student_count ?? 0;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filtered, sortField, sortOrder, stats]);

    const totalPages = Math.ceil(sorted.length / pageSize) || 1;
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [sorted, currentPage, pageSize]);

    const closeDeleteDialog = () => {
        setToDelete(null);
        setCascadeWarnings([]);
    };

    const handleConfirmDelete = () => {
        if (!toDelete) return;
        deleteSpeciality.mutate(
            { id: toDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Mutaxassislik o'chirildi");
                    closeDeleteDialog();
                    void loadData();
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        const detail = error.response?.data?.detail;
                        toast.error(typeof detail === 'string' ? detail : "O'chirishda xatolik yuz berdi");
                        closeDeleteDialog();
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

    const renderDegreeBadge = (degree?: string | null) => {
        if (!degree) return <span className="text-muted-foreground text-xs">—</span>;
        const isMagistr = degree.toLowerCase() === 'magistr';
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isMagistr
                        ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                }`}
            >
                <GraduationCap className="h-3 w-3" />
                <span>{degree}</span>
            </span>
        );
    };

    const renderActions = (speciality: Speciality) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {!isExternal(speciality) && (
                <>
                    <PermissionGate permission="update:speciality">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Tahrirlash"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelected(speciality);
                                setIsModalOpen(true);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:speciality">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                            title="O'chirish"
                            onClick={(e) => {
                                e.stopPropagation();
                                setToDelete(speciality);
                                setCascadeWarnings([]);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
            <VisibilityButton
                entity="speciality"
                row={speciality}
                label={speciality.name}
                onDone={loadData}
                className="h-8 w-8 p-0"
            />
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary gap-1"
                onClick={() => navigate(`/groups?speciality_id=${speciality.id}`)}
            >
                <span>Guruhlar</span>
                <ArrowRight className="h-3.5 w-3.5" />
            </Button>
        </div>
    );

    // Breadcrumb items
    const breadcrumbItems = useMemo(() => {
        const items = [{ label: 'Mutaxassisliklar', onClick: () => navigate('/specialities') }];
        if (currentFacultyObj) {
            items.unshift({
                label: `Fakultet: ${currentFacultyObj.name}`,
                onClick: () => navigate(`/kafedras?faculty_id=${currentFacultyObj.id}`),
            });
        }
        if (currentKafedraObj) {
            items.splice(items.length - 1, 0, {
                label: currentKafedraObj.name,
                onClick: () => navigate(`/specialities?kafedra_id=${currentKafedraObj.id}`),
            });
        }
        return items;
    }, [currentFacultyObj, currentKafedraObj, navigate]);

    return (
        <div className="space-y-5">
            {/* Unified Dynamic Breadcrumbs */}
            <OrganizationBreadcrumbs
                items={breadcrumbItems}
                title="Mutaxassisliklar"
                description="Universitet barcha ta'lim yo'nalishlari va mutaxassisliklari ro'yxati"
            />

            {/* Toolbar */}
            <OrganizationToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Mutaxassislik nomi yoki kodi bo'yicha..."
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                totalCount={filtered.length}
                totalLabel="Mutaxassisliklar"
                extraFilters={
                    <>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-[180px] sm:w-[220px]">
                            <Combobox
                                options={facultyOptions}
                                value={selectedFaculty}
                                onChange={handleFacultyChange}
                                placeholder="Fakultetni tanlang"
                            />
                        </div>
                        <div className="w-[180px] sm:w-[220px]">
                            <Combobox
                                options={kafedraOptions}
                                value={selectedKafedra}
                                onChange={handleKafedraChange}
                                placeholder="Kafedrani tanlang"
                            />
                        </div>
                    </div>
                        <ShowHiddenSwitch value={showHidden} onChange={setShowHidden} />
                    </>
                }
                chips={
                    <FilterChipGroup<DegreeFilter>
                        label="Ta'lim darajasi"
                        value={degreeFilter}
                        onChange={(val) => {
                            setDegreeFilter(val);
                            setCurrentPage(1);
                        }}
                        options={[
                            { value: 'all', label: 'Barchasi' },
                            { value: 'Bakalavr', label: 'Bakalavr' },
                            { value: 'Magistr', label: 'Magistr' },
                        ]}
                    />
                }
                actions={
                    <PermissionGate permission="create:speciality">
                        <Button
                            size="sm"
                            onClick={() => {
                                setSelected(null);
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
            {isError ? (
                <ErrorState onRetry={loadData} />
            ) : isLoading ? (
                viewMode === 'table' ? (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <CatalogGrid>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-44 rounded-2xl" />
                        ))}
                    </CatalogGrid>
                )
            ) : sorted.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={8}
                        title="Mutaxassisliklar topilmadi"
                        description={
                            search || selectedFaculty !== 'all' || selectedKafedra !== 'all'
                                ? "Tanlangan filtrlarga mos mutaxassislik topilmadi."
                                : "Hozircha mutaxassisliklar qo'shilmagan."
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
                                onClick={() => handleSort('code')}
                                className="w-[120px] group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Kodi</span>
                                    {renderSortIcon('code')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('name')}
                                className="group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Mutaxassislik Nomi</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">Kafedra</TableHead>
                            <TableHead className="text-center font-bold text-xs">Ta'lim Darajasi</TableHead>
                            <TableHead
                                onClick={() => handleSort('group_count')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>Guruhlar</span>
                                    {renderSortIcon('group_count')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('student_count')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>Talabalar</span>
                                    {renderSortIcon('student_count')}
                                </div>
                            </TableHead>
                            <TableHead className="text-center font-bold text-xs">Holati</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">Amallar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedItems.map((speciality, index) => {
                            const item = stats.get(speciality.id);
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const isActive = speciality.is_active !== false;

                            return (
                                <TableRow
                                    key={speciality.id}
                                    onClick={() => navigate(`/groups?speciality_id=${speciality.id}`)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Kodi */}
                                    <TableCell className="w-[120px]">
                                        {speciality.external_id ? (
                                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-foreground border border-border/80">
                                                {speciality.external_id}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>

                                    {/* Mutaxassislik Nomi */}
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                {speciality.name}
                                            </span>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <ExternalSourceBadge row={speciality} />
                                                <InactiveBadge row={speciality} />
                                                <HiddenBadge row={speciality} />
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Kafedra */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="badge badge-primary text-xs">
                                            {getKafedraName(speciality.kafedra_id)}
                                        </span>
                                    </TableCell>

                                    {/* Ta'lim Darajasi */}
                                    <TableCell className="text-center">
                                        {renderDegreeBadge(speciality.education_type)}
                                    </TableCell>

                                    {/* Guruhlar Soni */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[28px] rounded-lg bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                                            {item ? item.group_count : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Talabalar Soni */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[28px] rounded-lg bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {item ? item.student_count : '—'}
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
                                        {renderActions(speciality)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {paginatedItems.map((speciality) => {
                        const item = stats.get(speciality.id);
                        const subtitleParts = [
                            speciality.education_type,
                            speciality.external_id ? `Kod: ${speciality.external_id}` : null,
                        ].filter(Boolean);

                        return (
                            <CatalogCard
                                key={speciality.id}
                                id={speciality.id}
                                title={speciality.name}
                                subtitle={
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        {subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Mutaxassislik'}
                                        <ExternalSourceBadge row={speciality} />
                                        <InactiveBadge row={speciality} />
                                        <HiddenBadge row={speciality} />
                                    </span>
                                }
                                onClick={() => navigate(`/groups?speciality_id=${speciality.id}`)}
                                actions={renderActions(speciality)}
                                metrics={[
                                    { label: 'Guruh', value: item?.group_count ?? '—' },
                                    { label: 'Talaba', value: item?.student_count ?? '—', accent: true },
                                ]}
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
                    isLoading={isLoading}
                />
            )}

            {/* Modals */}
            {isModalOpen && (
                <SpecialityModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    speciality={selected}
                    kafedras={kafedras}
                    defaultKafedraId={selectedKafedra !== 'all' ? Number(selectedKafedra) : undefined}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        void loadData();
                    }}
                />
            )}

            <ConfirmDialog
                isOpen={Boolean(toDelete)}
                onClose={closeDeleteDialog}
                onConfirm={handleConfirmDelete}
                title="Mutaxassislikni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="mt-2 space-y-2 text-left">
                            <p className="font-medium text-destructive">
                                Diqqat! Ushbu mutaxassislikni o'chirish quyidagilarga ta'sir qiladi:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((warning, index) => (
                                    <li key={index}>{warning}</li>
                                ))}
                            </ul>
                            <p className="mt-2 font-semibold text-destructive">
                                Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!
                            </p>
                        </div>
                    ) : (
                        `Siz haqiqatan ham "${toDelete?.name}" mutaxassisligini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default SpecialitiesPage;
