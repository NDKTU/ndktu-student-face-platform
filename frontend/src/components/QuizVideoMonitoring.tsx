import { useEffect, useState, useCallback, useRef } from 'react';
import { UserCheck, UserX, UserSearch, AlertTriangle } from 'lucide-react';
import { useVideoMonitoring } from '@/hooks/useVideoMonitoring';

export interface QuizVideoMonitoringProps {
    active: boolean;
    onCheatingDetected: (imageData: string) => void;
    onDifferentPersonDetected: (imageData: string) => void;
    faceDetectionServiceUrl: string;
    token?: string;
    imageUrl?: string;
}

export function QuizVideoMonitoring({
    active,
    onCheatingDetected,
    onDifferentPersonDetected,
    faceDetectionServiceUrl,
    token,
    imageUrl,
}: QuizVideoMonitoringProps) {
    const [warnings, setWarnings] = useState(0);
    const warningsRef = useRef(0);
    const lastWarningTimeRef = useRef(0);
    const [showWarningText, setShowWarningText] = useState(false);
    const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleViolation = useCallback((imageData: string, type: 'multiple' | 'different') => {
        const now = Date.now();
        // Prevent rapid warning increments (de-bounce warnings every 3 seconds)
        if (now - lastWarningTimeRef.current < 3000) return;

        lastWarningTimeRef.current = now;
        const nextWarnings = warningsRef.current + 1;
        warningsRef.current = nextWarnings;
        setWarnings(nextWarnings);
        setShowWarningText(true);

        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = setTimeout(() => setShowWarningText(false), 4000);

        if (nextWarnings >= 3) {
            if (type === 'multiple') onCheatingDetected(imageData);
            else onDifferentPersonDetected(imageData);
        }
    }, [onCheatingDetected, onDifferentPersonDetected]);

    const { state, startMonitoring, stopMonitoring, videoRef } = useVideoMonitoring({
        faceDetectionServiceUrl,
        token,
        onMultipleFacesDetected: (img) => handleViolation(img, 'multiple'),
        onDifferentPersonDetected: (img) => handleViolation(img, 'different'),
        frameInterval: 500,
        imageUrl,
    });

    useEffect(() => {
        if (active && !state.isActive) {
            startMonitoring();
        } else if (!active && state.isActive) {
            stopMonitoring();
        }
    }, [active, state.isActive, startMonitoring, stopMonitoring]);

    useEffect(() => {
        return () => {
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        };
    }, []);

    if (!active) return null;

    const isIssue = state.isDifferentPerson || state.lastFaceCount > 1;
    const isOk = state.isConnected && !isIssue && state.lastFaceCount === 1;
    const hasError = !!state.error;

    return (
        <div className="fixed bottom-6 right-6 z-50 group">
            {/* Hidden video to ensure events fire reliably in all browsers */}
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />

            <div className={`relative transition-all duration-500 ease-in-out transform ${(state.isActive || hasError) ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
                
                {/* Futuristic HUD Scanner Circle */}
                <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-500 backdrop-blur-md ${
                    hasError ? 'border-red-500 text-red-500 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.4)]' :
                    !state.isConnected ? 'border-slate-300 text-slate-400 bg-slate-500/10 shadow-sm' :
                    isIssue ? 'border-red-500 text-red-500 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse' :
                    isOk ? 'border-green-500 text-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.4)]' :
                    'border-primary/50 text-primary bg-primary/10 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                }`}>
                    {/* Scanner scanline animation */}
                    {state.isConnected && !hasError && (
                        <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                            <div className="w-full h-0.5 bg-current opacity-40 absolute top-0 left-0 animate-[bounce_2s_infinite]" />
                        </div>
                    )}
                    {hasError ? (
                        <AlertTriangle className="h-7 w-7 text-red-500" />
                    ) : !state.isConnected ? (
                        <UserSearch className="h-7 w-7 animate-pulse text-slate-400" />
                    ) : isIssue ? (
                        <UserX className="h-7 w-7 animate-bounce text-red-500" />
                    ) : (
                        <UserCheck className={`h-7 w-7 ${isOk ? 'scale-110' : ''} transition-transform duration-500 text-green-500`} />
                    )}

                    {/* Warning Counter Badge */}
                    {warnings > 0 && !hasError && (
                        <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-md">
                            {warnings}
                        </div>
                    )}
                </div>

                {/* Glassmorphic Warning Banner */}
                {showWarningText && !hasError && (
                    <div className="absolute bottom-full mb-4 right-0 w-72 bg-red-950/90 backdrop-blur-md border border-red-500/30 text-white p-3.5 rounded-xl shadow-[0_10px_30px_rgba(239,68,68,0.2)] animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-start gap-3">
                            <div className="bg-red-500/20 p-1.5 rounded-lg text-red-400 shrink-0">
                                <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider text-red-400">Ogohlantirish {warnings} / 3</p>
                                <p className="text-[11px] leading-relaxed text-red-200 mt-1">
                                    {state.lastFaceCount > 1 ? 'Ekranda begona shaxs aniqlandi!' : 'Shaxsingizni tasdiqlashda xatolik!'}
                                    <br/>
                                    <span className="font-semibold text-white">Diqqat! 3 ta ogohlantirishdan so'ng test avtomatik to'xtatiladi.</span>
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hover Status Details */}
                <div className="absolute right-full mr-4 bottom-0 w-44 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                    <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-xl border border-gray-100">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-50">
                            {hasError ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> : <UserCheck className="h-3.5 w-3.5 text-primary" />}
                            <span className="text-[11px] font-bold text-gray-800">Tizim holati</span>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-500">Holat:</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${hasError || isIssue ? 'bg-red-100 text-red-700' : isOk ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                    {hasError ? 'Xatolik' : isOk ? 'Normal' : isIssue ? 'Qoida buzilishi' : 'Ulanmoqda'}
                                </span>
                            </div>
                            {hasError ? (
                                <div className="text-[10px] text-red-600 mt-1 leading-tight">
                                    {state.error}
                                </div>
                            ) : (
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-gray-500">Yuzlar:</span>
                                    <span className="font-bold text-gray-700">{state.lastFaceCount}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
