import { useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { useGroups } from '@/hooks/useGroups';
import type { Faculty } from '@/services/facultyService';
import type { Group } from '@/services/groupService';
import { Crumbs } from './Crumbs';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

interface FacultyGroupsViewProps {
    faculty: Faculty;
    onBack: () => void;
    onOpenGroup: (group: Group) => void;
    hideHeader?: boolean;
}

export const FacultyGroupsView = ({ faculty, onBack, onOpenGroup, hideHeader }: FacultyGroupsViewProps) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: groupsData, isLoading, isError, refetch } = useGroups(currentPage, pageSize, debouncedSearch, undefined, faculty.id);
    const groups = groupsData?.groups || [];
    const totalPages = groupsData ? Math.ceil(groupsData.total / pageSize) : 1;

    const columns: DataTableColumn<Group>[] = [
        { key: 'id', header: 'ID', headClassName: 'w-[80px]', cell: (group) => group.id },
        { key: 'name', header: 'Nomi', className: 'font-medium', cell: (group) => group.name },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            hideBelow: 'lg',
            cell: (group) => new Date(group.created_at).toLocaleDateString(),
        },
        {
            key: 'chevron',
            header: '',
            headClassName: 'w-[40px]',
            className: 'text-right',
            cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {!hideHeader && (
                    <div className="space-y-2">
                        <Crumbs items={[
                            { label: 'Fakultetlar', onClick: onBack },
                            { label: faculty.name },
                        ]} />
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="sm" onClick={onBack}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Orqaga
                            </Button>
                            <h1 className="page-title capitalize">{faculty.name} — guruhlar</h1>
                        </div>
                    </div>
                )}
                {hideHeader && <div />}
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Qidirish..."
                        className="pl-8 w-[220px]"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={groups}
                        rowKey={(group) => group.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        emptyTitle="Guruhlar topilmadi"
                        emptyDescription="Ushbu fakultetda guruh yo'q yoki qidiruvga mos guruh topilmadi."
                        onRowClick={onOpenGroup}
                        renderCard={(group) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground">{group.name}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            ID: {group.id} · {new Date(group.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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
        </div>
    );
};
