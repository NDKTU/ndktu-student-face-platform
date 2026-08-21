import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Search, Library } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCourses, useCourseTeacherSummaries, useDeleteCourse } from '@/hooks/useCourses';
import { useSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers } from '@/hooks/useTeachers';
import type { Course, CourseTeacherSummary } from '@/services/courseService';
import { logger } from '@/utils/logger';
import { CourseFilters } from '@/components/courses/CourseFilters';
import { CourseTable } from '@/components/courses/CourseTable';
import { CourseModal } from '@/components/courses/CourseModal';
import { Input } from '@/components/ui/Input';
import { CatalogCard } from '@/components/catalog/CatalogCard';
import { HierarchyHeader } from '@/components/catalog/HierarchyHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useFaculties, useKafedras } from '@/hooks/useReferenceData';

const CoursesPage = () => {
    const { user, hasPermission } = useAuth();
    const isAdmin = user?.roles?.some((role) => role.name.toLowerCase() === 'admin') ?? false;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [selectedTeacher, setSelectedTeacher] = useState<CourseTeacherSummary | null>(null);
    const [teacherSearch, setTeacherSearch] = useState('');
    const [debouncedTeacherSearch, setDebouncedTeacherSearch] = useState('');
    const [teacherFacultyId, setTeacherFacultyId] = useState<number | undefined>();
    const [teacherKafedraId, setTeacherKafedraId] = useState<number | undefined>();

    const [filterSubjectId, setFilterSubjectId] = useState<number | undefined>(undefined);
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);
    const [filterTeacherId, setFilterTeacherId] = useState<number | undefined>(undefined);
    const [filterSemesterNumber, setFilterSemesterNumber] = useState<number | undefined>(undefined);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedTeacherSearch(teacherSearch), 350);
        return () => window.clearTimeout(timer);
    }, [teacherSearch]);

    const teacherSummaries = useCourseTeacherSummaries(
        debouncedTeacherSearch || undefined,
        teacherFacultyId,
        teacherKafedraId,
        isAdmin && selectedTeacher === null,
    );

    const facultiesQuery = useFaculties(1, 1000, undefined, isAdmin && hasPermission('read:faculty'));
    const kafedrasQuery = useKafedras(
        1,
        1000,
        undefined,
        teacherFacultyId,
        isAdmin && hasPermission('read:kafedra'),
    );

    const { data: coursesData, isLoading: isCoursesLoading, isError: isCoursesError, refetch } = useCourses(
        currentPage,
        pageSize,
        filterTeacherId,
        filterSubjectId,
        filterGroupId,
        filterSemesterNumber,
    );

    const { data: allSubjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));
    const { data: allTeachersData } = useTeachers(1, 1000, undefined, hasPermission('read:teacher'));

    const deleteCourseMutation = useDeleteCourse();

    const courses = coursesData?.courses || [];
    const totalPages = coursesData ? Math.ceil(coursesData.total / pageSize) : 1;
    const allSubjects = allSubjectsData?.subjects || [];
    const allGroups = allGroupsData?.groups || [];
    const allTeachers = allTeachersData?.teachers || [];

    const handleCreateCourse = () => {
        setSelectedCourse(null);
        setIsModalOpen(true);
    };

    const handleEditCourse = (course: Course) => {
        setSelectedCourse(course);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (course: Course) => {
        setCourseToDelete(course);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (!courseToDelete) return;
        deleteCourseMutation.mutate(courseToDelete.id, {
            onSuccess: () => {
                toast.success("Kurs o'chirildi");
                setIsDeleteModalOpen(false);
                setCourseToDelete(null);
            },
            onError: (error: unknown) => {
                logger.error('Failed to delete course', error);
                toast.error("O'chirishda xatolik yuz berdi");
                setIsDeleteModalOpen(false);
                setCourseToDelete(null);
            },
        });
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
    };

    if (isAdmin && selectedTeacher === null) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Kurslar"
                    description="O'qituvchilar bo'yicha kurslar"
                    actions={
                        <PermissionGate permission="create:course">
                            <Button onClick={handleCreateCourse}><Plus className="mr-2 h-4 w-4" />Kurs yaratish</Button>
                        </PermissionGate>
                    }
                />

                <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_minmax(220px,265px)_minmax(220px,280px)]">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={teacherSearch}
                            onChange={(event) => setTeacherSearch(event.target.value)}
                            placeholder="O'qituvchini qidirish..."
                            className="pl-9"
                        />
                    </div>
                    <select
                        value={teacherFacultyId ?? ''}
                        onChange={(event) => {
                            setTeacherFacultyId(event.target.value ? Number(event.target.value) : undefined);
                            setTeacherKafedraId(undefined);
                        }}
                        className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">Barcha fakultetlar</option>
                        {facultiesQuery.data?.faculties.map((faculty) => (
                            <option key={faculty.id} value={faculty.id}>{faculty.name}</option>
                        ))}
                    </select>
                    <select
                        value={teacherKafedraId ?? ''}
                        onChange={(event) => setTeacherKafedraId(event.target.value ? Number(event.target.value) : undefined)}
                        className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">Barcha kafedralar</option>
                        {kafedrasQuery.data?.kafedras.map((kafedra) => (
                            <option key={kafedra.id} value={kafedra.id}>{kafedra.name}</option>
                        ))}
                    </select>
                </div>

                {teacherSummaries.isError ? (
                    <ErrorState onRetry={() => teacherSummaries.refetch()} />
                ) : teacherSummaries.isLoading ? (
                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
                    </section>
                ) : (teacherSummaries.data?.length ?? 0) === 0 ? (
                    <EmptyState icon={<Library className="h-6 w-6" />} title="Kurslar topilmadi" description="Hozircha kurs biriktirilgan o'qituvchi yo'q." />
                ) : (
                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {teacherSummaries.data?.map((teacher) => (
                            <CatalogCard
                                key={teacher.teacher_id}
                                id={teacher.teacher_id}
                                title={teacher.full_name || teacher.username}
                                subtitle={teacher.kafedra_name || teacher.username}
                                metrics={[
                                    { label: 'Kurs', value: teacher.course_count },
                                    { label: 'Dars', value: teacher.lesson_count, accent: true },
                                ]}
                                onClick={() => {
                                    setSelectedTeacher(teacher);
                                    setFilterTeacherId(teacher.teacher_id);
                                    setCurrentPage(1);
                                }}
                            />
                        ))}
                    </section>
                )}

                <CourseModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} course={selectedCourse} onSuccess={handleSuccess} />
            </div>
        );
    }

    const clearFilters = () => {
        setFilterSubjectId(undefined);
        setFilterGroupId(undefined);
        setFilterTeacherId(selectedTeacher?.teacher_id);
        setFilterSemesterNumber(undefined);
    };

    const hasActiveFilters =
        filterSubjectId !== undefined ||
        filterGroupId !== undefined ||
        (!selectedTeacher && filterTeacherId !== undefined) ||
        filterSemesterNumber !== undefined;

    return (
        <div className="space-y-6">
            {selectedTeacher ? (
                <HierarchyHeader
                    title={selectedTeacher.full_name || selectedTeacher.username}
                    description={`${selectedTeacher.kafedra_name || "O'qituvchi"} · ${selectedTeacher.course_count} kurs · ${selectedTeacher.lesson_count} dars`}
                    onBack={() => { setSelectedTeacher(null); setFilterTeacherId(undefined); setCurrentPage(1); }}
                    actions={
                        <PermissionGate permission="create:course">
                            <Button onClick={handleCreateCourse}><Plus className="mr-2 h-4 w-4" />Kurs yaratish</Button>
                        </PermissionGate>
                    }
                />
            ) : <PageHeader
                title="Kurslar"
                description="Kurslarni boshqarish"
                actions={
                    <PermissionGate permission="create:course">
                        <Button onClick={handleCreateCourse}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
                }
            />}

            <CourseFilters
                subjects={allSubjects}
                groups={allGroups}
                teachers={allTeachers}
                filterSubjectId={filterSubjectId}
                onSubjectChange={setFilterSubjectId}
                filterGroupId={filterGroupId}
                onGroupChange={setFilterGroupId}
                filterTeacherId={filterTeacherId}
                onTeacherChange={setFilterTeacherId}
                filterSemesterNumber={filterSemesterNumber}
                onSemesterChange={setFilterSemesterNumber}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearFilters}
                showTeacherFilter={!selectedTeacher}
            />

            <CourseTable
                courses={courses}
                isLoading={isCoursesLoading}
                isError={isCoursesError}
                onRetry={() => refetch()}
                onEdit={handleEditCourse}
                onDelete={handleDeleteClick}
            />

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isCoursesLoading}
            />

            <CourseModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                course={selectedCourse}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCourseToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Kursni o'chirish"
                description={`Siz haqiqatan ham "${courseToDelete?.name}" kursini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default CoursesPage;
