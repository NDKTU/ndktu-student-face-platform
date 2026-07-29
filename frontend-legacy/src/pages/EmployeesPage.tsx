import { useState, useEffect } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import { Loader2, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useEmployees, useDeleteEmployee } from '@/hooks/useEmployees';
import type { Employee } from '@/services/employeeService';
import { EmployeeModal } from '@/components/employees/EmployeeModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';

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

    const { data: employeesData, isLoading } = useEmployees(currentPage, pageSize, debouncedSearch);
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
                    setIsDeleteModalOpen(false);
                    setEmployeeToDelete(null);
                    setCascadeWarnings([]);
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        alert("O'chirishda xatolik yuz berdi");
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

    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Xodimlar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Xodimlar ro'yxati va shaxsiy ma'lumotlarini boshqarish</p>
                </div>
                <div className="flex items-center gap-2">
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
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>F.I.SH</TableHead>
                                    <TableHead>Foydalanuvchi</TableHead>
                                    <TableHead>Telefon</TableHead>
                                    <TableHead>O'qituvchi profili</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {employees.map((employee) => (
                                    <TableRow key={employee.id}>
                                        <TableCell className="font-medium capitalize">{employee.full_name}</TableCell>
                                        <TableCell>{employee.user?.username || '-'}</TableCell>
                                        <TableCell>{employee.phone_number || '-'}</TableCell>
                                        <TableCell>
                                            {employee.teacher ? (
                                                <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">Mavjud</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Yo'q</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
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
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {employees.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Xodimlar topilmadi.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
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
                            <p className="text-red-600 font-medium">Diqqat! Ushbu xodimni o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-red-500">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-red-700 mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
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
