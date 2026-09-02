import { toast } from 'sonner';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
    Plus,
    Pencil,
    Trash2,
    BookOpen,
    ArrowRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useCourses, useDeleteCourse } from '@/hooks/useCourses';
import { useSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers } from '@/hooks/useTeachers';
import type { Course } from '@/services/courseService';
import { CourseModal } from '@/components/courses/CourseModal';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Combobox } from '@/components/ui/Combobox';

type SortField = 'subject' | 'teacher' | 'semester';
type SortOrder = 'asc' | 'desc';

export const CoursesPage = () => {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const isAdmin = user?.roles?.some((role) => role.name.toLowerCase() === 'admin') ?? false;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 15;

    // Ko'rinish almashtirgichi asboblar panelidan olib tashlangan,

    // shuning uchun o'zgartiruvchi yo'q — qiymat boshlang'ich holatda qoladi.

    const [viewMode] = useState<'table' | 'grid'>('table');

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [filterSubjectId, setFilterSubjectId] = useState<string>('all');
    const [filterGroupId, setFilterGroupId] = useState<string>('all');
    const [filterTeacherId, setFilterTeacherId] = useState<string>('all');
    const [sortField, setSortField] = useState<SortField>('subject');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const parsedSubjectId = filterSubjectId !== 'all' && filterSubjectId ? Number(filterSubjectId) : undefined;
    const parsedGroupId = filterGroupId !== 'all' && filterGroupId ? Number(filterGroupId) : undefined;
    const parsedTeacherId = filterTeacherId !== 'all' && filterTeacherId ? Number(filterTeacherId) : undefined;

    const {
        data: coursesData,
        isLoading: isCoursesLoading,
        isError: isCoursesError,
        refetch,
    } = useCourses(currentPage, pageSize, parsedTeacherId, parsedSubjectId, parsedGroupId);

    const { data: allSubjectsData } = useSubjects(1, 500, '', undefined, hasPermission('read:subject'));
    const { data: allGroupsData } = useGroups(1, 500, '', undefined, undefined, hasPermission('read:group'));
    const { data: allTeachersData } = useTeachers(1, 500, undefined, isAdmin && hasPermission('read:teacher'));

    const deleteCourseMutation = useDeleteCourse();

    const rawCourses = coursesData?.courses || [];
    const totalPages = coursesData ? Math.ceil(coursesData.total / pageSize) : 1;
    const totalCount = coursesData?.total ?? rawCourses.length;

    const allSubjects = allSubjectsData?.subjects || [];
    const allGroups = allGroupsData?.groups || [];
    const allTeachers = allTeachersData?.teachers || [];

    const subjectOptions = useMemo(() => {
        const list = allSubjects.map((s) => ({ value: String(s.id), label: s.name }));
        return [{ value: 'all', label: 'Barcha fanlar' }, ...list];
    }, [allSubjects]);

    const groupOptions = useMemo(() => {
        const list = allGroups.map((g) => ({ value: String(g.id), label: g.name }));
        return [{ value: 'all', label: 'Barcha guruhlar' }, ...list];
    }, [allGroups]);

    const teacherOptions = useMemo(() => {
        const list = allTeachers.map((t) => ({
            value: String(t.user_id),
            label: t.full_name || t.user?.username || `ID: ${t.id}`,
        }));
        return [{ value: 'all', label: "Barcha o'qituvchilar" }, ...list];
    }, [allTeachers]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const filteredCourses = useMemo(() => {
        if (!debouncedSearch) return rawCourses;
        const q = debouncedSearch.toLowerCase();
        return rawCourses.filter((c) => {
            const subjectName = (c.subject?.name || '').toLowerCase();
            const teacherName = (c.teacher?.full_name || c.teacher?.username || '').toLowerCase();
            const groupNames = (c.groups || []).map((g) => g.name.toLowerCase()).join(' ');
            return subjectName.includes(q) || teacherName.includes(q) || groupNames.includes(q);
        });
    }, [rawCourses, debouncedSearch]);

    const sortedCourses = useMemo(() => {
        return [...filteredCourses].sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'subject') {
                valA = (a.subject?.name || '').toLowerCase();
                valB = (b.subject?.name || '').toLowerCase();
            } else if (sortField === 'teacher') {
                valA = (a.teacher?.full_name || a.teacher?.username || '').toLowerCase();
                valB = (b.teacher?.full_name || b.teacher?.username || '').toLowerCase();
            } else if (sortField === 'semester') {
                valA = a.semester_number ?? 0;
                valB = b.semester_number ?? 0;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredCourses, sortField, sortOrder]);

    const handleCreateCourse = () => {
        setSelectedCourse(null);
        setIsModalOpen(true);
    };

    const handleEditCourse = (course: Course, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedCourse(course);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (course: Course, e: React.MouseEvent) => {
        e.stopPropagation();
        setCourseToDelete(course);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!courseToDelete) return;
        deleteCourseMutation.mutate(courseToDelete.id, {
            onSuccess: () => {
                toast.success("Kurs o'chirildi");
                setIsDeleteModalOpen(false);
                setCourseToDelete(null);
                refetch();
            },
            onError: () => {
                toast.error("Kursni o'chirishda xatolik yuz berdi");
                setIsDeleteModalOpen(false);
                setCourseToDelete(null);
            },
        });
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

    const renderActions = (course: Course) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 gap-1"
                title="Darslarni ko'rish"
                onClick={() => navigate(`/courses/${course.id}`)}
            >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Darslar</span>
                <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <PermissionGate permission="update:course">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Tahrirlash"
                    onClick={(e) => handleEditCourse(course, e)}
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:course">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                    title="O'chirish"
                    onClick={(e) => handleDeleteClick(course, e)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Unified Breadcrumbs Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Kurslar', onClick: () => {} }]}
                title="O'quv Kurslari"
                description="Fanlar, o'qituvchilar, guruhlar va semestrlar bo'yicha o'quv kurslari"
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Kurs, fan yoki o'qituvchi bo'yicha..."
                totalCount={totalCount}
                totalLabel="Kurslar"
                extraFilters={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-[180px] sm:w-[220px]">
                            <Combobox
                                options={subjectOptions}
                                value={filterSubjectId}
                                onChange={(val) => {
                                    setFilterSubjectId(val);
                                    setCurrentPage(1);
                                }}
                                placeholder="Fan bo'yicha"
                            />
                        </div>
                        <div className="w-[180px] sm:w-[220px]">
                            <Combobox
                                options={groupOptions}
                                value={filterGroupId}
                                onChange={(val) => {
                                    setFilterGroupId(val);
                                    setCurrentPage(1);
                                }}
                                placeholder="Guruh bo'yicha"
                            />
                        </div>
                        {isAdmin && (
                            <div className="w-[180px] sm:w-[220px]">
                                <Combobox
                                    options={teacherOptions}
                                    value={filterTeacherId}
                                    onChange={(val) => {
                                        setFilterTeacherId(val);
                                        setCurrentPage(1);
                                    }}
                                    placeholder="O'qituvchi bo'yicha"
                                />
                            </div>
                        )}
                    </div>
                }
                actions={
                    <PermissionGate permission="create:course">
                        <Button
                            size="sm"
                            onClick={handleCreateCourse}
                            className="h-9 gap-1.5 font-semibold shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Qo'shish</span>
                        </Button>
                    </PermissionGate>
                }
            />

            {/* Content */}
            {isCoursesError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isCoursesLoading ? (
                viewMode === 'table' ? (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <CatalogGrid>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
                        ))}
                    </CatalogGrid>
                )
            ) : sortedCourses.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title="Kurslar topilmadi"
                        description={
                            searchTerm || filterSubjectId !== 'all' || filterGroupId !== 'all'
                                ? "Tanlangan filtrlarga mos kurs topilmadi."
                                : "Hozircha kurslar qo'shilmagan."
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
                                onClick={() => handleSort('subject')}
                                className="group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Fan Nomi</span>
                                    {renderSortIcon('subject')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs">Biriktirilgan Guruhlar</TableHead>
                            <TableHead
                                onClick={() => handleSort('teacher')}
                                className="group cursor-pointer select-none font-bold text-xs hidden md:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>O'qituvchi</span>
                                    {renderSortIcon('teacher')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('semester')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>Semestr</span>
                                    {renderSortIcon('semester')}
                                </div>
                            </TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">Amallar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedCourses.map((course, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const subjectName = course.subject?.name || `Fan #${course.subject_id}`;
                            const teacherName =
                                course.teacher?.full_name ||
                                course.teacher?.username ||
                                'Biriktirilmagan';
                            const groups = course.groups || [];

                            return (
                                <TableRow
                                    key={course.id}
                                    onClick={() => navigate(`/courses/${course.id}`)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Fan Nomi */}
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                {subjectName}
                                            </span>
                                        </div>
                                    </TableCell>

                                    {/* Biriktirilgan Guruhlar */}
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
                                            {groups.length > 0 ? (
                                                groups.map((g) => (
                                                    <span key={g.id} className="badge badge-primary text-xs">
                                                        {g.name}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">Guruh yo'q</span>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* O'qituvchi */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="text-sm font-medium text-foreground">
                                            {teacherName}
                                        </span>
                                    </TableCell>

                                    {/* Semestr */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground border border-border/80">
                                            {course.semester_number ? `${course.semester_number}-semestr` : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Amallar */}
                                    <TableCell className="text-right pr-4">
                                        {renderActions(course)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {sortedCourses.map((course) => {
                        const subjectName = course.subject?.name || `Fan #${course.subject_id}`;
                        const teacherName = course.teacher?.full_name || course.teacher?.username || '—';
                        return (
                            <CatalogCard
                                key={course.id}
                                id={course.id}
                                title={subjectName}
                                subtitle={
                                    <div className="flex flex-col gap-1 mt-0.5">
                                        <span className="text-xs text-muted-foreground">{teacherName}</span>
                                        <div className="flex flex-wrap gap-1">
                                            {(course.groups || []).map((g) => (
                                                <span key={g.id} className="badge badge-primary text-[10px]">
                                                    {g.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                }
                                metrics={[
                                    { label: 'Semestr', value: course.semester_number ? `${course.semester_number}` : '—' },
                                    { label: 'Guruh', value: `${(course.groups || []).length} ta` },
                                ]}
                                actions={renderActions(course)}
                                onClick={() => navigate(`/courses/${course.id}`)}
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
                    isLoading={isCoursesLoading}
                />
            )}

            {/* Course Modal */}
            <CourseModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                course={selectedCourse}
                onSuccess={() => {
                    setIsModalOpen(false);
                    refetch();
                }}
            />

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCourseToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Kursni o'chirish"
                description="Ushbu kursni o'chirishni tasdiqlaysizmi? Kursga tegishli darslar ham o'chirilishi mumkin."
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default CoursesPage;
