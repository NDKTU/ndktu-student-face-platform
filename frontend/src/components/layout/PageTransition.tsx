import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

/**
 * Universal PageTransition wrapper:
 * Triggers a fast (180ms) GPU-accelerated fade-in + subtle slide-up
 * every time the route pathname changes.
 */
export const PageTransition = ({ children, className }: PageTransitionProps) => {
    const location = useLocation();

    return (
        <div
            key={location.pathname}
            className={cn('animate-page-enter w-full', className)}
        >
            {children}
        </div>
    );
};

export default PageTransition;
