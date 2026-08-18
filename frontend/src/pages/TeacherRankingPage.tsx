import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { Trophy, Loader2, Medal, Crown, Building2, Layers, Search, X, FilterX, FileSpreadsheet } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import {
    useTeacherRanking,
    useFacultyRanking,
    useKafedraRanking,
} from '@/hooks/useTeachers';
import type { TeacherRankItem, FacultyRankItem, KafedraRankItem } from '@/services/teacherService';
import { teacherService } from '@/services/teacherService';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { useFaculties, useKafedras } from '@/hooks/useReferenceData';
import { useAuth } from '@/context/AuthContext';
import PermissionGate from '@/components/auth/PermissionGate';
import { Combobox } from '@/components/ui/Combobox';

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'teachers' | 'faculty' | 'kafedra';

const TABS: { value: Tab; label: string }[] = [
    { value: 'teachers', label: "O'qituvchilar reytingi" },
    { value: 'faculty',  label: "Fakultetlar reytingi" },
    { value: 'kafedra',  label: "Kafedralar reytingi" },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
const RankBadge = ({ rank }: { rank: number }) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm font-semibold text-muted-foreground">#{rank}</span>;
};

const EmptyState = ({ label }: { label: string }) => (
    <div className="py-16 text-center text-muted-foreground">
        <Trophy className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p>{label}</p>
    </div>
);

const Spinner = () => (
    <div className="flex justify-center p-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
);


