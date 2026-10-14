/**
 * Telefon yoki planshet — ekran kengligidan qat'i nazar (`useIsMobile` dan
 * farqi shu: kompyuterdagi tor oyna bu yerda «mobil» emas).
 *
 * Zoom Meeting SDK'ning Component View rejimi mobil brauzerlarni
 * qo'llamaydi: u yerda darsga Zoom ilovasi orqali kiriladi.
 * iPadOS 13+ o'zini Mac deb tanishtiradi — uni sensorli ekran ochib beradi.
 */
export function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
    if (uaData?.mobile) return true;
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}
