import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import { specialityService, type Speciality, type SpecialityStats } from '@/services/specialityService';
import { HierarchyHeader } from '@/components/catalog/HierarchyHeader';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

interface Props {
    faculty: Faculty;
    kafedra: Kafedra;
    onBack: () => void;
    onOpenSpeciality: (speciality: Speciality) => void;
}

export const KafedraSpecialitiesView = ({ faculty, kafedra, onBack, onOpenSpeciality }: Props) => {
    const [specialities, setSpecialities] = useState<Speciality[]>([]);
    const [stats, setStats] = useState<Map<number, SpecialityStats>>(new Map());
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    const load = async () => {
        setIsLoading(true);
        setIsError(false);
        try {
            const [list, counters] = await Promise.all([
                specialityService.getSpecialities(1, 1000, undefined, kafedra.id),
                specialityService.getSpecialityStats(kafedra.id),
            ]);
            setSpecialities(list.specialities);
            setStats(new Map(counters.map((item) => [item.speciality_id, item])));
        } catch {
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void load(); }, [kafedra.id]);

    const filtered = useMemo(() => {
        const value = search.trim().toLocaleLowerCase('uz');
        return value ? specialities.filter((item) => item.name.toLocaleLowerCase('uz').includes(value)) : specialities;
    }, [search, specialities]);

    return (
        <div className="space-y-6">
            <HierarchyHeader
                title={kafedra.name}
                description={`${faculty.name} · Mutaxassisliklar`}
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
                <EmptyState title="Mutaxassisliklar topilmadi" description="Ushbu kafedrada mutaxassislik mavjud emas." />
            ) : (
                <CatalogGrid>
                    {filtered.map((speciality) => {
                        const item = stats.get(speciality.id);
                        return (
                            <CatalogCard
                                key={speciality.id}
                                id={speciality.id}
                                title={speciality.name}
                                subtitle={speciality.external_id ? `Kod: ${speciality.external_id}` : 'Mutaxassislik'}
                                onClick={() => onOpenSpeciality(speciality)}
                                metrics={[
                                    { label: 'Guruh', value: item?.group_count ?? '—' },
                                    { label: 'Talaba', value: item?.student_count ?? '—', accent: true },
                                ]}
                            />
                        );
                    })}
                </CatalogGrid>
            )}
        </div>
    );
};
