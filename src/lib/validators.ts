// src/lib/validators.ts

/** 숫자만 남기기 */
export function onlyDigits(value: string) {
    return (value ?? "").replace(/\D/g, "");
}

/**
 * 전화번호 자동 하이픈 (000-0000-0000)
 * - 숫자만 허용
 * - 최대 11자리까지
 * - 입력 중에도 자연스럽게 하이픈이 붙도록 "점진 포맷"
 */
export function formatPhoneKR(value: string) {
    const digits = onlyDigits(value).slice(0, 11);

    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** 비교용: 전화번호에서 숫자만 추출 (데이터 저장은 그대로 두고, 비교에만 사용) */
export function normalizePhoneDigits(value: string) {
    return onlyDigits(value ?? "");
}

/** 이메일 정규화(중복 체크에도 사용) */
export function normalizeEmail(email: string) {
    return (email ?? "").trim().toLowerCase();
}

/** 이메일 형식 검사(가벼운 프론트 검증용) */
export function isValidEmail(email: string) {
    const v = normalizeEmail(email);
    if (!v) return false;
    // 실무에서 흔히 쓰는 "기본" 검사 (너무 빡세게 안 잡음)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
