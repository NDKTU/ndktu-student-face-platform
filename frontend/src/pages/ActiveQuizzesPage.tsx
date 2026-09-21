import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Pagination } from '@/components/ui/Pagination';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search } from 'lucide-react';
import { useActiveQuizzes } from '@/hooks/useQuizzes';
import { useSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers } from '@/hooks/useTeachers';
import type { Subject } from '@/services/subjectService';
import type { Group } from '@/services/groupService';
import { QuizFilters } from '@/components/quizzes/QuizFilters';
import { QuizTable } from '@/components/quizzes/QuizTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FILTER_PAGE_SIZE, withSelected } from '@/utils/filterOptions';
import { subjectOption } from '@/utils/subject';

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

    // Ikkita alohida so'rov, ataylab:
    //  * `allSubjectsData` — jadvalda fan NOMINI ko'rsatish uchun
    //    (`getSubjectName`). Quiz javobida faqat `subject_id` bor,
    //    shuning uchun nomlar ro'yxatdan qidiriladi va uni qisqartirib
    //    bo'lmaydi: qatorlarda «-» chiqib qolardi.
    //  * `subjectOptionsData` — filtr ro'yxati uchun. Fanlar 2978 ta,
    //    hammasi yuklanmaydi; qidiruv serverga uzatiladi.
    const { data: allSubjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const [subjectQuery, setSubjectQuery] = useState('');
    const debouncedSubjectQuery = useDebouncedValue(subjectQuery);
    const { data: subjectOptionsData } = useSubjects(
        1,
        FILTER_PAGE_SIZE,
        debouncedSubjectQuery,
        undefined,
        hasPermission('read:subject'),
    );
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));
    const { data: allTeachersData } = useTeachers(1, 1000, undefined, hasPermission('read:teacher'));

    const quizzes = quizzesData?.quizzes || [];
    const totalPages = quizzesData ? Math.ceil(quizzesData.total / pageSize) : 1;
    const allSubjects = allSubjectsData?.subjects || [];
    // Tanlangan fan qidiruv natijasidan tushib qolsa, Combobox nom
    // o'rniga placeholder ko'rsatardi — go'yo filtr olib tashlangandek.
    const selectedSubjectOption = filterSubjectId
        ? {
              value: String(filterSubjectId),
              label: allSubjects.find((s) => s.id === filterSubjectId)?.name ?? `#${filterSubjectId}`,
          }
        : null;
    const subjectOptions = withSelected(
        (subjectOptionsData?.subjects || []).map(subjectOption),
        selectedSubjectOption,
    );
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
                subjects={allSubjects}
                subjectOptions={subjectOptions}
                onSubjectSearchChange={setSubjectQuery}
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
