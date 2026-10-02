import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAddGeneralTestGroups } from '@/hooks/useGeneralTests';
import { apiErrorMessage } from '@/utils/apiError';
import { GroupChecklist } from './GroupChecklist';
import { toggleGroup } from './labels';

interface Props {
    testId: number;
    /** Allaqachon biriktirilganlar — ro'yxatda belgilangan va o'chirilgan holda. */
    assignedIds: number[];
    onClose: () => void;
}

export function GroupPickerModal({ testId, assignedIds, onClose }: Props) {
    const [selected, setSelected] = useState<Map<number, string>>(new Map());
    const addGroups = useAddGeneralTestGroups(testId);

    const submit = () =>
        addGroups.mutate([...selected.keys()], {
            onSuccess: () => {
                toast.success(`${selected.size} ta guruh biriktirildi`);
                onClose();
            },
            onError: (e) => toast.error(apiErrorMessage(e, 'Guruhlarni biriktirishda xatolik')),
        });

    return (
        <Modal isOpen onClose={onClose} title="Guruh biriktirish" className="md:max-w-2xl">
            <div className="space-y-4">
                <GroupChecklist
                    selected={selected}
                    onToggle={(group) => setSelected((prev) => toggleGroup(prev, group))}
                    assignedIds={assignedIds}
                />
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                    <Button variant="ghost" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button disabled={selected.size === 0} isLoading={addGroups.isPending} onClick={submit}>
                        Biriktirish ({selected.size})
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
