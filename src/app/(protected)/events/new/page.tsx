// src/app/(protected)/events/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type EventItem = {
    id: string;
    name: string;
    startAt: string; // ISO
    endAt: string; // ISO
    location?: string;
};

const STORAGE_KEY = "event-manager:events:v1";

function makeId() {
    return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// datetime-local 값(로컬) -> ISO(UTC) 변환
function toIso(dtLocal: string) {
    // dtLocal: "2026-01-28T10:30"
    const d = new Date(dtLocal);
    return d.toISOString();
}

export default function EventCreatePage() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [location, setLocation] = useState("");
    const [startLocal, setStartLocal] = useState("");
    const [endLocal, setEndLocal] = useState("");
    const [error, setError] = useState<string | null>(null);

    const canSubmit = useMemo(() => {
        if (!name.trim()) return false;
        if (!startLocal || !endLocal) return false;

        const s = new Date(startLocal).getTime();
        const e = new Date(endLocal).getTime();
        return Number.isFinite(s) && Number.isFinite(e) && e > s;
    }, [name, startLocal, endLocal]);

    const onSubmit = () => {
        setError(null);

        if (!canSubmit) {
            setError("필수값(행사명/시작/종료) 확인 및 종료 시간이 시작 시간보다 늦어야 합니다.");
            return;
        }

        const newItem: EventItem = {
            id: makeId(),
            name: name.trim(),
            startAt: toIso(startLocal),
            endAt: toIso(endLocal),
            location: location.trim() || undefined,
        };

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const prev = raw ? (JSON.parse(raw) as EventItem[]) : [];
            const next = Array.isArray(prev) ? [newItem, ...prev] : [newItem];

            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            router.push("/events"); // ✅ 저장 후 목록으로
        } catch {
            setError("저장에 실패했습니다. (localStorage 접근 불가)");
        }
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">행사 추가</h1>
                    <p className="mt-1 text-sm text-gray-700">새 행사 정보를 입력하세요.</p>
                </div>

                <button
                    onClick={() => router.push("/events")}
                    className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                    목록으로
                </button>
            </div>

            {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            <section className="mt-6 max-w-2xl rounded-2xl border bg-white p-6">
                <div className="grid gap-4">
                    <div>
                        <label className="text-sm font-medium text-gray-700">행사명 *</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="예: 2026 신년 컨퍼런스"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">장소</label>
                        <input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="예: 서울 코엑스"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium text-gray-700">시작 *</label>
                            <input
                                type="datetime-local"
                                value={startLocal}
                                onChange={(e) => setStartLocal(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">종료 *</label>
                            <input
                                type="datetime-local"
                                value={endLocal}
                                onChange={(e) => setEndLocal(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                        </div>
                    </div>

                    <button
                        onClick={onSubmit}
                        disabled={!canSubmit}
                        className={`mt-2 w-full rounded-lg px-4 py-2 text-sm font-medium ${
                            canSubmit ? "bg-black text-white hover:bg-gray-800" : "bg-gray-200 text-gray-500"
                        }`}
                    >
                        저장
                    </button>

                    <p className="text-xs text-gray-500">
                        프로토타입: 저장된 행사는 브라우저 localStorage에만 저장됩니다.
                    </p>
                </div>
            </section>
        </main>
    );
}
