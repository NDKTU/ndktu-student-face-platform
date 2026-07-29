import { cn } from '@/utils/utils';

interface SkeletonProps {
    className?: string;
}

/** Neutral shimmer placeholder. Compose with width/height utilities. */
const Skeleton = ({ className }: SkeletonProps) => (
    <div className={cn('animate-pulse rounded-[10px] bg-[#EEF0F6]', className)} />
);

export default Skeleton;
