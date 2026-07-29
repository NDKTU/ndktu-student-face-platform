import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loader2 } from 'lucide-react';
import { useCreateAssignment, useUpdateAssignment } from '@/hooks/useAssignments';
import type { Assignment } from '@/services/assignmentService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sinfId: number;
    lessonId?: number | null;
    topicId?: number | null;
    editing?: Assignment | null;
}

export const AssignmentFormModal = ({
    isOpen,
    onClose,
    sinfId,
    lessonId,
    topicId,
    editing,
}: Props) => {
    const createMut = useCreateAssignment();
    const updateMut = useUpdateAssignment();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [maxGrade, setMaxGrade] = useState('100');
    const [allowFile, setAllowFile] = useState(true);
    const [allowText, setAllowText] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            setTitle(editing.title);
            setDescription(editing.description ?? '');
            setDeadline(editing.deadline.slice(0, 16));
            setMaxGrade(editing.max_grade.toString());
            setAllowFile(editing.allow_file);
            setAllowText(editing.allow_text);
        } else {
            const future = new Date();
            future.setDate(future.getDate() + 7);
            setTitle('');
            setDescription('');
            setDeadline(future.toISOString().slice(0, 16));
            setMaxGrade('100');
            setAllowFile(true);
            setAllowText(true);
        }
        setError('');
    }, [isOpen, editing]);

    const handleSubmit = () => {
        if (!title.trim() || !deadline) {
            setError("Sarlavha va muddat to'ldirilishi kerak");
            return;
        }
        const base = {
            title: title.trim(),
            description: description.trim() || null,
            deadline: new Date(deadline).toISOString(),
            max_grade: parseInt(maxGrade, 10) || 100,
            allow_file: allowFile,
            allow_text: allowText,
            allowed_file_types: [],
        };
        if (editing) {
            updateMut.mutate(
                { id: editing.id, data: { ...base, lesson_id: lessonId, topic_id: topicId } },
                { onSuccess: onClose, onError: () => setError('Xatolik') },
            );
        } else {
            createMut.mutate(
                { ...base, sinf_id: sinfId, lesson_id: lessonId, topic_id: topicId },
                { onSuccess: onClose, onError: () => setError('Xatolik') },
            );
        }
    };

    const isPending = createMut.isPending || updateMut.isPending;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editing ? 'Topshiriqni tahrirlash' : 'Yangi topshiriq'}
        >
            <div className="space-y-3">
                <div>
                    <label className="text-sm font-medium block mb-1">Sarlavha</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Tavsif</label>
                    <textarea
                        className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Muddat (deadline)</label>
                    <Input
                        type="datetime-local"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Maksimal ball</label>
                    <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={maxGrade}
                        onChange={(e) => setMaxGrade(e.target.value)}
                    />
                </div>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={allowText}
                            onChange={(e) => setAllowText(e.target.checked)}
                            className="accent-primary"
                        />
                        Matn javob
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={allowFile}
                            onChange={(e) => setAllowFile(e.target.checked)}
                            className="accent-primary"
                        />
                        Fayl
                    </label>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Bekor qilish
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editing ? 'Saqlash' : "Qo'shish"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
