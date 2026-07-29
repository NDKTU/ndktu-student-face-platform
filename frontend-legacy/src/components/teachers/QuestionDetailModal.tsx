import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Question } from '@/services/questionService';

interface QuestionDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    question: Question | null;
    subjectName: string;
}

export const QuestionDetailModal = ({ isOpen, onClose, question, subjectName }: QuestionDetailModalProps) => {
    if (!question) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Savol tafsilotlari">
            <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Savol matni</h3>
                    <div
                        className="rounded-lg border bg-muted/50 p-4 text-sm"
                        dangerouslySetInnerHTML={{ __html: question.text }}
                    />
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Variantlar</h3>
                    <div className="grid gap-3">
                        {[
                            { label: 'A', value: question.option_a },
                            { label: 'B', value: question.option_b },
                            { label: 'C', value: question.option_c },
                            { label: 'D', value: question.option_d },
                        ].map((option) => (
                            <div key={option.label} className="flex gap-3 items-start">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                                    {option.label}
                                </div>
                                <div
                                    className="w-full rounded-lg border p-3 text-sm min-h-[3rem]"
                                    dangerouslySetInnerHTML={{ __html: option.value }}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-2 border-t mt-4">
                    <p className="text-sm text-muted-foreground">
                        Fan: <span className="font-medium text-foreground">{subjectName}</span>
                    </p>
                </div>

                <div className="flex justify-end pt-2">
                    <Button onClick={onClose}>Yopish</Button>
                </div>
            </div>
        </Modal>
    );
};
