interface CrumbItem {
    label: string;
    onClick?: () => void;
}

export const Crumbs = ({ items }: { items: CrumbItem[] }) => (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        {items.map((it, i) => (
            <span key={i} className="flex items-center gap-1">
                {i > 0 && <span>/</span>}
                {it.onClick
                    ? <button onClick={it.onClick} className="hover:text-foreground hover:underline">{it.label}</button>
                    : <span className="text-foreground font-medium">{it.label}</span>}
            </span>
        ))}
    </nav>
);
