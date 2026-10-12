/** Bekend bilan bir xil (`core/utils/proctoring.py`). */
export const NO_FACE_FINISH_PERMISSION = 'manage:proctoring_auto_finish';

/** Formadan yuboriladigan qiymat: ruxsatsiz — umuman yo'q (o'zgarmaydi), o'chiq — 0. */
export const noFaceFinishPayload = (canEdit: boolean, proctoringMode: string, value: number | null) =>
    canEdit && proctoringMode === 'face' ? { no_face_finish_seconds: value ?? 0 } : {};
