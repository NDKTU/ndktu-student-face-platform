import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { type Group } from '@/services/groupService';
import { Button } from '@/components/ui/Button';
import {
    Plus,
    Pencil,
    Trash2,
    Users,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useGroups, useDeleteGroup } from '@/hooks/useGroups';
import { useFaculties, useSpecialities } from '@/hooks/useReferenceData';
import { Combobox } from '@/components/ui/Combobox';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { HiddenBadge, ShowHiddenSwitch, VisibilityButton } from '@/components/common/VisibilityControls';
import { OrganizationToolbar, FilterChipGroup } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { GroupModal } from '@/components/group/GroupModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

type EducationFormFilter = 'all' | 'Kunduzgi' | 'Sirtqi' | 'Kechki';
type CourseLevelFilter = 'all' | '1' | '2' | '3' | '4';
type SortField = 'name' | 'course' | 'student_count';
type SortOrder = 'asc' | 'desc';

export const GroupsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    // Yashirilganlarni koʻrsatish — faqat adminda maʼnoga ega.
    const [showHidden, setShowHidden] = useState(false);
    const navigate = useNavigate();

    const facultyIdParam = searchParams.get('faculty_id');
    const specialityIdParam = searchParams.get('speciality_id');

    const [selectedFacultyFilter, setSelectedFacultyFilter] = useState<string>(facultyIdParam || 'all');
    const [selectedSpecialityFilter, setSelectedSpecialityFilter] = useState<string>(specialityIdParam || 'all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [educationFormFilter, setEducationFormFilter] = useState<EducationFormFilter>('all');
    const [courseLevelFilter, setCourseLevelFilter] = useState<CourseLevelFilter>('all');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 15;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        if (facultyIdParam && facultyIdParam !== selectedFacultyFilter) {
            setSelectedFacultyFilter(facultyIdParam);
        }
        if (specialityIdParam && specialityIdParam !== selectedSpecialityFilter) {
            setSelectedSpecialityFilter(specialityIdParam);
        }
    }, [facultyIdParam, specialityIdParam]);

    const facultyIdNum = selectedFacultyFilter === 'all' ? undefined : Number(selectedFacultyFilter);
    const specialityIdNum = selectedSpecialityFilter === 'all' ? undefined : Number(selectedSpecialityFilter);

    const {
        data: groupsData,
        isLoading: isGroupsLoading,
        isError: isGroupsError,
        refetch,
    } = useGroups(currentPage, pageSize, debouncedSearch, undefined, facultyIdNum, specialityIdNum, true, showHidden);

    const { data: facultiesData } = useFaculties();
    const { data: specialitiesData } = useSpecialities(1, 200);
    const deleteGroupMutation = useDeleteGroup();

    const rawGroups = groupsData?.groups || [];
    const totalPages = groupsData ? Math.ceil(groupsData.total / pageSize) : 1;
    const totalCount = groupsData?.total ?? rawGroups.length;
    const faculties = facultiesData?.faculties || [];
    const specialities = specialitiesData?.specialities || [];

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

    const handleSpecialityFilterChange = (val: string) => {
        setSelectedSpecialityFilter(val);
        setCurrentPage(1);
        const nextParams = new URLSearchParams(searchParams);
        if (val === 'all') {
            nextParams.delete('speciality_id');
        } else {
            nextParams.set('speciality_id', val);
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

    const specialityOptions = useMemo(() => {
        const options = specialities.map((s) => ({
            value: s.id.toString(),
            label: s.name,
        }));
        return [{ value: 'all', label: 'Barcha mutaxassisliklar' }, ...options];
    }, [specialities]);

    const getFacultyName = (facultyId: number) => {
        const faculty = faculties.find((f) => f.id === facultyId);
        return faculty ? faculty.name : `ID: ${facultyId}`;
    };

    const getSpecialityName = (specId?: number | null) => {
        if (!specId) return null;
        const s = specialities.find((item) => item.id === specId);
        return s ? s.name : null;
    };

    const currentFacultyObj = useMemo(
        () => faculties.find((f) => String(f.id) === selectedFacultyFilter),
        [faculties, selectedFacultyFilter]
    );
    const currentSpecialityObj = useMemo(
        () => specialities.find((s) => String(s.id) === selectedSpecialityFilter),
        [specialities, selectedSpecialityFilter]
    );

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const filtered = useMemo(() => {
        return rawGroups.filter((group) => {
            const matchesForm =
                educationFormFilter === 'all' ||
                (group.education_shape && group.education_shape.toLowerCase().includes(educationFormFilter.toLowerCase()));

            const matchesCourse =
                courseLevelFilter === 'all' ||
                (group.course !== undefined && group.course !== null && String(group.course) === courseLevelFilter);

            return matchesForm && matchesCourse;
        });
    }, [rawGroups, educationFormFilter, courseLevelFilter]);

    const sortedGroups = useMemo(() => {
        return [...filtered].sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sortField === 'course') {
                valA = a.course ?? 0;
                valB = b.course ?? 0;
            } else if (sortField === 'student_count') {
                valA = a.student_count ?? 0;
                valB = b.student_count ?? 0;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filtered, sortField, sortOrder]);

    const handleDeleteClick = (group: Group) => {
        setGroupToDelete(group);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!groupToDelete) return;
        deleteGroupMutation.mutate(
            { id: groupToDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Guruh o'chirildi");
                    setIsDeleteModalOpen(false);
                    setGroupToDelete(null);
                    setCascadeWarnings([]);
                    refetch();
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        toast.error("O'chirishda xatolik yuz berdi");
                        setIsDeleteModalOpen(false);
                        setGroupToDelete(null);
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

    const renderEducationFormChip = (form?: string | null) => {
        if (!form) return <span className="text-muted-foreground text-xs">—</span>;
        const normalized = form.toLowerCase();
        let colorClass = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
        if (normalized.includes('sirtqi')) {
            colorClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
        } else if (normalized.includes('kechki')) {
            colorClass = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
        }

        return (
            <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium border ${colorClass}`}>
                {form}
            </span>
        );
    };

    const renderCourseBadge = (course?: number | null) => {
        if (!course) return <span className="text-muted-foreground text-xs">—</span>;
        return (
            <span className="inline-flex items-center justify-center rounded-lg bg-muted px-2.5 py-0.5 font-mono text-xs font-bold text-foreground border border-border">
                {course}-kurs
            </span>
        );
    };

    const renderActions = (group: Group) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {!isExternal(group) && (
                <>
                    <PermissionGate permission="update:group">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Tahrirlash"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedGroup(group);
                                setIsModalOpen(true);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:group">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                            title="O'chirish"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(group);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
            <VisibilityButton
                entity="group"
                row={group}
                label={group.name}
                className="h-8 w-8 p-0"
            />
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary gap-1"
                onClick={() => navigate(`/students?group_id=${group.id}`)}
            >
                <Users className="h-3.5 w-3.5" />
                <span>Talabalar</span>
            </Button>
        </div>
    );

    // Breadcrumb items
    const breadcrumbItems = useMemo(() => {
        const items = [{ label: 'Guruhlar', onClick: () => navigate('/groups') }];
        if (currentFacultyObj) {
            items.unshift({
                label: `Fakultet: ${currentFacultyObj.name}`,
                onClick: () => navigate(`/kafedras?faculty_id=${currentFacultyObj.id}`),
            });
        }
        if (currentSpecialityObj) {
            items.splice(items.length - 1, 0, {
                label: currentSpecialityObj.name,
                onClick: () => navigate(`/groups?speciality_id=${currentSpecialityObj.id}`),
            });
        }
        return items;
    }, [currentFacultyObj, currentSpecialityObj, navigate]);

    return (
        <div className="space-y-5">
            {/* Unified Dynamic Breadcrumbs */}
            <OrganizationBreadcrumbs
                items={breadcrumbItems}
                title={
                    currentSpecialityObj
                        ? `${currentSpecialityObj.name} — guruhlar`
                        : currentFacultyObj
                        ? `${currentFacultyObj.name} — guruhlar`
                        : "O'quv Guruhlari"
                }
                description="Universitet o'quv guruhlari, ta'lim shakllari va talabalar taqsimoti"
            />

            {/* Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Guruh nomi yoki HEMIS kodi bo'yicha..."
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                totalCount={totalCount}
                totalLabel="Guruhlar"
                extraFilters={
                    <>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-[180px] sm:w-[220px]">
                            <Combobox
                                options={facultyOptions}
                                value={selectedFacultyFilter}
                                onChange={handleFacultyFilterChange}
                                placeholder="Fakultet bo'yicha"
                            />
                        </div>
                        <div className="w-[180px] sm:w-[220px]">
                            <Combobox
                                options={specialityOptions}
                                value={selectedSpecialityFilter}
                                onChange={handleSpecialityFilterChange}
                                placeholder="Mutaxassislik bo'yicha"
                            />
                        </div>
                    </div>
                        <ShowHiddenSwitch value={showHidden} onChange={setShowHidden} />
                    </>
                }
                chips={
                    <div className="flex flex-wrap items-center gap-4 w-full">
                        {/* Education Form Chips */}
                        <FilterChipGroup<EducationFormFilter>
                            label="Ta'lim shakli"
                            value={educationFormFilter}
                            onChange={(val) => {
                                setEducationFormFilter(val);
                                setCurrentPage(1);
                            }}
                            options={[
                                { value: 'all', label: 'Barchasi' },
                                { value: 'Kunduzgi', label: 'Kunduzgi' },
                                { value: 'Sirtqi', label: 'Sirtqi' },
                                { value: 'Kechki', label: 'Kechki' },
                            ]}
                        />

                        {/* Course Level Chips */}
                        <FilterChipGroup<CourseLevelFilter>
                            label="Bosqich"
                            value={courseLevelFilter}
                            onChange={(val) => {
                                setCourseLevelFilter(val);
                                setCurrentPage(1);
                            }}
                            options={[
                                { value: 'all', label: 'Barchasi' },
                                { value: '1', label: '1-kurs' },
                                { value: '2', label: '2-kurs' },
                                { value: '3', label: '3-kurs' },
                                { value: '4', label: '4-kurs' },
                            ]}
                        />
                    </div>
                }
                actions={
                    <PermissionGate permission="create:group">
                        <Button
                            size="sm"
                            onClick={() => {
                                setSelectedGroup(null);
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
            {isGroupsError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isGroupsLoading ? (
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
            ) : sortedGroups.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={8}
                        title="Guruhlar topilmadi"
                        description={
                            searchTerm || selectedFacultyFilter !== 'all' || selectedSpecialityFilter !== 'all'
                                ? "Tanlangan filtrlarga mos guruh topilmadi."
                                : "Hozircha guruh qo'shilmagan."
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
                                    <span>Guruh Nomi</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs hidden lg:table-cell">Fakultet / Mutaxassislik</TableHead>
                            <TableHead className="text-center font-bold text-xs">HEMIS Kodi</TableHead>
                            <TableHead className="text-center font-bold text-xs">Ta'lim Shakli</TableHead>
                            <TableHead
                                onClick={() => handleSort('course')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>Bosqich</span>
                                    {renderSortIcon('course')}
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
                        {sortedGroups.map((group, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const isActive = group.is_active !== false;
                            const specName = getSpecialityName(group.speciality_id);

                            return (
                                <TableRow
                                    key={group.id}
                                    onClick={() => navigate(`/students?group_id=${group.id}`)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Guruh Nomi */}
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                {group.name}
                                            </span>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <ExternalSourceBadge row={group} />
                                                <InactiveBadge row={group} />
                                                <HiddenBadge row={group} />
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Fakultet / Mutaxassislik */}
                                    <TableCell className="hidden lg:table-cell">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-medium text-foreground">
                                                {getFacultyName(group.faculty_id)}
                                            </span>
                                            {specName && (
                                                <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                                    {specName}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* HEMIS Kodi */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground border border-border/80">
                                            {group.external_source ? `ID: ${group.id}` : `GRP-${group.id}`}
                                        </span>
                                    </TableCell>

                                    {/* Ta'lim Shakli */}
                                    <TableCell className="text-center">
                                        {renderEducationFormChip(group.education_shape)}
                                    </TableCell>

                                    {/* Kurs / Bosqich */}
                                    <TableCell className="text-center">
                                        {renderCourseBadge(group.course)}
                                    </TableCell>

                                    {/* Talabalar Soni */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[32px] rounded-lg bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {group.student_count ?? '—'}
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
                                        {renderActions(group)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {sortedGroups.map((group) => (
                        <CatalogCard
                            key={group.id}
                            id={group.id}
                            title={group.name}
                            subtitle={
                                <div className="flex flex-col gap-1">
                                    <span className="badge badge-primary text-xs w-fit">
                                        {getFacultyName(group.faculty_id)}
                                    </span>
                                    <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                        <span>{group.education_shape || 'Guruh'}</span>
                                        <ExternalSourceBadge row={group} />
                                        <InactiveBadge row={group} />
                                        <HiddenBadge row={group} />
                                    </span>
                                </div>
                            }
                            onClick={() => navigate(`/students?group_id=${group.id}`)}
                            actions={renderActions(group)}
                            metrics={[
                                { label: 'Bosqich', value: group.course ? `${group.course}-kurs` : '—' },
                                { label: 'Talaba', value: group.student_count ?? '—', accent: true },
                            ]}
                        />
                    ))}
                </CatalogGrid>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    isLoading={isGroupsLoading}
                />
            )}

            {/* Modals */}
            {isModalOpen && (
                <GroupModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    group={selectedGroup}
                    faculties={faculties}
                    defaultFacultyId={facultyIdNum}
                    specialities={specialities}
                    defaultSpecialityId={specialityIdNum}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        refetch();
                    }}
                />
            )}

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCascadeWarnings([]);
                    setGroupToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Guruhni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                Diqqat! Ushbu guruhni o'chirish quyidagi ma'lumotlarni ham o'zgartiradi:
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
                        `Siz haqiqatan ham "${groupToDelete?.name}" guruhini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default GroupsPage;
