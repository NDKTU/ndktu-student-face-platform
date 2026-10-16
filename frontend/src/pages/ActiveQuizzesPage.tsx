import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Pagination } from '@/components/ui/Pagination';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search } from 'lucide-react';
import { useActiveQuizzes } from '@/hooks/useQuizzes';
import { useSubjectFilter } from '@/hooks/useSubjects';
import { useGroupFilter } from '@/hooks/useGroups';
import { useTeacherOptions } from '@/hooks/useTeachers';
import { QuizFilters } from '@/components/quizzes/QuizFilters';
import { QuizTable } from '@/components/quizzes/QuizTable';

const ActiveQuizzesPage = () => {
    const { hasPermission } = useAuth();
    const navigate = useNavigate();

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [filterSubjectId, setFilterSubjectId] = useState<number | undefined>(undefined);
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);
    const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined);
    const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: quizzesData, isLoading: isQuizzesLoading, isError: isQuizzesError, refetch: refetchQuizzes } = useActiveQuizzes(
        currentPage,
        pageSize,
        debouncedSearch,
        filterUserId,
        filterGroupId,
        filterSubjectId,
        sortDir,
    );

    // Fan filtri — qidiruv serverda; jadvaldagi nomlar javobning o'zidan
    // (`subject_name`). Ilgari 1000 ta fan yuklanib, qolgan 2254 tasi
    // jadvalda «-» va filtrda yo'q edi.
    const subjectFilter = useSubjectFilter(filterSubjectId, hasPermission('read:subject'));
    const groupFilter = useGroupFilter(filterGroupId, hasPermission('read:group'));
    const { data: allTeachersData } = useTeacherOptions(undefined, hasPermission('read:teacher'));

    const quizzes = quizzesData?.quizzes || [];
    const totalPages = quizzesData ? Math.ceil(quizzesData.total / pageSize) : 1;
    const allTeachers = allTeachersData ?? [];

    // Nomlar javobning o'zidan (`subject_name` / `group_name`).
    const getSubjectName = (id?: number) => quizzes.find((q) => q.subject_id === id)?.subject_name || '-';
    const getGroupName = (id?: number) =>
        quizzes.find((q) => q.group_id === id)?.group_name || '-';

    const clearFilters = () => {
        setFilterSubjectId(undefined);
        setFilterGroupId(undefined);
        setFilterUserId(undefined);
        setSearchTerm('');
        setSortDir('desc');
    };

    const hasActiveFilters =
        filterSubjectId !== undefined ||
        filterGroupId !== undefined ||
        filterUserId !== undefined ||
        searchTerm !== '' ||
        sortDir !== 'desc';

    return (
        <div className="space-y-6">
            <PageHeader
                title="Faol testlar"
                description="Hozirda faol bo'lgan testlar ro'yxati"
                actions={
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Qidirish..."
                            className="pl-8 w-full sm:w-[220px]"
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        />
                    </div>
                }
            />

            <QuizFilters
                subjectOptions={subjectFilter.options}
                onSubjectSearchChange={subjectFilter.onSearch}
                groupOptions={groupFilter.options}
                onGroupSearchChange={groupFilter.onSearch}
                teachers={allTeachers}
                filterSubjectId={filterSubjectId}
                onSubjectChange={setFilterSubjectId}
                filterGroupId={filterGroupId}
                onGroupChange={setFilterGroupId}
                filterUserId={filterUserId}
                onUserChange={setFilterUserId}
                sortDir={sortDir}
                onSortDirChange={setSortDir}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearFilters}
                hideStatusFilter
            />

            <QuizTable
                quizzes={quizzes}
                isLoading={isQuizzesLoading}
                isError={isQuizzesError}
                onRetry={() => refetchQuizzes()}
                isTeacher={false}
                hasActiveFilters={hasActiveFilters}
                isUpdatingStatusId={null}
                isUpdatePending={false}
                isRepeatPending={false}
                getSubjectName={getSubjectName}
                getGroupName={getGroupName}
                onStart={(quiz, modeOverride) => {
                    const params = new URLSearchParams({ quizId: String(quiz.id) });
                    if (modeOverride) params.set('mode', modeOverride);
                    navigate(`/quiz-test?${params.toString()}`);
                }}
                readOnly
            />

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isQuizzesLoading}
                totalItems={quizzesData?.total ?? 0}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
            />
        </div>
    );
};

export default ActiveQuizzesPage;
