import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import {
    Plus,
    Pencil,
    Trash2,
    ArrowRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { HiddenBadge, ShowHiddenSwitch, VisibilityButton } from '@/components/common/VisibilityControls';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { facultyService, type Faculty, type FacultyStats } from '@/services/facultyService';
import { kafedraService, type Kafedra } from '@/services/kafedraService';
import { specialityService, type Speciality } from '@/services/specialityService';
import { groupService, type Group } from '@/services/groupService';
import { studentService, type Student } from '@/services/studentService';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { FacultyModal } from '@/components/faculty/FacultyModal';
import { FacultyKafedrasView } from '@/components/faculty/FacultyKafedrasView';
import { KafedraSpecialitiesView } from '@/components/faculty/KafedraSpecialitiesView';
import { SpecialityGroupsView } from '@/components/faculty/SpecialityGroupsView';
import { GroupStudentsView } from '@/components/faculty/GroupStudentsView';
import { StudentDetailView } from '@/components/faculty/StudentDetailView';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard } from '@/components/catalog/CatalogCard';
import { tileFor, initialsOf } from '@/lib/avatarTiles';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

type SortField = 'name' | 'kafedra_count' | 'speciality_count' | 'student_count';
type SortOrder = 'asc' | 'desc';

export const FacultyPage = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Root Level 1 Data
    const [faculties, setFaculties] = useState<Faculty[]>([]);
    const [stats, setStats] = useState<Map<number, FacultyStats>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    // Yashirilganlarni koʻrsatish — faqat adminda maʼnoga ega.
    const [showHidden, setShowHidden] = useState(false);
    const [isError, setIsError] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [facultyToDelete, setFacultyToDelete] = useState<Faculty | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const pageSize = 15;

    // Resolved Hierarchy Entity States for deep links / refreshing
    const [resolvedFaculty, setResolvedFaculty] = useState<Faculty | null>(null);
    const [resolvedKafedra, setResolvedKafedra] = useState<Kafedra | null>(null);
    const [resolvedSpeciality, setResolvedSpeciality] = useState<Speciality | null>(null);
    const [resolvedGroup, setResolvedGroup] = useState<Group | null>(null);
    const [resolvedStudent, setResolvedStudent] = useState<Student | null>(null);
    const [isResolvingHierarchy, setIsResolvingHierarchy] = useState(false);

    // Parse URL hierarchy
    const pathParts = useMemo(() => {
        const path = location.pathname.replace(/^\/faculties\/?/, '');
        const segs = path.split('/').filter(Boolean);
        return segs;
    }, [location.pathname]);

    // Determine current view level based on URL segments
    const hierarchyLevel = useMemo(() => {
        if (pathParts.length === 0) return 'faculties';
        // /faculties/:facultyId
        if (pathParts.length === 1 || (pathParts.length === 2 && pathParts[1] === 'kafedras')) {
            return 'kafedras';
        }
        // /faculties/:facultyId/kafedras/:kafedraId
        if (pathParts.length === 3 || (pathParts.length === 4 && pathParts[3] === 'specialities')) {
            return 'specialities';
        }
        // /faculties/:facultyId/kafedras/:kafedraId/specialities/:specialityId
        if (pathParts.length === 5 || (pathParts.length === 6 && pathParts[5] === 'groups')) {
            return 'groups';
        }
        // /faculties/:facultyId/kafedras/:kafedraId/specialities/:specialityId/groups/:groupId
        if (pathParts.length === 7 || (pathParts.length === 8 && pathParts[7] === 'students')) {
            return 'students';
        }
        // /faculties/:facultyId/.../students/:studentId
        if (pathParts.length >= 9) {
            return 'student-detail';
        }
        return 'faculties';
    }, [pathParts]);

    // Auto-resolve hierarchy entities if accessed directly via URL or refreshed
    useEffect(() => {
        const state = location.state as any;

        const resolve = async () => {
            if (pathParts.length === 0) {
                setResolvedFaculty(null);
                setResolvedKafedra(null);
                setResolvedSpeciality(null);
                setResolvedGroup(null);
                setResolvedStudent(null);
                return;
            }

            setIsResolvingHierarchy(true);
            try {
                const facId = Number(pathParts[0]);
                if (facId) {
                    if (state?.faculty?.id === facId) {
                        setResolvedFaculty(state.faculty);
                    } else if (!resolvedFaculty || resolvedFaculty.id !== facId) {
                        const f = await facultyService.getFacultyById(facId);
                        setResolvedFaculty(f);
                    }
                }

                if (pathParts.length >= 3) {
                    const kafId = Number(pathParts[2]);
                    if (kafId) {
                        if (state?.kafedra?.id === kafId) {
                            setResolvedKafedra(state.kafedra);
                        } else if (!resolvedKafedra || resolvedKafedra.id !== kafId) {
                            const k = await kafedraService.getKafedraById(kafId);
                            setResolvedKafedra(k);
                        }
                    }
                }

                if (pathParts.length >= 5) {
                    const specId = Number(pathParts[4]);
                    if (specId) {
                        if (state?.speciality?.id === specId) {
                            setResolvedSpeciality(state.speciality);
                        } else if (!resolvedSpeciality || resolvedSpeciality.id !== specId) {
                            const s = await specialityService.getSpecialityById(specId);
                            setResolvedSpeciality(s);
                        }
                    }
                }

                if (pathParts.length >= 7) {
                    const grpId = Number(pathParts[6]);
                    if (grpId) {
                        if (state?.group?.id === grpId) {
                            setResolvedGroup(state.group);
                        } else if (!resolvedGroup || resolvedGroup.id !== grpId) {
                            const g = await groupService.getGroupById(grpId);
                            setResolvedGroup(g);
                        }
                    }
                }

                if (pathParts.length >= 9) {
                    const studId = Number(pathParts[8]);
                    if (studId) {
                        if (state?.student?.id === studId) {
                            setResolvedStudent(state.student);
                        } else if (!resolvedStudent || resolvedStudent.id !== studId) {
                            const st = await studentService.getStudentById(studId);
                            setResolvedStudent(st);
                        }
                    }
                }
            } catch (err) {
                logger.error('Failed to resolve organization hierarchy entity', err);
            } finally {
                setIsResolvingHierarchy(false);
            }
        };

        void resolve();
    }, [pathParts, location.state]);

    // Fetch Level 1 (Faculties)
    const fetchData = async () => {
        try {
            setIsLoading(true);
            setIsError(false);
            const [data, statsList] = await Promise.all([
                facultyService.getFaculties(currentPage, pageSize, debouncedSearch, showHidden),
                facultyService.getFacultyStats().catch(() => [] as FacultyStats[]),
            ]);
            setFaculties(data.faculties);
            setStats(new Map(statsList.map((s) => [s.faculty_id, s])));
            setTotalPages(Math.ceil(data.total / pageSize) || 1);
        } catch (error) {
            logger.error('Failed to fetch faculties', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        if (hierarchyLevel === 'faculties') {
            void fetchData();
        }
    }, [currentPage, debouncedSearch, hierarchyLevel, showHidden]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const sortedFaculties = useMemo(() => {
        return [...faculties].sort((a, b) => {
            const statA = stats.get(a.id);
            const statB = stats.get(b.id);
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sortField === 'kafedra_count') {
                valA = statA?.kafedra_count ?? 0;
                valB = statB?.kafedra_count ?? 0;
            } else if (sortField === 'speciality_count') {
                valA = statA?.speciality_count ?? 0;
                valB = statB?.speciality_count ?? 0;
            } else if (sortField === 'student_count') {
                valA = statA?.student_count ?? 0;
                valB = statB?.student_count ?? 0;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [faculties, sortField, sortOrder, stats]);

    const handleDeleteClick = (faculty: Faculty) => {
        setFacultyToDelete(faculty);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!facultyToDelete) return;
        try {
            await facultyService.deleteFaculty(facultyToDelete.id, cascadeWarnings.length > 0);
            setFaculties((prev) => prev.filter((item) => item.id !== facultyToDelete.id));
            toast.success("Fakultet o'chirildi");
            setIsDeleteModalOpen(false);
            setFacultyToDelete(null);
            setCascadeWarnings([]);
        } catch (error: any) {
            if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                setCascadeWarnings(error.response.data.detail.warnings || []);
            } else {
                logger.error("Fakultetni o'chirishda xatolik", error);
                toast.error("O'chirishda xatolik yuz berdi");
                setIsDeleteModalOpen(false);
                setFacultyToDelete(null);
                setCascadeWarnings([]);
            }
        }
    };

    const handleSuccess = (savedFaculty?: Faculty) => {
        setIsModalOpen(false);
        if (savedFaculty) {
            if (selectedFaculty) {
                setFaculties((prev) => prev.map((f) => (f.id === savedFaculty.id ? savedFaculty : f)));
            } else {
                setFaculties((prev) => [...prev, savedFaculty]);
            }
        } else {
            fetchData();
        }
    };

    // Navigation Handlers with URL synchronization
    const navigateToKafedras = (faculty: Faculty) => {
        setResolvedFaculty(faculty);
        navigate(`/faculties/${faculty.id}/kafedras`, { state: { faculty } });
    };

    const navigateToSpecialities = (faculty: Faculty, kafedra: Kafedra) => {
        setResolvedFaculty(faculty);
        setResolvedKafedra(kafedra);
        navigate(`/faculties/${faculty.id}/kafedras/${kafedra.id}/specialities`, {
            state: { faculty, kafedra },
        });
    };

    const navigateToGroups = (faculty: Faculty, kafedra: Kafedra, speciality: Speciality) => {
        setResolvedFaculty(faculty);
        setResolvedKafedra(kafedra);
        setResolvedSpeciality(speciality);
        navigate(`/faculties/${faculty.id}/kafedras/${kafedra.id}/specialities/${speciality.id}/groups`, {
            state: { faculty, kafedra, speciality },
        });
    };

    const navigateToStudents = (faculty: Faculty, kafedra: Kafedra, speciality: Speciality, group: Group) => {
        setResolvedFaculty(faculty);
        setResolvedKafedra(kafedra);
        setResolvedSpeciality(speciality);
        setResolvedGroup(group);
        navigate(
            `/faculties/${faculty.id}/kafedras/${kafedra.id}/specialities/${speciality.id}/groups/${group.id}/students`,
            { state: { faculty, kafedra, speciality, group } }
        );
    };

    const navigateToStudentDetail = (
        faculty: Faculty,
        kafedra: Kafedra,
        speciality: Speciality,
        group: Group,
        student: Student
    ) => {
        setResolvedFaculty(faculty);
        setResolvedKafedra(kafedra);
        setResolvedSpeciality(speciality);
        setResolvedGroup(group);
        setResolvedStudent(student);
        navigate(
            `/faculties/${faculty.id}/kafedras/${kafedra.id}/specialities/${speciality.id}/groups/${group.id}/students/${student.id}`,
            { state: { faculty, kafedra, speciality, group, student } }
        );
    };

    // Render Sub-Level Views
    if (hierarchyLevel === 'student-detail') {
        if (isResolvingHierarchy && !resolvedStudent) {
            return <div className="p-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>;
        }
        if (resolvedFaculty && resolvedGroup && resolvedStudent) {
            return (
                <StudentDetailView
                    faculty={resolvedFaculty}
                    group={resolvedGroup}
                    student={resolvedStudent}
                    onBackToFaculties={() => navigate('/faculties')}
                    onBackToGroups={() =>
                        resolvedKafedra && resolvedSpeciality
                            ? navigateToGroups(resolvedFaculty, resolvedKafedra, resolvedSpeciality)
                            : navigate(`/faculties/${resolvedFaculty.id}/kafedras`)
                    }
                    onBackToStudents={() =>
                        resolvedKafedra && resolvedSpeciality
                            ? navigateToStudents(resolvedFaculty, resolvedKafedra, resolvedSpeciality, resolvedGroup)
                            : navigate(`/faculties/${resolvedFaculty.id}/kafedras`)
                    }
                />
            );
        }
    }

    if (hierarchyLevel === 'students') {
        if (isResolvingHierarchy && !resolvedGroup) {
            return <div className="p-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>;
        }
        if (resolvedFaculty && resolvedGroup) {
            return (
                <GroupStudentsView
                    faculty={resolvedFaculty}
                    kafedra={resolvedKafedra || undefined}
                    speciality={resolvedSpeciality || undefined}
                    group={resolvedGroup}
                    onBackToFaculties={() => navigate('/faculties')}
                    onBackToKafedras={() => navigate(`/faculties/${resolvedFaculty.id}/kafedras`)}
                    onBackToSpecialities={() =>
                        resolvedKafedra ? navigateToSpecialities(resolvedFaculty, resolvedKafedra) : undefined
                    }
                    onBackToGroups={() =>
                        resolvedKafedra && resolvedSpeciality
                            ? navigateToGroups(resolvedFaculty, resolvedKafedra, resolvedSpeciality)
                            : navigate(`/faculties/${resolvedFaculty.id}/kafedras`)
                    }
                    onOpenStudent={(student) =>
                        resolvedKafedra && resolvedSpeciality
                            ? navigateToStudentDetail(resolvedFaculty, resolvedKafedra, resolvedSpeciality, resolvedGroup, student)
                            : undefined
                    }
                />
            );
        }
    }

    if (hierarchyLevel === 'groups') {
        if (isResolvingHierarchy && !resolvedSpeciality) {
            return <div className="p-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>;
        }
        if (resolvedFaculty && resolvedKafedra && resolvedSpeciality) {
            return (
                <SpecialityGroupsView
                    faculty={resolvedFaculty}
                    kafedra={resolvedKafedra}
                    speciality={resolvedSpeciality}
                    onBack={() => navigateToSpecialities(resolvedFaculty, resolvedKafedra)}
                    onOpenGroup={(group) =>
                        navigateToStudents(resolvedFaculty, resolvedKafedra, resolvedSpeciality, group)
                    }
                />
            );
        }
    }

    if (hierarchyLevel === 'specialities') {
        if (isResolvingHierarchy && !resolvedKafedra) {
            return <div className="p-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>;
        }
        if (resolvedFaculty && resolvedKafedra) {
            return (
                <KafedraSpecialitiesView
                    faculty={resolvedFaculty}
                    kafedra={resolvedKafedra}
                    onBack={() => navigateToKafedras(resolvedFaculty)}
                    onOpenSpeciality={(speciality) =>
                        navigateToGroups(resolvedFaculty, resolvedKafedra, speciality)
                    }
                />
            );
        }
    }

    if (hierarchyLevel === 'kafedras') {
        if (isResolvingHierarchy && !resolvedFaculty) {
            return <div className="p-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>;
        }
        if (resolvedFaculty) {
            return (
                <FacultyKafedrasView
                    faculty={resolvedFaculty}
                    onBack={() => navigate('/faculties')}
                    onOpenKafedra={(kafedra) => navigateToSpecialities(resolvedFaculty, kafedra)}
                />
            );
        }
    }

    // Level 1: Faculties Table & Grid View
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

    const renderActions = (faculty: Faculty) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {!isExternal(faculty) && (
                <>
                    <PermissionGate permission="update:faculty">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Tahrirlash"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFaculty(faculty);
                                setIsModalOpen(true);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:faculty">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                            title="O'chirish"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(faculty);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
            <VisibilityButton
                entity="faculty"
                row={faculty}
                label={faculty.name}
                onDone={fetchData}
                className="h-8 w-8 p-0"
            />
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary gap-1"
                onClick={() => navigateToKafedras(faculty)}
            >
                <span>Kafedralar</span>
                <ArrowRight className="h-3.5 w-3.5" />
            </Button>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Unified Dynamic Breadcrumbs */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Fakultetlar' }]}
                title="Fakultetlar"
                description="Universitet tuzilmasi va barcha fakultetlar ro'yxati"
            />

            {/* Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Fakultet nomi bo'yicha qidirish..."
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                totalCount={faculties.length}
                totalLabel="Fakultetlar"
                extraFilters={<ShowHiddenSwitch value={showHidden} onChange={setShowHidden} />}
                actions={
                    <PermissionGate permission="create:faculty">
                        <Button
                            size="sm"
                            onClick={() => {
                                setSelectedFaculty(null);
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
                <ErrorState onRetry={fetchData} />
            ) : isLoading ? (
                viewMode === 'table' ? (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }, (_, i) => (
                            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
                        ))}
                    </div>
                )
            ) : sortedFaculties.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={7}
                        title="Fakultetlar topilmadi"
                        description={
                            searchTerm
                                ? `"${searchTerm}" qidiruviga mos fakultet topilmadi.`
                                : "Hozircha universitetda fakultetlar qo'shilmagan."
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
                                    <span>Fakultet Nomi</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('kafedra_count')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>Kafedralar</span>
                                    {renderSortIcon('kafedra_count')}
                                </div>
                            </TableHead>
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
                        {sortedFaculties.map((faculty, index) => {
                            const s = stats.get(faculty.id);
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const isActive = faculty.is_active !== false;

                            return (
                                <TableRow
                                    key={faculty.id}
                                    onClick={() => navigateToKafedras(faculty)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Fakultet Nomi */}
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                    tileFor(faculty.id)
                                                )}
                                            >
                                                {initialsOf(faculty.name)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                    {faculty.name}
                                                </p>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                    <ExternalSourceBadge row={faculty} />
                                                    <InactiveBadge row={faculty} />
                                                    <HiddenBadge row={faculty} />
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Kafedralar Soni */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[28px] rounded-lg bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                                            {s ? s.kafedra_count : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Mutaxassisliklar Soni */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[28px] rounded-lg bg-purple-500/10 px-2 py-0.5 font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
                                            {s ? s.speciality_count : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Talabalar Soni */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[32px] rounded-lg bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {s ? s.student_count : '—'}
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
                                        {renderActions(faculty)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {sortedFaculties.map((faculty) => {
                        const s = stats.get(faculty.id);
                        return (
                            <CatalogCard
                                key={faculty.id}
                                id={faculty.id}
                                title={faculty.name}
                                subtitle={
                                    <span className="inline-flex flex-wrap items-center gap-1.5">
                                        <span>Fakultet</span>
                                        <ExternalSourceBadge row={faculty} />
                                        <InactiveBadge row={faculty} />
                                        <HiddenBadge row={faculty} />
                                    </span>
                                }
                                metrics={[
                                    { label: 'Kafedra', value: s ? s.kafedra_count : '—' },
                                    { label: 'Mutaxassislik', value: s ? s.speciality_count : '—' },
                                    { label: 'Talaba', value: s ? s.student_count : '—', accent: true },
                                ]}
                                actions={renderActions(faculty)}
                                onClick={() => navigateToKafedras(faculty)}
                            />
                        );
                    })}
                </div>
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
            <FacultyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                faculty={selectedFaculty}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCascadeWarnings([]);
                    setFacultyToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Fakultetni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                Diqqat! Ushbu fakultetni o'chirish quyidagi ma'lumotlarni ham o'chiradi:
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
                        `Siz haqiqatan ham "${facultyToDelete?.name}" fakultetini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default FacultyPage;
