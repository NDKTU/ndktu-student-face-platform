import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Search, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useTeachers, useDeleteTeacher } from '@/hooks/useTeachers';
import type { Teacher } from '@/services/teacherService';
import { TeacherDetail } from '@/components/teachers/TeacherDetail';
import { TeacherModal } from '@/components/teachers/TeacherModal';
import { TeacherGroupModal } from '@/components/teachers/TeacherGroupModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { TeacherSubjectModal } from '@/components/teachers/TeacherSubjectModal';
import { PageTabs } from '@/components/ui/PageTabs';

const USER_TABS = [
    { label: 'Tizim foydalanuvchilari', href: '/users' },
    { label: 'Talabalar', href: '/students' },
    { label: "O'qituvchilar", href: '/teachers' },
];

const TeachersPage = () => {
    const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
    const [teacherToAssign, setTeacherToAssign] = useState<Teacher | null>(null);

    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: teachersData, isLoading: isTeachersLoading, isError: isTeachersError, refetch } = useTeachers(currentPage, pageSize, debouncedSearch);
    const deleteTeacherMutation = useDeleteTeacher();

    const teachers = teachersData?.teachers || [];
    const totalPages = teachersData ? Math.ceil(teachersData.total / pageSize) : 1;

    const handleViewTeacher = (teacher: Teacher) => {
        setSelectedTeacher(teacher);
        setViewMode('detail');
    };

    const handleBackToList = () => {
        setSelectedTeacher(null);
        setViewMode('list');
    };

    const handleEditClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedTeacher(teacher);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setTeacherToDelete(teacher);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleAssignGroupsClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setTeacherToAssign(teacher);
        setIsGroupModalOpen(true);
    };

    const handleAssignSubjectsClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setTeacherToAssign(teacher);
        setIsSubjectModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!teacherToDelete) return;
        deleteTeacherMutation.mutate({ id: teacherToDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                toast.success("O'qituvchi o'chirildi");
                setIsDeleteModalOpen(false);
                setTeacherToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error("O'chirishda xatolik yuz berdi");
                    setIsDeleteModalOpen(false);
                    setTeacherToDelete(null);
                    setCascadeWarnings([]);
                }
            },
        });
    };

    const handleSuccess = () => {
        toast.success("O'qituvchi saqlandi");
        setIsModalOpen(false);
        setSelectedTeacher(null);
    };

    // Кнопки действий — общие для строки таблицы и мобильной карточки
    const renderActions = (teacher: Teacher) => (
        <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={(e) => handleAssignGroupsClick(teacher, e)}>
                Guruhlar
            </Button>
            <Button variant="outline" size="sm" onClick={(e) => handleAssignSubjectsClick(teacher, e)}>
                Fanlar
            </Button>
            <PermissionGate permission="update:teacher">
                <Button variant="ghost" size="sm" onClick={(e) => handleEditClick(teacher, e)}>
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:teacher">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => handleDeleteClick(teacher, e)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    const columns: DataTableColumn<Teacher>[] = [
        {
            key: 'name',
            header: 'F.I.SH / Kafedra',
            className: 'font-medium',
            cell: (teacher) => (
                <div>
                    <div className="capitalize">{teacher?.full_name || teacher.user?.username || 'Noma\'lum'}</div>
                    {teacher.kafedra && (
                        <div className="text-xs text-muted-foreground capitalize">
                            {teacher.kafedra?.name}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'username',
            header: 'Foydalanuvchi',
            hideBelow: 'md',
            cell: (teacher) => teacher.user?.username || '-',
        },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            hideBelow: 'lg',
            cell: (teacher) => new Date(teacher.created_at).toLocaleDateString(),
        },
        {
            key: 'actions',
            header: 'Amallar',
            headClassName: 'text-right',
            cell: renderActions,
        },
    ];

    if (viewMode === 'detail' && selectedTeacher) {
        return <TeacherDetail teacher={selectedTeacher} onBack={handleBackToList} />;
    }

    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            <PageHeader
                title="O'qituvchilar"
                description="O'qituvchilar ro'yxati va ma'lumotlarini boshqarish"
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
                        <PermissionGate permission="create:teacher">
                            <Button onClick={() => { setSelectedTeacher(null); setIsModalOpen(true); }}>
                                <Plus className="mr-2 h-4 w-4" />
                                Qo'shish
                            </Button>
                        </PermissionGate>
                    </>
                }
            />

            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={teachers}
                        rowKey={(teacher) => teacher.id}
                        isLoading={isTeachersLoading}
                        isError={isTeachersError}
                        onRetry={() => refetch()}
                        onRowClick={handleViewTeacher}
                        emptyIcon={<Users className="h-6 w-6" />}
                        emptyTitle="O'qituvchilar topilmadi"
                        emptyDescription="Hozircha o'qituvchi qo'shilmagan yoki qidiruvga mos yozuv yo'q."
                        renderCard={(teacher) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="min-w-0">
                                    <p className="font-medium capitalize text-foreground">
                                        {teacher?.full_name || teacher.user?.username || 'Noma\'lum'}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground capitalize">
                                        {teacher.kafedra?.name || '—'}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {teacher.user?.username || '-'} · {new Date(teacher.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="mt-3 border-t border-border pt-3">
                                    {renderActions(teacher)}
                                </div>
                            </div>
                        )}
                    />
                </CardContent>
            </Card>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isTeachersLoading}
            />

            <TeacherModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                teacher={selectedTeacher}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setTeacherToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="O'qituvchini o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu o'qituvchini o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${teacherToDelete?.full_name}" o'qituvchisini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />

            <TeacherGroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                teacher={teacherToAssign}
            />

            <TeacherSubjectModal
                isOpen={isSubjectModalOpen}
                onClose={() => setIsSubjectModalOpen(false)}
                teacher={teacherToAssign}
            />
        </div>
    );
};

export default TeachersPage;
