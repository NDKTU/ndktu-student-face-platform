import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { useGeneralTestSubjects } from '@/hooks/useGeneralTests';
import type { GeneralTestPayload, GeneralTestSummary } from '@/services/generalTestService';
import { GroupChecklist } from './GroupChecklist';
import { composeTitle, toggleGroup } from './labels';

interface Props {
    editing: GeneralTestSummary | null;
    /** Fan sahifasidan ochilganda — o'sha fan oldindan tanlangan bo'ladi. */
    defaultSubjectId?: number;
    onClose: () => void;
    onSubmit: (payload: GeneralTestPayload) => void;
    isPending: boolean;
}

export function GeneralTestFormModal({ editing, defaultSubjectId, onClose, onSubmit, isPending }: Props) {
    const { data: subjects } = useGeneralTestSubjects(1, 500);
    const subjectOptions = useMemo(
        () => (subjects?.subjects ?? []).map((s) => ({ value: String(s.id), label: s.name })),
        [subjects],
    );
    const [subjectId, setSubjectId] = useState(String(editing?.subject.id ?? defaultSubjectId ?? ''));
    // Guruhlar faqat yaratishda shu yerda tanlanadi; keyin — test sahifasidagi
    // «Guruhlar» kartasida.
    const [groups, setGroups] = useState<Map<number, string>>(new Map());
    const [duration, setDuration] = useState(String(editing?.duration ?? 30));
    const [attempts, setAttempts] = useState(String(editing?.attempt_limit ?? 1));
    const [questionNumber, setQuestionNumber] = useState(editing?.question_number ? String(editing.question_number) : '');
    const [isActive, setIsActive] = useState(editing?.is_active ?? false);
    const [error, setError] = useState<string | null>(null);
    const subjectName = subjects?.subjects.find((s) => String(s.id) === subjectId)?.name ?? '';

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const durationNum = Number(duration);
        const attemptsNum = Number(attempts);
        if (!subjectId) return setError('Fanni tanlang');
        if (!Number.isInteger(durationNum) || durationNum < 1 || durationNum > 600) {
            return setError('Vaqt 1 dan 600 daqiqagacha bo\'lishi kerak');
        }
        if (!Number.isInteger(attemptsNum) || attemptsNum < 1 || attemptsNum > 100) {
            return setError('Urinishlar soni 1 dan 100 gacha bo\'lishi kerak');
        }
        const questionNum = questionNumber.trim() ? Number(questionNumber) : null;
        if (questionNum !== null && (!Number.isInteger(questionNum) || questionNum < 1 || questionNum > 1000)) {
            return setError("Savollar soni 1 dan 1000 gacha bo'lishi yoki bo'sh qolishi kerak");
        }
        setError(null);
        onSubmit({
            subject_id: Number(subjectId),
            ...(editing ? {} : { group_ids: [...groups.keys()] }),
            duration: durationNum,
            attempt_limit: attemptsNum,
            question_number: questionNum,
            is_active: isActive,
        });
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={editing ? 'Testni tahrirlash' : 'Yangi elementar test'}
            className={editing ? undefined : 'md:max-w-2xl'}
        >
            <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Fan</span>
                    <Combobox
                        options={subjectOptions}
                        value={subjectId}
                        onChange={setSubjectId}
                        placeholder={subjectOptions.length ? 'Fanni tanlang' : "Avval «Fanlar» bo'limida fan oching"}
                        searchPlaceholder="Fanni qidirish..."
                    />
                </div>
                {!editing && (
                    <div className="space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Guruhlar (ixtiyoriy)</span>
                        <GroupChecklist selected={groups} onToggle={(group) => setGroups((prev) => toggleGroup(prev, group))} />
                    </div>
                )}
                <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Test nomi fan va guruhlardan avtomatik tuziladi</p>
                    {!editing && (
                        <p className="mt-0.5 text-sm font-medium text-foreground">
                            {subjectName ? composeTitle(subjectName, [...groups.values()]) : '—'}
                        </p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Input label="Vaqt (daqiqa)" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} />
                    <Input label="Urinishlar soni" type="number" min={1} max={100} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
                    <Input
                        label="Savollar soni"
                        type="number"
                        min={1}
                        max={1000}
                        placeholder="Hammasi"
                        value={questionNumber}
                        onChange={(e) => setQuestionNumber(e.target.value)}
                    />
                    <p className="col-span-2 text-xs text-muted-foreground sm:col-span-3">
                        Savollar soni — har urinishda testdagi savollardan tasodifiy nechtasi beriladi. Bo'sh qolsa, hammasi
                        beriladi.
                    </p>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                    <div>
                        <p className="text-sm font-medium text-foreground">Faol</p>
                        <p className="text-xs text-muted-foreground">
                            Faol test fanga biriktirilgan foydalanuvchilar va testga biriktirilgan guruhlarga ko'rinadi
                        </p>
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