// ─── Teacher table ────────────────────────────────────────────────────────────
const TeacherRankTable = ({ items }: { items: TeacherRankItem[] }) => {
    if (!items.length) return (
        <EmptyState label="Hozircha o'qituvchilar bo'yicha ma'lumotlar mavjud emas." />
    );
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-16 text-center">O'rin</TableHead>
                    <TableHead>O'qituvchi</TableHead>
                    <TableHead>Kafedra</TableHead>
                    <TableHead>Fakultet</TableHead>
                    <TableHead className="text-right">Talabalar</TableHead>
                    <TableHead className="text-right">O'rtacha baho</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((item) => (
                    <TableRow key={item.teacher_id} className={item.rank <= 3 ? 'bg-primary/5' : ''}>
                        <TableCell className="text-center"><RankBadge rank={item.rank} /></TableCell>
                        <TableCell>
                            <div className="font-medium capitalize">{item.full_name}</div>
                            <div className="text-xs text-muted-foreground">{item.student_count} talaba</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.kafedra_name ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.faculty_name ?? '—'}</TableCell>
                        <TableCell className="text-right text-sm">{item.student_count}</TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{item.avg_grade.toFixed(2)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

// ─── Faculty table ────────────────────────────────────────────────────────────
const FacultyRankTable = ({ items }: { items: FacultyRankItem[] }) => {
    if (!items.length) return <EmptyState label="Fakultetlar bo'yicha ma'lumotlar topilmadi." />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-16 text-center">O'rin</TableHead>
                    <TableHead>Fakultet</TableHead>
                    <TableHead className="text-right">Kafedralar</TableHead>
                    <TableHead className="text-right">Talabalar</TableHead>
                    <TableHead className="text-right">O'rtacha baho</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((item) => (
                    <TableRow key={item.faculty_id} className={item.rank <= 3 ? 'bg-primary/5' : ''}>
                        <TableCell className="text-center"><RankBadge rank={item.rank} /></TableCell>
                        <TableCell className="font-medium">{item.faculty_name}</TableCell>
                        <TableCell className="text-right text-sm">{item.kafedra_count}</TableCell>
                        <TableCell className="text-right text-sm">{item.student_count}</TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{item.avg_grade.toFixed(2)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

// ─── Kafedra table ────────────────────────────────────────────────────────────
const KafedraRankTable = ({ items }: { items: KafedraRankItem[] }) => {
    if (!items.length) return <EmptyState label="Kafedralar bo'yicha ma'lumotlar topilmadi." />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-16 text-center">O'rin</TableHead>
                    <TableHead>Kafedra</TableHead>
                    <TableHead>Fakultet</TableHead>
                    <TableHead className="text-right">O'qituvchilar</TableHead>
                    <TableHead className="text-right">Talabalar</TableHead>
                    <TableHead className="text-right">O'rtacha baho</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((item) => (
                    <TableRow key={item.kafedra_id} className={item.rank <= 3 ? 'bg-primary/5' : ''}>
                        <TableCell className="text-center"><RankBadge rank={item.rank} /></TableCell>
                        <TableCell className="font-medium">{item.kafedra_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.faculty_name}</TableCell>
                        <TableCell className="text-right text-sm">{item.teacher_count}</TableCell>
                        <TableCell className="text-right text-sm">{item.student_count}</TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{item.avg_grade.toFixed(2)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

// ─── Tab panels ───────────────────────────────────────────────────────────────
const TeachersPanel = () => {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [facultyId, setFacultyId] = useState<string>('');
    const [kafedraId, setKafedraId] = useState<string>('');
    const [isExporting, setIsExporting] = useState(false);
    
    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const { hasPermission } = useAuth();
    const { data: facultiesData } = useFaculties(1, 100, undefined, hasPermission('read:faculty'));
    const { data: kafedrasData } = useKafedras(1, 100, undefined, undefined, hasPermission('read:kafedra'));

    const facultyOptions = facultiesData?.faculties.map(f => ({ value: f.id.toString(), label: f.name })) || [];
    const kafedraOptions = kafedrasData?.kafedras
        .filter(k => facultyId ? k.faculty_id.toString() === facultyId : true)
        .map(k => ({ value: k.id.toString(), label: k.name })) || [];

    const { data, isLoading, isFetching } = useTeacherRanking({ 
        page, 
        limit: 10,
        search: debouncedSearch || undefined,
        faculty_id: facultyId ? parseInt(facultyId) : undefined,
        kafedra_id: kafedraId ? parseInt(kafedraId) : undefined,
    });

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const response = await teacherService.getRankingOverall({
                limit: 10000, 
                search: debouncedSearch || undefined,
                faculty_id: facultyId ? parseInt(facultyId) : undefined,
                kafedra_id: kafedraId ? parseInt(kafedraId) : undefined,
            });

            const items = response.teachers || [];
            if (items.length === 0) {
                toast.info("Eksport qilish uchun ma'lumot topilmadi.");
                return;
            }

            const { utils, writeFile } = await import('xlsx');
            
            const date = new Date().toLocaleDateString('uz-UZ').replace(/\//g, '.');
            const facName = facultiesData?.faculties.find(f => f.id.toString() === facultyId)?.name || 'Barcha fakultetlar';
            const kafName = kafedrasData?.kafedras.find(k => k.id.toString() === kafedraId)?.name || 'Barcha kafedralar';

            const wsData: any[][] = [];
            wsData.push(["NKMU - O'qituvchilar Umumiy Reytingi", "", "", "", "", ""]);
            wsData.push([`Sana (Date): ${date}`, "", "", `Filtr kafedra: ${kafName}`, "", ""]);
            wsData.push([`Filtr fakultet: ${facName}`, "", "", "", "", ""]);
            wsData.push(["", "", "", "", "", ""]);
            wsData.push(["O'rin (Rank)", "O'qituvchi F.I.O", "Kafedra", "Fakultet", "Talabalar Soni", "O'rtacha Baho"]);

            items.forEach(item => {
                wsData.push([
                    item.rank,
                    item.full_name,
                    item.kafedra_name,
                    item.faculty_name,
                    item.student_count,
                    item.weighted_rating
                ]);
            });

            const ws = utils.aoa_to_sheet(wsData);

            if(!ws['!merges']) ws['!merges'] = [];
            ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
            ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } });
            ws['!merges'].push({ s: { r: 1, c: 3 }, e: { r: 1, c: 5 } });
            ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 2, c: 2 } });

            // Set reasonable column widths for readability so texts are completely visible
            ws['!cols'] = [
                { wch: 15 }, // A: O'rin (Rank)
                { wch: 40 }, // B: O'qituvchi F.I.O
                { wch: 45 }, // C: Kafedra
                { wch: 45 }, // D: Fakultet
                { wch: 20 }, // E: Talabalar Soni
                { wch: 20 }, // F: O'rtacha Baho
            ];

            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "Reyting");
            
            writeFile(wb, `Oqituvchilar_reytingi_${date.replace(/\./g, '-')}.xlsx`);

        } catch (error) {
            logger.error("Excel eksportda xatolik:", error);
            toast.error("Eksport qilishda xatolik yuz berdi.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative w-full sm:max-w-sm">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        {isFetching && search !== debouncedSearch ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                            <Search className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                    <Input
                        placeholder="F.I.O bo'yicha qidirish..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-8"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-accent"
                        >
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                    )}
                </div>

                <PermissionGate permission="read:faculty">
                    <Combobox
                        options={facultyOptions}
                        value={facultyId}
                        onChange={(val) => {
                            setFacultyId(val);
                            setKafedraId('');
                            setPage(1);
                        }}
                        placeholder="Fakultetni tanlang"
                        searchPlaceholder="Fakultet qidirish..."
                        className="w-full sm:max-w-[250px]"
                    />
                </PermissionGate>

                <PermissionGate permission="read:kafedra">
                    <Combobox
                        options={kafedraOptions}
                        value={kafedraId}
                        onChange={(val) => {
                            setKafedraId(val);
                            setPage(1);
                        }}
                        placeholder="Kafedrani tanlang"
                        searchPlaceholder="Kafedra qidirish..."
                        className="w-full sm:max-w-[250px]"
                    />
                </PermissionGate>

                {(search || facultyId || kafedraId) && (
                    <Button 
                        variant="outline" 
                        onClick={() => {
                            setSearch('');
                            setDebouncedSearch('');
                            setFacultyId('');
                            setKafedraId('');
                            setPage(1);
                        }}
                        className="w-full sm:w-auto text-muted-foreground hover:text-foreground"
                    >
                        <FilterX className="mr-2 h-4 w-4" />
                        Tozalash
                    </Button>
                )}

                <Button 
                    variant="primary"
                    onClick={handleExportExcel}
                    disabled={isExporting}
                    className="w-full sm:w-auto ml-auto"
                >
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                    Excel yuklab olish
                </Button>
            </div>

            {isLoading && !data ? (
                <Spinner />
            ) : (
                <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
                    <TeacherRankTable items={data?.teachers ?? []} />
                    {data && data.total > 10 && (
                        <Pagination
                            currentPage={page}
                            totalPages={Math.ceil(data.total / 10)}
                            onPageChange={setPage}
                            isLoading={isFetching}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

const FacultyPanel = () => {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useFacultyRanking({ page, limit: 10 });

    if (isLoading) return <Spinner />;

    return (
        <div className="space-y-4">
            <FacultyRankTable items={data?.faculties ?? []} />
            {data && data.total > 10 && (
                <Pagination
                    currentPage={page}
                    totalPages={Math.ceil(data.total / 10)}
                    onPageChange={setPage}
                    isLoading={isLoading}
                />
            )}
        </div>
    );
};

const KafedraPanel = () => {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useKafedraRanking({ page, limit: 10 });

    if (isLoading) return <Spinner />;

    return (
        <div className="space-y-4">
            <KafedraRankTable items={data?.kafedras ?? []} />
            {data && data.total > 10 && (
                <Pagination
                    currentPage={page}
                    totalPages={Math.ceil(data.total / 10)}
                    onPageChange={setPage}
                    isLoading={isLoading}
                />
            )}
        </div>
    );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const TeacherRankingPage = () => {
    const [tab, setTab] = useState<Tab>('teachers');

    return (
        <div className="space-y-5">
            <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Reyting
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    Talabalar bahosi bo'yicha umumiy reyting
                </p>
            </div>


            <div className="flex flex-wrap gap-2">
                {TABS.map(({ value, label }) => (
                    <Button
                        key={value}
                        variant={tab === value ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setTab(value)}
                    >
                        {value === 'faculty'  && <Building2 className="mr-1 h-3.5 w-3.5" />}
                        {value === 'kafedra'  && <Layers     className="mr-1 h-3.5 w-3.5" />}
                        {value === 'teachers' && <Trophy     className="mr-1 h-3.5 w-3.5" />}
                        {label}
                    </Button>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        {TABS.find((t) => t.value === tab)?.label}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                    {tab === 'teachers' && <TeachersPanel />}
                    {tab === 'faculty'  && <FacultyPanel />}
                    {tab === 'kafedra'  && <KafedraPanel />}
                </CardContent>
            </Card>
        </div>
    );
};

export default TeacherRankingPage;