import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useCreateCourseTopic, useUpdateCourseTopic } from '@/hooks/useCourseTopics';
import { TOPIC_TYPE_OPTIONS, type CourseTopic, type CourseTopicType } from '@/services/courseTopicService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    courseId: number;
    nextOrder: number;
    topic?: CourseTopic | null;
}

export function CourseTopicModal({ isOpen, onClose, courseId, nextOrder, topic }: Props) {
    const createTopic = useCreateCourseTopic();
    const updateTopic = useUpdateCourseTopic();
    // Mavzuning nomi turdan olinadi — alohida sarlavha so'ralmaydi.
    // Standart tur yo'q: o'qituvchi ataylab tanlashi kerak, aks holda
    // hammasi jimgina «ma'ruza» bo'lib qolardi.
    const [topicType, setTopicType] = useState<CourseTopicType | ''>('');
    const [orderIndex, setOrderIndex] = useState(nextOrder);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setTopicType(topic?.topic_type ?? '');
        setOrderIndex(topic?.order_index ?? nextOrder);
        setError('');
    }, [isOpen, nextOrder, topic]);

    const save = async () => {
        if (!topicType) {
            setError("Mashg'ulot turini tanlang");
            return;
        }
        setError('');
        try {
            if (topic) {
                await updateTopic.mutateAsync({
                    id: topic.id,
                    data: { topic_type: topicType, order_index: orderIndex },
                });
            } else {
                await createTopic.mutateAsync({
                    course_id: courseId,
                    topic_type: topicType,
                    order_index: orderIndex,
                });
            }
            onClose();
        } catch (cause) {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || "Mavzuni saqlashda xatolik yuz berdi");
        }
    };

    const saving = createTopic.isPending || updateTopic.isPending;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={topic ? "Mavzuni tahrirlash" : "Yangi mavzu"}>
            <div className="space-y-5">
                <div>
                    <label className="mb-2 block text-sm font-medium">Mashg'ulot turi</label>
                    <Combobox
                        options={TOPIC_TYPE_OPTIONS}
                        value={topicType}
                        onChange={(value) => setTopicType(value as CourseTopicType)}
                        placeholder="Turini tanlang"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        Mavzu ichida yaratilgan darslar shu turni oladi.
                    </p>
                </div>
                <div className="max-w-32">
                    <label className="mb-2 block text-sm font-medium">Tartib raqami</label>
                    <Input
                        type="number"
                        min={1}
                        value={orderIndex}
                        onChange={(event) => setOrderIndex(Math.max(1, Number(event.target.value) || 1))}
                    />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-border/60 px-6 pt-4">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Bekor qilish</Button>
                    <Button onClick={() => void save()} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Saqlash
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
