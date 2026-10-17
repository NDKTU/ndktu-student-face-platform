import { FaceControlPicker, type FaceControlLevel } from '@/components/common/FaceControlPicker';
import type { ProctoringMode } from '@/services/quizService';

const TO_LEVEL: Record<ProctoringMode, FaceControlLevel> = {
    standard: 'off',
    face_entry: 'entry',
    face: 'continuous',
};

const TO_MODE: Record<FaceControlLevel, ProctoringMode> = {
    off: 'standard',
    entry: 'face_entry',
    continuous: 'face',
};

interface Props {
    value: ProctoringMode;
    onChange: (mode: ProctoringMode) => void;
    error?: string;
}

/**
 * Test rejimi — oddiy test, dars testi, oraliq nazorat va elementar testda
 * bir xil. Ko'rinishi Zoom seansidagi bilan umumiy (`FaceControlPicker`).
 */
export function ProctoringModePicker({ value, onChange, error }: Props) {
    return (
        <FaceControlPicker
            value={TO_LEVEL[value] ?? 'off'}
            onChange={(level) => onChange(TO_MODE[level])}
            hints={{ continuous: "Butun test davomida kamera kuzatadi — begona odam bo'lsa test to'xtaydi" }}
            error={error}
        />
    );
}
