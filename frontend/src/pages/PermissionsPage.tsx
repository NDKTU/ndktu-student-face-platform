import { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { permissionService, type Permission } from '@/services/permissionService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Search, KeyRound } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { labelFor, parsePermission } from '@/constants/resources';
import { PageTabs } from '@/components/ui/PageTabs';
import { PageHeader } from '@/components/ui/PageHeader';

const ACCESS_TABS = [
    { label: 'Rollar', href: '/roles' },
    { label: 'Ruxsatlar', href: '/permissions' },
];

// Ruxsatlar ro'yxati faqat ko'rish uchun: ular backend route'laridagi
// `PermissionRequired(...)` dan ilova ishga tushganda avtomatik yaratiladi,
// shuning uchun qo'lda qo'shish/tahrirlash/o'chirish yo'q. Rolga ruxsat
// biriktirish "Rollar" bo'limida qilinadi.
const PermissionsPage = () => {
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const fetchData = async () => {
        try {
            setIsLoading(true);
            setIsError(false);
            const data = await permissionService.getPermissions(1, 1000, debouncedSearch);
            setPermissions(data.permissions);
        } catch (error) {
            logger.error('Failed to fetch permissions', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { fetchData(); }, [debouncedSearch]);

    const grouped = permissions.reduce<Record<string, Permission[]>>((acc, perm) => {
        const { resource } = parsePermission(perm.name);
        (acc[resource] ??= []).push(perm);
        return acc;
    }, {});

    const sortedGroups = Object.entries(grouped).sort(([a], [b]) =>
        labelFor(a).localeCompare(labelFor(b))
    );

    return (
        <div className="space-y-6">
            <PageTabs tabs={ACCESS_TABS} />
            <PageHeader
                title="Ruxsatlar"
                description="Tizim ruxsatlari tizim tomonidan belgilanadi va faqat ko'rish uchun"
                actions={
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Qidirish..."
                            className="pl-8 w-[220px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                }
            />

            {isError ? (
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState onRetry={fetchData} />
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {Array.from({ length: 4 }, (_, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-3">
                                <Skeleton className="h-5 w-40" />
                            </CardHeader>
                            <CardContent className="pt-0 space-y-3">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-2/3" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : permissions.length === 0 ? (
                <Card>
                    <CardContent className="pt-6">
                        <EmptyState
                            title="Ruxsatlar topilmadi"
                            description="Qidiruv mezonlariga mos ruxsat yo'q."
                            icon={<KeyRound className="h-6 w-6" />}
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {sortedGroups.map(([resource, perms]) => (
                        <Card key={resource}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center justify-between text-base">
                                    <span>{labelFor(resource)}</span>
                                    <span className="badge badge-muted">
                                        {perms.length} ta
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="divide-y divide-border/60">
                                    {perms
                                        .slice()
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((perm) => (
                                            <div key={perm.id} className="py-2">
                                                <span className="font-mono text-sm break-all">{perm.name}</span>
                                            </div>
                                        ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PermissionsPage;
