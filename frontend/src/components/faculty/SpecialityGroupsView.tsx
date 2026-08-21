import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import type { Speciality } from '@/services/specialityService';
import { groupService, type Group } from '@/services/groupService';
import { HierarchyHeader } from '@/components/catalog/HierarchyHeader';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

interface Props {
    faculty: Faculty;
    kafedra: Kafedra;
    speciality: Speciality;
    onBack: () => void;
    onOpenGroup: (group: Group) => void;
}

export const SpecialityGroupsView = ({ faculty, kafedra, speciality, onBack, onOpenGroup }: Props) => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    const load = async () => {
        setIsLoading(true);
        setIsError(false);
        try {
            const response = await groupService.getGroups(1, 1000, '', undefined, faculty.id, speciality.id);
            setGroups(response.groups);
        } catch {
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void load(); }, [faculty.id, speciality.id]);

    const filtered = useMemo(() => {
        const value = search.trim().toLocaleLowerCase('uz');
        return value ? groups.filter((group) => group.name.toLocaleLowerCase('uz').includes(value)) : groups;
    }, [groups, search]);

    return (
        <div className="space-y-6">
            <HierarchyHeader
                title={speciality.name}
                description={`${faculty.name} · ${kafedra.name} · Guruhlar`}
                onBack={onBack}
                actions={
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Qidirish..." className="w-[220px] pl-8" />
                    </div>
                }
            />

            {isError ? (
                <ErrorState onRetry={load} />
            ) : isLoading ? (
                <CatalogGrid>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</CatalogGrid>
            ) : filtered.length === 0 ? (
                <EmptyState title="Guruhlar topilmadi" description="Ushbu mutaxassislikda guruh mavjud emas." />
            ) : (
                <CatalogGrid>
                    {filtered.map((group) => (
                        <CatalogCard
                            key={group.id}
                            id={group.id}
                            title={group.name}
                            subtitle={group.education_shape || 'Guruh'}
                            onClick={() => onOpenGroup(group)}
                            metrics={[
                                { label: 'Bosqich', value: group.course ?? '—' },
                                { label: 'Talaba', value: group.student_count ?? '—', accent: true },
                            ]}
                        />
                    ))}
                </CatalogGrid>
            )}
        </div>
    );
};
