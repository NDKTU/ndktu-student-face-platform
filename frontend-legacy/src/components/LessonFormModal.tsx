import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { Loader2 } from 'lucide-react';
import { useCreateLesson, useUpdateLesson } from '@/hooks/useLessons';
import type {
    Lesson,
    LessonCreateRequest,
    LessonType,
    LessonUpdateRequest,
} from '@/services/lessonService';

const LESSON_TYPE_OPTIONS = [
    { value: '', label: '—' },
    { value: 'lecture', label: "Ma'ruza" },
    { value: 'seminar', label: 'Seminar' },
    { value: 'independent', label: "Mustaqil ta'lim" },
    { value: 'lab', label: 'Laboratoriya' },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sinfId: number;
    sinfGroupOptions: { value: string; label: string }[];
    sinfGroupIds: Set<number>;
    topicOptions?: { value: string; label: string }[];
    presetTopicId?: number | null;
    editing?: Lesson | null;
}

export const LessonFormModal = ({
    isOpen,
    onClose,
    sinfId,
    sinfGroupOptions,
    sinfGroupIds,
    topicOptions,
    presetTopicId,
    editing,
}: Props) => {
    const createLesson = useCreateLesson();
    const updateLesson = useUpdateLesson();

    const [formGroupId, setFormGroupId] = useState('');
    const [formTopicId, setFormTopicId] = useState('');
    const [formLessonType, setFormLessonType] = useState('');
    const [formTopic, setFormTopic] = useState('');
    const [formDate, setFormDate] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formError, setFormError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            setFormGroupId(editing.group_id.toString());
            setFormTopicId(editing.topic_id != null ? editing.topic_id.toString() : '');
            setFormLessonType(editing.lesson_type ?? '');
            setFormTopic(editing.topic);
            setFormDate(editing.date);
            setFormDescription(editing.description ?? '');
        } else {
            setFormGroupId('');
            setFormTopicId(presetTopicId != null ? presetTopicId.toString() : '');
            setFormLessonType('lecture');
            setFormTopic('');
            setFormDate(new Date().toISOString().slice(0, 10));
            setFormDescription('');
        }
        setFormError('');
    }, [isOpen, editing, presetTopicId]);

    const handleSubmit = () => {
        if (!formGroupId) {
            setFormError('Guruh tanlanmagan');
            return;
        }
        if (!formTopic.trim()) {
            setFormError("Mavzu bo'sh bo'lmasligi kerak");
            return;
        }
        if (!formDate) {
            setFormError('Sana tanlanmagan');
            return;
        }
        const groupIdNum = parseInt(formGroupId, 10);
        if (!sinfGroupIds.has(groupIdNum)) {
            setFormError('Guruh sinfga tegishli emas');
            return;
        }

        const lessonTypeValue = (formLessonType as LessonType) || null;
        const topicIdValue = presetTopicId ?? (formTopicId ? parseInt(formTopicId, 10) : null);

        if (editing) {
            const payload: LessonUpdateRequest = {
                group_id: groupIdNum,
                topic_id: topicIdValue,
                lesson_type: lessonTypeValue,
                topic: formTopic.trim(),
                date: formDate,
                description: formDescription.trim() || null,
            };
            updateLesson.mutate(
                { id: editing.id, data: payload },
                { onSuccess: onClose, onError: () => setFormError('Xatolik yuz berdi') },
            );
        } else {
            const payload: LessonCreateRequest = {
                sinf_id: sinfId,
                group_id: groupIdNum,
                topic_id: topicIdValue,
                lesson_type: lessonTypeValue,
                topic: formTopic.trim(),
                date: formDate,
                description: formDescription.trim() || null,
            };
            createLesson.mutate(payload, {
                onSuccess: onClose,
                onError: () => setFormError('Xatolik yuz berdi'),
            });
        }
    };

    const isPending = createLesson.isPending || updateLesson.isPending;
    const showTopicPicker = presetTopicId == null && topicOptions && topicOptions.length > 1;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Darsni tahrirlash' : 'Yangi dars'}>
            <div className="space-y-4">
                <div>
                    <label className="text-sm font-medium block mb-1">Guruh</label>
                    <Combobox
                        options={sinfGroupOptions}
                        value={formGroupId}
                        onChange={setFormGroupId}
                        placeholder="Guruh tanlang..."
                    />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Dars turi</label>
                    <Combobox
                        options={LESSON_TYPE_OPTIONS}
                        value={formLessonType}
                        onChange={setFormLessonType}
                        placeholder="Tur tanlang..."
                    />
                </div>
                {showTopicPicker && (
                    <div>
                        <label className="text-sm font-medium block mb-1">Mavzu (modul ichidan)</label>
                        <Combobox
                            options={topicOptions!}
                            value={formTopicId}
                            onChange={setFormTopicId}
                            placeholder="Tanlang..."
                        />
                    </div>
                )}
                <div>
                    <label className="text-sm font-medium block mb-1">Mavzu</label>
                    <Input
                        placeholder="Dars mavzusi"
                        value={formTopic}
                        onChange={(e) => setFormTopic(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Sana</label>
                    <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Tavsif (ixtiyoriy)</label>
                    <textarea
                        className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                    />
                </div>
                {formError && <p className="text-sm text-destructive">{formError}</p>}
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
