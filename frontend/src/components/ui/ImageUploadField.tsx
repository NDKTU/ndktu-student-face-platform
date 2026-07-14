/**
 * ImageUploadField.tsx
 *
 * Controlled file-picker for a single image. The parent owns the URL in its
 * state (string | null). On file pick we upload immediately, then call
 * `onChange(url)` so the parent stores a permanent URL rather than a blob.
 *
 * Use anywhere the schema is "save an image URL on a record". Replaces raw
 * "Rasm URL" text inputs.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { uploadService } from '@/services/uploadService';

export interface ImageUploadFieldProps {
    value: string | null | undefined;
    onChange: (url: string | null) => void;
    label?: string;
    helperText?: string;
    disabled?: boolean;
    /** Size of the preview thumbnail. Default 80. */
    previewSize?: number;
    /** Defaults to `uploadService.uploadImage` (question images folder). */
    uploadFn?: (file: File) => Promise<{ url: string }>;
}

export function ImageUploadField({
    value,
    onChange,
    label,
    helperText = "PNG, JPG — maksimal ~5MB",
    disabled,
    previewSize = 80,
    uploadFn = uploadService.uploadImage,
}: ImageUploadFieldProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [localPreview, setLocalPreview] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Clean up blob URLs on unmount / when swapped out
    useEffect(() => {
        return () => {
            if (localPreview) URL.revokeObjectURL(localPreview);
        };
    }, [localPreview]);

    const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('Faqat rasm fayllari qabul qilinadi');
            return;
        }

        // Show local preview immediately for UX
        if (localPreview) URL.revokeObjectURL(localPreview);
        const objUrl = URL.createObjectURL(file);
        setLocalPreview(objUrl);
        setError(null);
        setIsUploading(true);
        try {
            const { url } = await uploadFn(file);
            onChange(url);
            // Keep localPreview until next render — server URL may still be loading
        } catch {
            setError('Rasm yuklashda xatolik');
        } finally {
            setIsUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleClear = () => {
        if (localPreview) URL.revokeObjectURL(localPreview);
        setLocalPreview(null);
        setError(null);
        onChange(null);
    };

    const displayedSrc = localPreview ?? value ?? null;
    const sizePx = `${previewSize}px`;

    return (
        <div className="space-y-2">
            {label && <label className="block text-sm font-medium text-foreground">{label}</label>}

            <input
                type="file"
                accept="image/*"
                ref={inputRef}
                onChange={handlePick}
                disabled={disabled || isUploading}
                className="hidden"
            />

            <div className="flex items-start gap-3">
                <div
                    className="relative shrink-0 rounded-md border border-dashed border-border bg-muted/30 overflow-hidden"
                    style={{ width: sizePx, height: sizePx }}
                >
                    {displayedSrc ? (
                        <>
                            <img src={displayedSrc} alt="preview" className="h-full w-full object-cover" />
                            {isUploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                                </div>
                            )}
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                                    title="Rasmni olib tashlash"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            {isUploading
                                ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                : <Upload className="h-5 w-5 text-muted-foreground" />
                            }
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled || isUploading}
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        {displayedSrc ? "Boshqa rasm tanlash" : "Rasm tanlash"}
                    </Button>
                    {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
            </div>
        </div>
    );
}
