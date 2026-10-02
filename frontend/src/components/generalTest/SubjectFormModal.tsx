import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { GeneralTestSubject, SubjectPayload } from '@/services/generalTestService';

interface Props {
    editing: GeneralTestSubject | null;
    onClose: () => void;
    onSubmit: (payload: SubjectPayload) => void;
    isPending: boolean;
}

export function SubjectFormModal({ editing, onClose, onSubmit, isPending }: Props) {
    const [name, setName] = useState(editing?.name ?? '');
    const [description, setDescription] = useState(editing?.description ?? '');
    const [error, setError] = useState<string | null>(null);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return setError('Fan nomini kiriting');
        setError(null);
        onSubmit({ name: name.trim(), description: description.trim() || null });
    };

    return (
        <Modal isOpen onClose={onClose} title={editing ? 'Fanni tahrirlash' : 'Yangi fan'}>
            <form onSubmit={submit} className="space-y-4">
                <Input label="Nomi" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <div className="space-y-1.5">
                    <label htmlFor="gts-description" className="text-sm font-medium text-foreground">
                        Tavsif (ixtiyoriy)
                    </label>
                    <textarea
                        id="gts-description"
                        className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
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
