import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Pagination } from '@/components/ui/Pagination';
import { Input } from '@/components/ui/Input';
import { Search } from 'lucide-react';
import { useActiveQuizzes } from '@/hooks/useQuizzes';
import { useSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers } from '@/hooks/useTeachers';
import type { Subject } from '@/services/subjectService';
import type { Group } from '@/services/groupService';
import { QuizFilters } from '@/components/quizzes/QuizFilters';
import { QuizTable } from '@/components/quizzes/QuizTable';

const ActiveQuizzesPage = () => {
    const { hasPermission } = useAuth();
    const navigate = useNavigate();

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
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

    const { data: quizzesData, isLoading: isQuizzesLoading } = useActiveQuizzes(
        currentPage,
        pageSize,
        debouncedSearch,
        filterUserId,
        filterGroupId,
        filterSubjectId,
        sortDir,
    );

    const { data: allSubjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));
    const { data: allTeachersData } = useTeachers(1, 1000, undefined, hasPermission('read:teacher'));

    const quizzes = quizzesData?.quizzes || [];
    const totalPages = quizzesData ? Math.ceil(quizzesData.total / pageSize) : 1;
    const allSubjects = allSubjectsData?.subjects || [];
    const allGroups = allGroupsData?.groups || [];
    const allTeachers = allTeachersData?.teachers || [];

    const getSubjectName = (id?: number) => allSubjects.find((s: Subject) => s.id === id)?.name || '-';
    const getGroupName = (id?: number) => allGroups.find((g: Group) => g.id === id)?.name || '-';

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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Faol testlar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Hozirda faol bo'lgan testlar ro'yxati</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Qidirish..."
                        className="pl-8 w-[220px]"
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <QuizFilters
                subjects={allSubjects}
                groups={allGroups}
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
            />
        </div>
    );
};

export default ActiveQuizzesPage;
