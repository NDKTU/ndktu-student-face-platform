import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useCourses, useDeleteCourse } from '@/hooks/useCourses';
import { useSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers } from '@/hooks/useTeachers';
import type { Course } from '@/services/courseService';
import { logger } from '@/utils/logger';
import { CourseFilters } from '@/components/courses/CourseFilters';
import { CourseTable } from '@/components/courses/CourseTable';
import { CourseModal } from '@/components/courses/CourseModal';

const CoursesPage = () => {
    const { hasPermission } = useAuth();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const [filterSubjectId, setFilterSubjectId] = useState<number | undefined>(undefined);
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);
    const [filterTeacherId, setFilterTeacherId] = useState<number | undefined>(undefined);
    const [filterSemesterNumber, setFilterSemesterNumber] = useState<number | undefined>(undefined);

    const { data: coursesData, isLoading: isCoursesLoading } = useCourses(
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
                setIsDeleteModalOpen(false);
                setCourseToDelete(null);
            },
            onError: (error: unknown) => {
                logger.error('Failed to delete course', error);
                alert("O'chirishda xatolik yuz berdi");
                setIsDeleteModalOpen(false);
                setCourseToDelete(null);
            },
        });
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
    };

    const clearFilters = () => {
        setFilterSubjectId(undefined);
        setFilterGroupId(undefined);
        setFilterTeacherId(undefined);
        setFilterSemesterNumber(undefined);
    };

    const hasActiveFilters =
        filterSubjectId !== undefined ||
        filterGroupId !== undefined ||
        filterTeacherId !== undefined ||
        filterSemesterNumber !== undefined;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Kurslar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Kurslarni boshqarish</p>
                </div>
                <PermissionGate permission="create:course">
                    <Button onClick={handleCreateCourse}>
                        <Plus className="mr-2 h-4 w-4" />
                        Qo'shish
                    </Button>
                </PermissionGate>
            </div>

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
            />

            <CourseTable
                courses={courses}
                isLoading={isCoursesLoading}
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
