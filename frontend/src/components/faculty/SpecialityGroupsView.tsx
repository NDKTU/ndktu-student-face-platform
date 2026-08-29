import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Users, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, XCircle } from 'lucide-react';
import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import type { Speciality } from '@/services/specialityService';
import { groupService, type Group } from '@/services/groupService';
import { useDeleteGroup } from '@/hooks/useGroups';
import { OrganizationBreadcrumbs } from './OrganizationBreadcrumbs';
import { OrganizationToolbar, FilterChipGroup } from './OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { GroupModal } from '@/components/group/GroupModal';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

type EducationFormFilter = 'all' | 'Kunduzgi' | 'Sirtqi' | 'Kechki' | 'Masofaviy';
type CourseLevelFilter = 'all' | '1' | '2' | '3' | '4';
type SortField = 'name' | 'course' | 'student_count';
type SortOrder = 'asc' | 'desc';

interface Props {
    faculty: Faculty;
    kafedra: Kafedra;
    speciality: Speciality;
    onBack: () => void;
    onOpenGroup: (group: Group) => void;
}

export const SpecialityGroupsView = ({
    faculty,
    kafedra,
    speciality,
    onBack,
    onOpenGroup,
}: Props) => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [search, setSearch] = useState('');
    const [educationFormFilter, setEducationFormFilter] = useState<EducationFormFilter>('all');
    const [courseLevelFilter, setCourseLevelFilter] = useState<CourseLevelFilter>('all');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const pageSize = 15;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    const deleteGroupMutation = useDeleteGroup();

    const load = async () => {
        setIsLoading(true);
        setIsError(false);
        try {
            const response = await groupService.getGroups(1, 1000, '', undefined, faculty.id, speciality.id);
            setGroups(response.groups);
        } catch {
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [faculty.id, speciality.id]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('uz');
        return groups.filter((group) => {
            const matchesSearch =
                !query ||
                group.name.toLocaleLowerCase('uz').includes(query) ||
                (group.external_source && group.external_source.toLowerCase().includes(query));

            const matchesForm =
                educationFormFilter === 'all' ||
                (group.education_shape && group.education_shape.toLowerCase().includes(educationFormFilter.toLowerCase()));

            const matchesCourse =
                courseLevelFilter === 'all' ||
                (group.course !== undefined && group.course !== null && String(group.course) === courseLevelFilter);

            return matchesSearch && matchesForm && matchesCourse;
        });
    }, [search, educationFormFilter, courseLevelFilter, groups]);

    const sorted = useMemo(() => {
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

    const totalPages = Math.ceil(sorted.length / pageSize) || 1;
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [sorted, currentPage, pageSize]);

    const closeDeleteDialog = () => {
        setGroupToDelete(null);
        setCascadeWarnings([]);
    };

    const handleConfirmDelete = () => {
        if (!groupToDelete) return;
        deleteGroupMutation.mutate(
            { id: groupToDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Guruh o'chirildi");
                    closeDeleteDialog();
                    void load();
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        toast.error("O'chirishda xatolik yuz berdi");
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
                                setGroupToDelete(group);
                                setCascadeWarnings([]);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary gap-1"
                onClick={() => onOpenGroup(group)}
            >
                <Users className="h-3.5 w-3.5" />
                <span>Talabalar</span>
            </Button>
        </div>
    );

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

    return (
        <div className="space-y-5">
            {/* Unified Dynamic Breadcrumbs */}
            <OrganizationBreadcrumbs
                items={[
                    { label: 'Fakultetlar', onClick: onBack },
                    { label: faculty.name, onClick: onBack },
                    { label: kafedra.name, onClick: onBack },
                    { label: speciality.name },
                ]}
                onBack={onBack}
                title={`${speciality.name} — guruhlar`}
                description={`${faculty.name} · ${kafedra.name} · Guruhlar ro'yxati va ta'lim shakllari`}
            />

            {/* Toolbar with Search, Education Form Chips, Course Chips, and View Toggle */}
            <OrganizationToolbar
                search={search}
                onSearchChange={(val) => {
                    setSearch(val);
                    setCurrentPage(1);
                }}
                searchPlaceholder="Guruh nomi yoki HEMIS kodi..."
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                totalCount={filtered.length}
                totalLabel="Guruhlar"
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
            {isError ? (
                <ErrorState onRetry={load} />
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
                        title="Guruhlar topilmadi"
                        description={
                            search || educationFormFilter !== 'all' || courseLevelFilter !== 'all'
                                ? "Tanlangan filtrlarga mos guruh topilmadi."
                                : "Ushbu mutaxassislikda hali guruhlar mavjud emas."
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
                        {paginatedItems.map((group, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const isActive = group.is_active !== false;

                            return (
                                <TableRow
                                    key={group.id}
                                    onClick={() => onOpenGroup(group)}
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
                                            </div>
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
                    {paginatedItems.map((group) => (
                        <CatalogCard
                            key={group.id}
                            id={group.id}
                            title={group.name}
                            subtitle={
                                <span className="flex flex-wrap items-center gap-1.5">
                                    <span>{group.education_shape || 'Guruh'}</span>
                                    <ExternalSourceBadge row={group} />
                                    <InactiveBadge row={group} />
                                </span>
                            }
                            onClick={() => onOpenGroup(group)}
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
                    isLoading={isLoading}
                />
            )}

            {/* Modals */}
            {isModalOpen && (
                <GroupModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    group={selectedGroup}
                    faculties={[faculty]}
                    defaultFacultyId={faculty.id}
                    specialities={[speciality]}
                    defaultSpecialityId={speciality.id}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        void load();
                    }}
                />
            )}

            <ConfirmDialog
                isOpen={Boolean(groupToDelete)}
                onClose={closeDeleteDialog}
                onConfirm={handleConfirmDelete}
                title="Guruhni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="mt-2 space-y-2 text-left">
                            <p className="font-medium text-destructive">
                                Diqqat! Ushbu guruhni o'chirish quyidagilarga ta'sir qiladi:
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
                        `Siz haqiqatan ham "${groupToDelete?.name}" guruhini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};
