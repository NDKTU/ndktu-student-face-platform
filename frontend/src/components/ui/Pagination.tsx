import { Button } from './Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    isLoading?: boolean;
}

export const Pagination = ({
    currentPage,
    totalPages,
    onPageChange,
    isLoading = false,
}: PaginationProps) => {
    // Telefonda 5 ta raqam + ikki strelka sig'maydi — 3 tasi ko'rsatiladi.
    const maxVisiblePages = useIsMobile() ? 3 : 5;

    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pages = [];
        const half = Math.floor(maxVisiblePages / 2);

        if (totalPages <= maxVisiblePages) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            let startPage = Math.max(1, currentPage - half);
            let endPage = Math.min(totalPages, currentPage + half);

            if (startPage === 1) {
                endPage = Math.min(totalPages, maxVisiblePages);
            } else if (endPage === totalPages) {
                startPage = Math.max(1, totalPages - maxVisiblePages + 1);
            }

            for (let i = startPage; i <= endPage; i++) {
                pages.push(i);
            }
        }
        return pages;
    };

    return (
        <div className="flex flex-wrap items-center justify-center gap-2 py-4">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                aria-label="Previous page"
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>

            {getPageNumbers().map((page) => (
                <Button
                    key={page}
                    variant={currentPage === page ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(page)}
                    disabled={isLoading}
                    className={currentPage === page ? 'pointer-events-none' : ''}
                >
                    {page}
                </Button>
            ))}

            <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
                aria-label="Next page"
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
};
