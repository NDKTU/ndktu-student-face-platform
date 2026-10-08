import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { MyGeneralTestResultList } from '@/components/generalTest/MyGeneralTestResultList';
import { StudentTestTabs } from '@/components/generalTest/StudentTestTabs';
import { useMyGeneralTestResults } from '@/hooks/useGeneralTests';

/**
 * Talabaning elementar test natijalari — «Natijalar» ichidagi tab
 * (`/results/elementar`). Ma'lumot «Testni ishlash» sahifasidagi
 * «Mening natijalarim» bilan bir manbadan (`/general-test/my-results`).
 */
export default function StudentGeneralTestResultsPage() {
    const { data: results, isLoading, isError, refetch } = useMyGeneralTestResults();

    return (
        <div className="space-y-6">
            <PageHeader title="Natijalar" description="Sizning elementar test natijalaringiz" />
            <StudentTestTabs section="results" />

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))}
                </div>
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : !results?.length ? (
                <Card>
                    <EmptyState
                        icon={<ClipboardCheck className="h-6 w-6" />}
                        title="Natijalar topilmadi"
                        description="Siz hali birorta ham elementar testni yakunlamagansiz."
                    />
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-4">
                        <MyGeneralTestResultList results={results} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
