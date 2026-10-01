import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import type { GeneralTestPayload, GeneralTestSummary } from '@/services/generalTestService';

interface Props {
    editing: GeneralTestSummary | null;
    onClose: () => void;
    onSubmit: (payload: GeneralTestPayload) => void;
    isPending: boolean;
}

export function GeneralTestFormModal({ editing, onClose, onSubmit, isPending }: Props) {
    const [title, setTitle] = useState(editing?.title ?? '');
    const [description, setDescription] = useState(editing?.description ?? '');
    const [duration, setDuration] = useState(String(editing?.duration ?? 30));
    const [attempts, setAttempts] = useState(String(editing?.attempt_limit ?? 1));
    const [isActive, setIsActive] = useState(editing?.is_active ?? false);
    const [error, setError] = useState<string | null>(null);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const durationNum = Number(duration);
        const attemptsNum = Number(attempts);
        if (!title.trim()) return setError('Test nomini kiriting');
        if (!Number.isInteger(durationNum) || durationNum < 1 || durationNum > 600) {
            return setError('Vaqt 1 dan 600 daqiqagacha bo\'lishi kerak');
        }
        if (!Number.isInteger(attemptsNum) || attemptsNum < 1 || attemptsNum > 100) {
            return setError('Urinishlar soni 1 dan 100 gacha bo\'lishi kerak');
        }
        setError(null);
        onSubmit({
            title: title.trim(),
            description: description.trim() || null,
            duration: durationNum,
            attempt_limit: attemptsNum,
            is_active: isActive,
        });
    };

    return (
        <Modal isOpen onClose={onClose} title={editing ? 'Testni tahrirlash' : 'Yangi umumiy test'}>
            <form onSubmit={submit} className="space-y-4">
                <Input label="Nomi" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                <div className="space-y-1.5">
                    <label htmlFor="gt-description" className="text-sm font-medium text-foreground">
                        Tavsif (ixtiyoriy)
                    </label>
                    <textarea
                        id="gt-description"
                        className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Input label="Vaqt (daqiqa)" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} />
                    <Input label="Urinishlar soni" type="number" min={1} max={100} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                    <div>
                        <p className="text-sm font-medium text-foreground">Faol</p>
                        <p className="text-xs text-muted-foreground">Faol test barcha foydalanuvchilarga ko'rinadi</p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" isLoading={isPending}>
                        Saqlash
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
