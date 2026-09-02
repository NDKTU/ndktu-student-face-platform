import { CalendarDays, Check, ExternalLink, Loader2, MapPin, Pin, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import type { Announcement } from '@/services/announcementService';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

interface Props {
    announcement: Announcement;
    onToggle?: (announcement: Announcement) => void;
    isPending?: boolean;
    /** Bosh sahifadagi qisqa ko'rinish: matn kesiladi, banner pastroq. */
    compact?: boolean;
}

/** Yozilish tugmasining holati bitta joyda hisoblanadi: ochiq, yopilgan yoki
 *  joylar tugagan — talabaga nima uchun bosa olmasligi yozilib turadi. */
const registrationHint = (announcement: Announcement): string | null => {
    if (!announcement.registration_enabled) return null;
    if (announcement.is_registered) return null;
    if (announcement.seats_left === 0) return 'Joylar tugagan';
    if (!announcement.registration_open) return "Ro'yxatdan o'tish yopilgan";
    return null;
};

export const AnnouncementCard = ({ announcement, onToggle, isPending, compact }: Props) => {
    const hint = registrationHint(announcement);
    const canToggle = announcement.registration_enabled && (announcement.is_registered || announcement.registration_open);

    return (
        <Card className={cn('overflow-hidden', announcement.pinned && 'border-primary/40')}>
            {announcement.image_url && (
                <img
                    src={announcement.image_url}
                    alt=""
                    className={cn('w-full object-cover', compact ? 'h-28' : 'h-44')}
                />
            )}
            <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-start gap-2">
                    {announcement.pinned && <Pin className="mt-1 h-4 w-4 shrink-0 text-primary" />}
                    <h3 className="min-w-0 flex-1 font-semibold leading-snug">{announcement.title}</h3>
                </div>

                {announcement.body && (
                    <p className={cn('whitespace-pre-line text-sm text-muted-foreground', compact && 'line-clamp-3')}>
                        {announcement.body}
                    </p>
                )}

                {(announcement.event_at || announcement.location) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {announcement.event_at && (
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-4 w-4" />{formatDateTime(announcement.event_at)}
                            </span>
                        )}
                        {announcement.location && (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" />{announcement.location}
                            </span>
                        )}
                    </div>
                )}

                {announcement.registration_enabled && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <Users className="h-4 w-4" />
                            {announcement.registered_count} ta yozilgan
                            {announcement.seats_left != null && ` • ${announcement.seats_left} joy bo'sh`}
                        </span>
                        {announcement.registration_deadline && (
                            <span>Muddat: {formatDateTime(announcement.registration_deadline)}</span>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    {announcement.registration_enabled && onToggle && (
                        <Button
                            size="sm"
                            variant={announcement.is_registered ? 'outline' : 'primary'}
                            disabled={!canToggle || isPending}
                            onClick={() => onToggle(announcement)}
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {announcement.is_registered ? (
                                <><Check className="mr-2 h-4 w-4" /> Yozilgansiz — bekor qilish</>
                            ) : (
                                "Ro'yxatdan o'tish"
                            )}
                        </Button>
                    )}
                    {announcement.link_url && (
                        <a
                            href={announcement.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                            Batafsil <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    )}
                    {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
                </div>
            </CardContent>
        </Card>
    );
};
