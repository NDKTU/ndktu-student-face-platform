import { useEffect, useState } from 'react';

import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { IndependentTopic, IndependentTopicRequest } from '@/services/independentTopicService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Berilgan bo'lsa — tahrirlash rejimi. */
    topic: IndependentTopic | null;
    isSubmitting: boolean;
    onSubmit: (values: IndependentTopicRequest) => void;
}

/**
 * Mustaqil ish mavzusi oynasi.
 *
 * Formada ikkita maydon: nom va ixtiyoriy izoh. Muddat va baho yo'q —
 * bu sillabusdagi mavzular ro'yxati, topshiriladigan vazifa emas;
 * topshirish kerak bo'lsa, o'sha mavzuga uy vazifasi beriladi.
 */
export const IndependentTopicModal = ({ isOpen, onClose, topic, isSubmitting, onSubmit }: Props) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setTitle(topic?.title ?? '');
        setDescription(topic?.description ?? '');
        setError('');
    }, [isOpen, topic]);

    const handleSubmit = () => {
        const trimmed = title.trim();
        if (!trimmed) {
            setError('Mavzu nomi kiritilishi shart');
            return;
        }
        setError('');
        onSubmit({ title: trimmed, description: description.trim() || null });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={topic ? 'Mavzuni tahrirlash' : "Mustaqil ish mavzusi"}
        >
            <div className="space-y-4">
                <Input
                    label="Mavzu nomi"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Masalan: Operatsion tizimlar tarixi"
                    error={error || undefined}
                />

                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="independent-topic-description">
                        Izoh (ixtiyoriy)
                    </label>
                    <textarea
                        id="independent-topic-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Nimaga e'tibor berish, qanday manbalardan foydalanish..."
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="button" onClick={handleSubmit} isLoading={isSubmitting}>
                        {topic ? 'Saqlash' : "Qo'shish"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
