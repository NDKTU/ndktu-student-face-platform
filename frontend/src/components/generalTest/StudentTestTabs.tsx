import { PageTabs } from '@/components/ui/PageTabs';
import { useAuth } from '@/context/AuthContext';
import { useRoleView } from '@/hooks/useRoleView';
import { STUDENT_ELEMENTAR_RESULTS, STUDENT_ELEMENTAR_TAKE } from './studentPaths';

const TABS = {
    take: [
        { label: 'Oddiy testlar', href: '/quiz-test' },
        { label: 'Elementar testlar', href: STUDENT_ELEMENTAR_TAKE },
    ],
    results: [
        { label: 'Oddiy testlar', href: '/results' },
        { label: 'Elementar testlar', href: STUDENT_ELEMENTAR_RESULTS },
    ],
};

/**
 * «Test ishlash» va «Natijalar» ichidagi oddiy / elementar test tablari.
 *
 * Faqat talaba ko'rinishida: xodimlarda elementar test o'z bo'limida
 * (boshqaruv, natijalar, «Testni ishlash»), ularga bu tablar ortiqcha.
 */
export function StudentTestTabs({ section }: { section: keyof typeof TABS }) {
    const { isStudent } = useRoleView();
    const { hasPermission } = useAuth();
    if (!isStudent || !hasPermission('general_test:take')) return null;
    return <PageTabs tabs={TABS[section]} className="mb-0" />;
}
