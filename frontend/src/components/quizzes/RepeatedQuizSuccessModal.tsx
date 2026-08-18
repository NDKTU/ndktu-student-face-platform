import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Check, Copy } from 'lucide-react';
import type { Quiz } from '@/services/quizService';

interface RepeatedQuizSuccessModalProps {
    quiz: Quiz | null;
    onClose: () => void;
}

export const RepeatedQuizSuccessModal = ({ quiz, onClose }: RepeatedQuizSuccessModalProps) => {
    const [isPinCopied, setIsPinCopied] = useState(false);

    if (!quiz) return null;

    const handleCopyPin = () => {
        if (quiz.pin) {
            navigator.clipboard.writeText(quiz.pin);
            setIsPinCopied(true);
            setTimeout(() => setIsPinCopied(false), 2000);
        }
    };

    return (
        <Modal isOpen={!!quiz} onClose={onClose} title="2-urinish muvaffaqiyatli yaratildi">
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{quiz.title}</span> testi uchun yangi 2-urinish yaratildi.
                    Quyidagi PIN kodni muvaffaqiyatsiz o'tgan talabalar bilan ulashing:
                </p>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-4">
                    <span className="flex-1 text-center font-mono text-2xl font-bold tracking-widest">
                        {quiz.pin}
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleCopyPin} title="PIN nusxalash">
                        {isPinCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-muted">Savollar soni: {quiz.question_number}</span>
                    <span className="badge badge-muted">Davomiyligi: {quiz.duration} daqiqa</span>
                    <span className="badge badge-primary">Urinish: {quiz.attempt}</span>
                </div>
                <div className="flex justify-end pt-2">
                    <Button onClick={onClose}>Yopish</Button>
                </div>
            </div>
        </Modal>
    );
};
