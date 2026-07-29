import { useState } from 'react';

export interface TagItem {
    id: string | number;
    name: string;
}

export const ExpandableTags = ({ items, limit = 5 }: { items: TagItem[]; limit?: number }) => {
    const [expanded, setExpanded] = useState(false);

    if (!items || items.length === 0) {
        return <span>-</span>;
    }

    const showExpandButton = items.length > limit;
    const displayedItems = expanded ? items : items.slice(0, limit);

    return (
        <div className="flex flex-wrap gap-1 max-w-[300px]">
            {displayedItems.map(item => (
                <span key={item.id} className="inline-flex items-center rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold text-foreground bg-background">
                    {item.name}
                </span>
            ))}
            {showExpandButton && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(!expanded);
                    }}
                    className="inline-flex items-center rounded-full bg-secondary/50 hover:bg-secondary px-2.5 py-0.5 text-xs font-semibold transition-colors text-secondary-foreground cursor-pointer"
                >
                    {expanded ? "Yashirish" : `+${items.length - limit} ko'proq`}
                </button>
            )}
        </div>
    );
};
