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
    Archive,
} from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useCourses, useDeleteCourse } from '@/hooks/useCourses';
import { useSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTeachers } from '@/hooks/useTeachers';
import { useCatalogView } from '@/hooks/useCatalogView';
import type { Course } from '@/services/courseService';
import { CourseModal } from '@/components/courses/CourseModal';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Combobox } from '@/components/ui/Combobox';
import { COURSE_TYPE_OPTIONS, courseTypeLabel, type CourseType } from '@/services/courseTypes';
import { SEMESTER_OPTIONS } from '@/utils/semester';
import { FILTER_PAGE_SIZE, withSelected, type FilterOption } from '@/utils/filterOptions';
import { useTranslation } from 'react-i18next';
import { useUrlState, useUrlNumberState } from '@/hooks/useUrlState';

type SortField = 'subject' | 'teacher' | 'semester' | 'type';
type SortOrder = 'asc' | 'desc';

export const CoursesPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const isAdmin = user?.roles?.some((role) => role.name.toLowerCase() === 'admin') ?? false;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
    const [currentPage, setCurrentPage] = useUrlNumberState('page', 1);
    const pageSize = 15;

    // Ko'rinish almashtirgichi asboblar panelidan olib tashlangan,

    // shuning uchun o'zgartiruvchi yo'q — qiymat boshlang'ich holatda qoladi.

    // Telefonda (md dan past) jadval oʻrniga kartochkalar: hooknig oʻzi
    // ekran kengligiga qarab tanlaydi (hooks/useCatalogView.ts).
    const viewMode = useCatalogView();

    // Filtrlar URL'da: yangilash va «Orqaga» ularni saqlaydi.
    const [searchTerm, setSearchTerm] = useUrlState<string>('q', '');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [filterSubjectId, setFilterSubjectId] = useUrlState<string>('subject', 'all');
    const [filterGroupId, setFilterGroupId] = useUrlState<string>('group', 'all');
    const [filterTeacherId, setFilterTeacherId] = useUrlState<string>('teacher', 'all');
    const [filterCourseType, setFilterCourseType] = useUrlState<string>('type', 'all');
    // Semestr — kuzgi (1) yoki bahorgi (2). Filtrlash serverda: `semester_number`
    // `CourseListRequest` da allaqachon bor, sahifada esa faqat saralash bor edi.
    const [filterSemester, setFilterSemester] = useUrlState<string>('semester', 'all');
    // Arxiv — EPOS yuklamasidan yo'qolgan kurslar. Ular o'chirilmaydi (jurnal
    // ularga bog'langan), lekin faol ro'yxatda ham turmasligi kerak.
    const [showArchived, setShowArchived] = useState(false);
    const [sortField, setSortField] = useUrlState<SortField>('sort', 'subject');
    const [sortOrder, setSortOrder] = useUrlState<SortOrder>('order', 'asc');

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
    const parsedCourseType =
        filterCourseType !== 'all' && filterCourseType ? (filterCourseType as CourseType) : undefined;
    const parsedSemester = filterSemester !== 'all' && filterSemester ? Number(filterSemester) : undefined;

    const {
        data: coursesData,
        isLoading: isCoursesLoading,
        isError: isCoursesError,
        refetch,
    } = useCourses({
        page: currentPage,
        limit: pageSize,
        teacherId: parsedTeacherId,
        subjectId: parsedSubjectId,
        groupId: parsedGroupId,
        courseType: parsedCourseType,
        semesterNumber: parsedSemester,
        isActive: showArchived ? false : undefined,
        search: debouncedSearch,
        sortBy: sortField,
        order: sortOrder,
    });

    // Filtrlar serverda qidiradi, mijozda emas. Ilgari birinchi 500 satr
    // yuklanib, ro'yxat o'sha ichida filtrlanardi — bazada esa 650 guruh,
    // 819 o'qituvchi va 2935 fan bor, ya'ni kerakli qator ko'pincha
    // ro'yxatga umuman tushmasdi va «Ma'lumot topilmadi» chiqardi.
    const [subjectQuery, setSubjectQuery] = useState('');
    const [groupQuery, setGroupQuery] = useState('');
    const [teacherQuery, setTeacherQuery] = useState('');
    const debouncedSubjectQuery = useDebouncedValue(subjectQuery);
    const debouncedGroupQuery = useDebouncedValue(groupQuery);
    const debouncedTeacherQuery = useDebouncedValue(teacherQuery);

    const { data: allSubjectsData } = useSubjects(
        1,
        FILTER_PAGE_SIZE,
        debouncedSubjectQuery,
        undefined,
        hasPermission('read:subject'),
    );
    const { data: allGroupsData } = useGroups(
        1,
        FILTER_PAGE_SIZE,
        debouncedGroupQuery,
        undefined,
        undefined,
        hasPermission('read:group'),
    );
    const { data: allTeachersData } = useTeachers(
        1,
        FILTER_PAGE_SIZE,
        debouncedTeacherQuery || undefined,
        isAdmin && hasPermission('read:teacher'),
    );

    // Tanlangan qiymat qidiruv natijasidan tushib qolishi mumkin — u holda
    // Combobox nom o'rniga placeholder ko'rsatardi, go'yo filtr olib
    // tashlangandek. Shuning uchun tanlov alohida eslab qolinadi.
    const [selectedSubjectOption, setSelectedSubjectOption] = useState<FilterOption | null>(null);
    const [selectedGroupOption, setSelectedGroupOption] = useState<FilterOption | null>(null);
    const [selectedTeacherOption, setSelectedTeacherOption] = useState<FilterOption | null>(null);

    const deleteCourseMutation = useDeleteCourse();

    const courses = coursesData?.courses || [];
    const totalPages = coursesData ? Math.ceil(coursesData.total / pageSize) : 1;
    const totalCount = coursesData?.total ?? courses.length;

    const allSubjects = allSubjectsData?.subjects || [];
    const allGroups = allGroupsData?.groups || [];
    const allTeachers = allTeachersData?.teachers || [];

    const subjectOptions = useMemo(() => {
        const list = allSubjects.map((s) => ({ value: String(s.id), label: s.name }));
        return [{ value: 'all', label: t('Barcha fanlar') }, ...withSelected(list, selectedSubjectOption)];
    }, [allSubjects, selectedSubjectOption, t]);

    const groupOptions = useMemo(() => {
        const list = allGroups.map((g) => ({ value: String(g.id), label: g.name }));
        return [{ value: 'all', label: t('Barcha guruhlar') }, ...withSelected(list, selectedGroupOption)];
    }, [allGroups, selectedGroupOption, t]);

    const teacherOptions = useMemo(() => {
        const list = allTeachers.map((t) => ({
            value: String(t.user_id),
            label: t.full_name || t.user?.username || `ID: ${t.id}`,
        }));
        return [
            { value: 'all', label: t("Barcha o'qituvchilar") },
            ...withSelected(list, selectedTeacherOption),
        ];
    }, [allTeachers, selectedTeacherOption, t]);

    // Filtrlarning bir qismi serverga ketadi, bir qismi (qidiruv) mijozda
    // ishlaydi — tozalash tugmasi ikkalasini ham nolga qaytaradi.
    const activeFilterCount =
        (searchTerm ? 1 : 0)
        + (filterSubjectId !== 'all' ? 1 : 0)
        + (filterGroupId !== 'all' ? 1 : 0)
        + (filterTeacherId !== 'all' ? 1 : 0)
        + (filterCourseType !== 'all' ? 1 : 0)
        + (filterSemester !== 'all' ? 1 : 0)
        + (showArchived ? 1 : 0);

    const clearFilters = () => {
        setSearchTerm('');
        setFilterSubjectId('all');
        setFilterGroupId('all');
        setFilterTeacherId('all');
        setFilterCourseType('all');
        setFilterSemester('all');
        setShowArchived(false);
        // Combobox tanlangan qiymatni alohida eslab qoladi — u ham tozalanadi,
        // aks holda ro'yxat bo'shab, tanlov nomi ekranda qolib ketardi.
        setSelectedSubjectOption(null);
        setSelectedGroupOption(null);
        setSelectedTeacherOption(null);
        setCurrentPage(1);
    };

    const courseTypeOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha turlar') },
            ...COURSE_TYPE_OPTIONS.map((option) => ({ value: option.value as string, label: option.label })),
        ],
        [t],
    );

    const semesterOptions = useMemo(
        () => [{ value: 'all', label: t('Barcha semestrlar') }, ...SEMESTER_OPTIONS],
        [t],
    );

    const handleSort = (field: SortField) => {
        // Tartib o'zgargach birinchi sahifaga qaytamiz.
        setCurrentPage(1);
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

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
                toast.success(t("Kurs o'chirildi"));
                setIsDeleteModalOpen(false);
                setCourseToDelete(null);
                refetch();
            },
            onError: () => {
                toast.error(t("Kursni o'chirishda xatolik yuz berdi"));
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
                    title={t("Tahrirlash")}
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
                    title={t("O'chirish")}
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
                title={t("O'quv Kurslari")}
                description={t("Fanlar, o'qituvchilar, guruhlar va semestrlar bo'yicha o'quv kurslari")}
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder={t("Kurs, fan yoki o'qituvchi bo'yicha...")}
                totalCount={totalCount}
                totalLabel="Kurslar"
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
                extraFilters={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-full sm:w-[220px]">
                            <Combobox
                                options={subjectOptions}
                                value={filterSubjectId}
                                onSearchChange={setSubjectQuery}
                                onChange={(val) => {
                                    setFilterSubjectId(val);
                                    setSelectedSubjectOption(
                                        subjectOptions.find((o) => o.value === val) ?? null
                                    );
                                    setCurrentPage(1);
                                }}
                                placeholder={t("Fan bo'yicha")}
                                searchPlaceholder={t("Fan nomi...")}
                            />
                        </div>
                        <div className="w-full sm:w-[220px]">
                            <Combobox
                                options={groupOptions}
                                value={filterGroupId}
                                onSearchChange={setGroupQuery}
                                onChange={(val) => {
                                    setFilterGroupId(val);
                                    setSelectedGroupOption(
                                        groupOptions.find((o) => o.value === val) ?? null
                                    );
                                    setCurrentPage(1);
                                }}
                                placeholder={t("Guruh bo'yicha")}
                                searchPlaceholder={t("Guruh nomi...")}
                            />
                        </div>
                        <div className="w-[150px] sm:w-[170px]">
                            <Combobox
                                options={courseTypeOptions}
                                value={filterCourseType}
                                onChange={(val) => {
                                    setFilterCourseType(val);
                                    setCurrentPage(1);
                                }}
                                placeholder={t("Turi bo'yicha")}
                                searchPlaceholder="Tur..."
                            />
                        </div>
                        <div className="w-full sm:w-[190px]">
                            <Combobox
                                options={semesterOptions}
                                value={filterSemester}
                                onChange={(val) => {
                                    setFilterSemester(val);
                                    setCurrentPage(1);
                                }}
                                placeholder={t("Semestr bo'yicha")}
                                searchPlaceholder="Semestr..."
                            />
                        </div>
                        <Button
                            variant={showArchived ? 'primary' : 'outline'}
                            size="sm"
                            className="h-9 gap-1.5"
                            onClick={() => {
                                setShowArchived((prev) => !prev);
                                setCurrentPage(1);
                            }}
                            title="EPOS yuklamasidan yo'qolgan kurslar"
                        >
                            <Archive className="h-4 w-4" />
                            <span>Arxiv</span>
                        </Button>
                        {isAdmin && (
                            <div className="w-full sm:w-[220px]">
                                <Combobox
                                    options={teacherOptions}
                                    value={filterTeacherId}
                                    onSearchChange={setTeacherQuery}
                                    onChange={(val) => {
                                        setFilterTeacherId(val);
                                        setSelectedTeacherOption(
                                            teacherOptions.find((o) => o.value === val) ?? null
                                        );
                                        setCurrentPage(1);
                                    }}
                                    placeholder={t("O'qituvchi bo'yicha")}
                                    searchPlaceholder="F.I.SH..."
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
                            <span>{t("Qo'shish")}</span>
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
            ) : courses.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={7}
                        title={showArchived ? 'Arxiv bo\'sh' : t('Kurslar topilmadi')}
                        description={
                            showArchived
                                ? t("Hech bir kurs arxivga o'tkazilmagan.")
                                : searchTerm ||
                                    filterSubjectId !== 'all' ||
                                    filterGroupId !== 'all' ||
                                    filterCourseType !== 'all'
                                  ? t('Tanlangan filtrlarga mos kurs topilmadi.')
                                  : t("Hozircha kurslar qo'shilmagan.")
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
                                    <span>{t('Fan Nomi')}</span>
                                    {renderSortIcon('subject')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('type')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>Turi</span>
                                    {renderSortIcon('type')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs">Biriktirilgan Guruhlar</TableHead>
                            <TableHead
                                onClick={() => handleSort('teacher')}
                                className="group cursor-pointer select-none font-bold text-xs hidden md:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>{t("O'qituvchi")}</span>
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
                            <TableHead className="text-right font-bold text-xs pr-5">{t('Amallar')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {courses.map((course, index) => {
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
                                            <span className="flex items-center gap-2 font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                {subjectName}
                                            </span>
                                        </div>
                                    </TableCell>

                                    {/* Turi */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                            {courseTypeLabel(course.course_type) ?? '—'}
                                        </span>
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
                                                <span className="text-xs text-muted-foreground italic">{t("Guruh yo'q")}</span>
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
                    {courses.map((course) => {
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
                                    { label: 'Turi', value: courseTypeLabel(course.course_type) ?? '—' },
                                    { label: 'Semestr', value: course.semester_number ? `${course.semester_number}` : '—' },
                                    { label: t('Guruh'), value: `${(course.groups || []).length} ta` },
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
                title={t("Kursni o'chirish")}
                description="Ushbu kursni o'chirishni tasdiqlaysizmi? Kursga tegishli darslar ham o'chirilishi mumkin."
                confirmText={t("O'chirish")}
                cancelText={t("Bekor qilish")}
            />
        </div>
    );
};

export default CoursesPage;
