import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { facultyService, type Faculty, type FacultyStats } from '@/services/facultyService';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import { FacultyModal } from '@/components/faculty/FacultyModal';
import { FacultyDetailsView } from '@/components/faculty/FacultyDetailsView';
import { GroupStudentsView } from '@/components/faculty/GroupStudentsView';
import { StudentDetailView } from '@/components/faculty/StudentDetailView';
import { KafedraSpecialitiesView } from '@/components/faculty/KafedraSpecialitiesView';
import { SpecialityGroupsView } from '@/components/faculty/SpecialityGroupsView';
import type { Kafedra } from '@/services/kafedraService';
import type { Speciality } from '@/services/specialityService';
import { tileFor, initialsOf } from '@/lib/avatarTiles';
import { logger } from '@/utils/logger';

type View =
    | { level: 'faculties' }
    | { level: 'faculty-details'; faculty: Faculty }
    | { level: 'kafedra-specialities'; faculty: Faculty; kafedra: Kafedra }
    | { level: 'speciality-groups'; faculty: Faculty; kafedra: Kafedra; speciality: Speciality }
    | { level: 'group-students'; faculty: Faculty; kafedra: Kafedra; speciality: Speciality; group: Group }
    | { level: 'student-detail'; faculty: Faculty; kafedra: Kafedra; speciality: Speciality; group: Group; student: Student };


const FacultyPage = () => {
    const [faculties, setFaculties] = useState<Faculty[]>([]);
    const [stats, setStats] = useState<Map<number, FacultyStats>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
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
    const [view, setView] = useState<View>({ level: 'faculties' });
    const pageSize = 10;

    const fetchData = async () => {
        try {
            setIsLoading(true);
            setIsError(false);
            const [data, statsList] = await Promise.all([
                facultyService.getFaculties(currentPage, pageSize, debouncedSearch),
                // Счётчики — украшение карточек: их отказ не должен ронять страницу
                facultyService.getFacultyStats().catch(() => [] as FacultyStats[]),
            ]);
            setFaculties(data.faculties);
            setStats(new Map(statsList.map((s) => [s.faculty_id, s])));
            setTotalPages(Math.ceil(data.total / pageSize));
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
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { fetchData(); }, [currentPage, debouncedSearch]);

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

    if (view.level === 'faculty-details') {
        return (
            <FacultyDetailsView
                faculty={view.faculty}
                onBack={() => setView({ level: 'faculties' })}
                onOpenKafedra={(kafedra) => setView({ level: 'kafedra-specialities', faculty: view.faculty, kafedra })}
            />
        );
    }
    if (view.level === 'kafedra-specialities') {
        return (
            <KafedraSpecialitiesView
                faculty={view.faculty}
                kafedra={view.kafedra}
                onBack={() => setView({ level: 'faculty-details', faculty: view.faculty })}
                onOpenSpeciality={(speciality) => setView({ level: 'speciality-groups', faculty: view.faculty, kafedra: view.kafedra, speciality })}
            />
        );
    }
    if (view.level === 'speciality-groups') {
        return (
            <SpecialityGroupsView
                faculty={view.faculty}
                kafedra={view.kafedra}
                speciality={view.speciality}
                onBack={() => setView({ level: 'kafedra-specialities', faculty: view.faculty, kafedra: view.kafedra })}
                onOpenGroup={(group) => setView({ level: 'group-students', faculty: view.faculty, kafedra: view.kafedra, speciality: view.speciality, group })}
            />
        );
    }
    if (view.level === 'group-students') {
        return (
            <GroupStudentsView
                faculty={view.faculty}
                group={view.group}
                onBackToFaculties={() => setView({ level: 'faculties' })}
                onBackToGroups={() => setView({ level: 'speciality-groups', faculty: view.faculty, kafedra: view.kafedra, speciality: view.speciality })}
                onOpenStudent={(student) => setView({ level: 'student-detail', faculty: view.faculty, kafedra: view.kafedra, speciality: view.speciality, group: view.group, student })}
            />
        );
    }
    if (view.level === 'student-detail') {
        return (
            <StudentDetailView
                faculty={view.faculty}
                group={view.group}
                student={view.student}
                onBackToFaculties={() => setView({ level: 'faculties' })}
                onBackToGroups={() => setView({ level: 'speciality-groups', faculty: view.faculty, kafedra: view.kafedra, speciality: view.speciality })}
                onBackToStudents={() => setView({ level: 'group-students', faculty: view.faculty, kafedra: view.kafedra, speciality: view.speciality, group: view.group })}
            />
        );
    }

    // Кнопки действий — общие для строки таблицы и мобильной карточки.
    // Записи зеркала не редактируются: бэкенд отклонит правку,
    // а следующая синхронизация вернула бы прежние значения.
    const renderActions = (faculty: Faculty) => (
        <div className="flex justify-end gap-2">
            {!isExternal(faculty) && (
                <>
                    <PermissionGate permission="update:faculty">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedFaculty(faculty); setIsModalOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:faculty">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteClick(faculty); }}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
        </div>
    );

    /* Карточка факультета в стиле референса: плитка-инициалы, имя, счётчики */
    const renderFacultyCard = (faculty: Faculty) => {
        const s = stats.get(faculty.id);
        return (
            <div
                key={faculty.id}
                role="button"
                tabIndex={0}
                onClick={() => setView({ level: 'faculty-details', faculty })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView({ level: 'faculty-details', faculty }); } }}
                className="group flex cursor-pointer flex-col rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
                <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tileFor(faculty.id)}`}>
                        {initialsOf(faculty.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-display font-semibold capitalize leading-snug text-foreground">
                            {faculty.name}
                        </p>
                        <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
                            <ExternalSourceBadge row={faculty} />
                            <InactiveBadge row={faculty} />
                        </span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>{renderActions(faculty)}</div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-4">
                    <div>
                        <p className="font-display text-lg font-bold text-foreground">{s ? s.kafedra_count : '—'}</p>
                        <p className="text-xs text-muted-foreground">Kafedra</p>
                    </div>
                    <div>
                        <p className="font-display text-lg font-bold text-foreground">{s ? s.speciality_count : '—'}</p>
                        <p className="text-xs text-muted-foreground">Mutaxassislik</p>
                    </div>
                    <div>
                        <p className="font-display text-lg font-bold text-foreground">{s ? s.student_count : '—'}</p>
                        <p className="text-xs text-muted-foreground">Talaba</p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fakultetlar"
                description="Universitet fakultetlarini boshqarish"
                actions={
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Qidirish..."
                                className="pl-8 w-[220px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <PermissionGate permission="create:faculty">
                            <Button onClick={() => { setSelectedFaculty(null); setIsModalOpen(true); }}>
                                <Plus className="mr-2 h-4 w-4" />
                                Qo'shish
                            </Button>
                        </PermissionGate>
                    </>
                }
            />

            {isError ? (
                <ErrorState onRetry={fetchData} />
            ) : isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-44 w-full rounded-2xl" />
                    ))}
                </div>
            ) : faculties.length === 0 ? (
                <EmptyState
                    title="Fakultetlar topilmadi"
                    description="Hozircha fakultet qo'shilmagan yoki qidiruvga mos fakultet yo'q."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {faculties.map(renderFacultyCard)}
                </div>
            )}

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isLoading}
            />

            <FacultyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                faculty={selectedFaculty}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setFacultyToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Fakultetni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu fakultetni o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${facultyToDelete?.name}" fakultetini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default FacultyPage;
