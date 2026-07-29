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
        <Modal isOpen={!!quiz} onClose={onClose} title="2-urinish muvaffaqiyatli yaratildi ✅">
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{quiz.title}</span> testi uchun yangi 2-urinish yaratildi.
                    Quyidagi PIN kodni muvaffaqiyatsiz o'tgan talabalar bilan ulashing:
                </p>
                <div className="flex items-center gap-3 p-4 bg-muted rounded-lg border">
                    <span className="text-2xl font-mono font-bold tracking-widest flex-1 text-center">
                        {quiz.pin}
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleCopyPin} title="PIN nusxalash">
                        {isPinCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                    <p>📋 Savollar soni: {quiz.question_number}</p>
                    <p>⏱ Davomiyligi: {quiz.duration} daqiqa</p>
                    <p>🔁 Urinish: {quiz.attempt}</p>
                </div>
                <div className="flex justify-end pt-2">
                    <Button onClick={onClose}>Yopish</Button>
                </div>
            </div>
        </Modal>
    );
};
