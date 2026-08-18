import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Search, Plus, Pencil, Trash2, Briefcase } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useEmployees, useDeleteEmployee } from '@/hooks/useEmployees';
import type { Employee } from '@/services/employeeService';
import { EmployeeModal } from '@/components/employees/EmployeeModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

const USER_TABS = [
    { label: 'Tizim foydalanuvchilari', href: '/users' },
    { label: 'Talabalar', href: '/students' },
    { label: "O'qituvchilar", href: '/teachers' },
    { label: 'Xodimlar', href: '/employees' },
];

const EmployeesPage = () => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const {
        data: employeesData,
        isLoading,
        isError,
        refetch,
    } = useEmployees(currentPage, pageSize, debouncedSearch);
    const deleteMutation = useDeleteEmployee();

    const employees = employeesData?.employees || [];
    const totalPages = employeesData ? Math.ceil(employeesData.total / pageSize) : 1;

    const handleEditClick = (employee: Employee, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedEmployee(employee);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (employee: Employee, e: React.MouseEvent) => {
        e.stopPropagation();
        setEmployeeToDelete(employee);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!employeeToDelete) return;
        deleteMutation.mutate(
            { id: employeeToDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Xodim o'chirildi");
                    setIsDeleteModalOpen(false);
                    setEmployeeToDelete(null);
                    setCascadeWarnings([]);
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        toast.error("O'chirishda xatolik yuz berdi");
                        setIsDeleteModalOpen(false);
                        setEmployeeToDelete(null);
                        setCascadeWarnings([]);
                    }
                },
            }
        );
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
        setSelectedEmployee(null);
    };

    const renderTeacherBadge = (employee: Employee) =>
        employee.teacher ? (
            <span className="badge badge-primary">Mavjud</span>
        ) : (
            <span className="text-xs text-muted-foreground">Yo'q</span>
        );

    const renderRowActions = (employee: Employee) => (
        <div className="flex justify-end gap-2">
            <PermissionGate permission="update:employee">
                <Button variant="ghost" size="sm" onClick={(e) => handleEditClick(employee, e)}>
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:employee">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => handleDeleteClick(employee, e)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    const columns: DataTableColumn<Employee>[] = [
        { key: 'full_name', header: 'F.I.SH', cell: (employee) => employee.full_name, className: 'font-medium capitalize' },
        { key: 'username', header: 'Foydalanuvchi', cell: (employee) => employee.user?.username || '-' },
        { key: 'phone', header: 'Telefon', cell: (employee) => employee.phone_number || '-', hideBelow: 'lg' },
        { key: 'teacher', header: "O'qituvchi profili", cell: renderTeacherBadge },
        {
            key: 'actions',
            header: <span className="block text-right">Amallar</span>,
            cell: renderRowActions,
            className: 'text-right',
        },
    ];

    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            <PageHeader
                title="Xodimlar"
                description="Xodimlar ro'yxati va shaxsiy ma'lumotlarini boshqarish"
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
                        <PermissionGate permission="create:employee">
                            <Button onClick={() => { setSelectedEmployee(null); setIsModalOpen(true); }}>
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
                        data={employees}
                        rowKey={(employee) => employee.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        emptyTitle="Xodimlar topilmadi"
                        emptyDescription="Qidiruv mezonlariga mos xodim yo'q."
                        emptyIcon={<Briefcase className="h-6 w-6" />}
                        renderCard={(employee) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium capitalize text-foreground">{employee.full_name}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {employee.user?.username || '-'}
                                            {employee.phone_number ? ` · ${employee.phone_number}` : ''}
                                        </p>
                                    </div>
                                    {renderRowActions(employee)}
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>O'qituvchi profili:</span>
                                    {renderTeacherBadge(employee)}
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
                isLoading={isLoading}
            />

            <EmployeeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                employee={selectedEmployee}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setEmployeeToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Xodimni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu xodimni o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/80">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${employeeToDelete?.full_name}" xodimini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default EmployeesPage;
