// src/app/(protected)/events/[eventId]/notify/_components/ParticipantPickerModal.tsx
"use client";

import {useEffect, useMemo, useState} from "react";

/** page.tsx와 동일한 Row 타입 */
export type Row = Record<string, string>;

type DbParticipant = {
    id: string;
    name: string;
    email?: string;
    company?: string;
    phone?: string;
};

const GLOBAL_PARTICIPANTS_STORAGE_KEY = "event-manager:global-participants:v1";

function normalizeEmailKey(v: string) {
    return v.trim().toLowerCase();
}

function normalizePhoneKey(v: string) {
    return v.replace(/[^\d]/g, "").trim();
}

/**
 * (프로토타입) DB 참여자 로드
 * - TODO: 실제 DB 붙이면 여기만 API로 교체
 */
async function loadDbParticipants(): Promise<DbParticipant[]> {
    // 실제 DB 붙이면 여기서 API 호출로 교체하세요.
    // 예:
    // const res = await fetch(`/api/participants?scope=global`, { cache: "no-store" });
    // if (res.ok) return await res.json();

    try {
        const raw = localStorage.getItem(GLOBAL_PARTICIPANTS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((p: any) => ({
                id: String(p?.id ?? ""),
                name: String(p?.name ?? ""),
                email: p?.email ? String(p.email) : undefined,
                company: p?.company ? String(p.company) : undefined,
                phone: p?.phone ? String(p.phone) : undefined,
            }))
            .filter((p: DbParticipant) => p.name.trim().length > 0);
    } catch {
        return [];
    }
}

export default function ParticipantPickerModal({
                                                   open,
                                                   onClose,
                                                   existingRows,
                                                   onAddRows,
                                               }: {
    open: boolean;
    onClose: () => void;
    existingRows: Row[];
    onAddRows: (rowsToAdd: Row[]) => void;
}) {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const [dbParticipants, setDbParticipants] = useState<DbParticipant[]>([]);
    const [q, setQ] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!open) return;

        (async () => {
            setLoading(true);
            setErr("");
            try {
                const list = await loadDbParticipants();
                setDbParticipants(list);
                setSelectedIds(new Set());
                setQ("");
            } catch (e: any) {
                setErr(e?.message ?? "참여자 목록을 불러오지 못했습니다.");
            } finally {
                setLoading(false);
            }
        })();
    }, [open]);

    const filtered = useMemo(() => {
        const k = q.trim().toLowerCase();
        if (!k) return dbParticipants;
        return dbParticipants.filter((p) => {
            const hay = `${p.name} ${p.email ?? ""} ${p.company ?? ""} ${p.phone ?? ""}`.toLowerCase();
            return hay.includes(k);
        });
    }, [dbParticipants, q]);

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllFiltered = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const p of filtered) next.add(p.id);
            return next;
        });
    };

    const clearSelected = () => setSelectedIds(new Set());

    const addSelected = () => {
        const picked = dbParticipants.filter((p) => selectedIds.has(p.id));
        if (picked.length === 0) return;

        const mapped: Row[] = picked.map((p) => ({
            name: p.name ?? "",
            email: p.email ?? "",
            company: p.company ?? "",
            phone: p.phone ?? "",
        }));

        // 한번 더 중복 제거하고 page로 넘김
        const merged = [...existingRows, ...mapped];
        const seen = new Set<string>();
        const dedup: Row[] = [];

        const keyOf = (r: Row) => {
            const email = (r["email"] ?? "").trim();
            if (email) return `email:${normalizeEmailKey(email)}`;
            const name = (r["name"] ?? "").trim().toLowerCase();
            const phone = normalizePhoneKey(r["phone"] ?? "");
            return `name:${name}|phone:${phone}`;
        };

        for (const r of merged) {
            const key = keyOf(r);
            if (seen.has(key)) continue;
            seen.add(key);
            dedup.push(r);
        }

        // existingRows 포함 dedup 결과 중에서 “기존에 없던 것”만 onAddRows로 넘기고 싶다면:
        // 지금은 단순하게 mapped만 넘겨도 되지만, page 쪽에서 또 dedup하면 중복 없이 유지됨.
        // 여기서는 안전하게 "새로 추가된 row들"만 추려서 전달:
        const existingKeys = new Set(existingRows.map(keyOf));
        const toAdd = dedup.filter((r) => !existingKeys.has(keyOf(r)));

        onAddRows(toAdd);
        onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b p-4">
                    <div>
                        <div className="text-lg font-semibold text-black">DB 참여자에서 추가</div>
                        <div className="mt-1 text-xs text-gray-500">
                            프로토타입: global participants(localStorage) 기반 / 추후 DB API로 교체
                        </div>
                    </div>

                    <button onClick={onClose} className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50">
                        닫기
                    </button>
                </div>

                <div className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="w-full md:max-w-md">
                            <label className="text-sm font-medium text-gray-700">검색</label>
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                placeholder="이름 / 이메일 / 회사 / 전화"
                            />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={selectAllFiltered}
                                disabled={loading || filtered.length === 0}
                                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                                검색결과 전체선택
                            </button>
                            <button
                                onClick={clearSelected}
                                disabled={selectedIds.size === 0}
                                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                                선택해제
                            </button>
                            <button
                                onClick={addSelected}
                                disabled={selectedIds.size === 0}
                                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                            >
                                선택 추가 ({selectedIds.size})
                            </button>
                        </div>
                    </div>

                    {err ? (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {err}
                        </div>
                    ) : null}

                    <div className="mt-4 overflow-auto rounded-xl border">
                        <table className="min-w-[900px] w-full text-sm">
                            <thead className="bg-gray-50 text-gray-700">
                            <tr>
                                <th className="border-b px-3 py-2 text-left font-semibold">선택</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">이름</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">이메일</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">회사</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">전화</th>
                            </tr>
                            </thead>

                            <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-3 py-10 text-center text-gray-600">
                                        불러오는 중...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-3 py-10 text-center text-gray-600">
                                        표시할 참여자가 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((p) => {
                                    const checked = selectedIds.has(p.id);
                                    return (
                                        <tr key={p.id} className="odd:bg-white even:bg-gray-50/50">
                                            <td className="border-b px-3 py-2">
                                                <input type="checkbox" checked={checked}
                                                       onChange={() => toggleSelect(p.id)}/>
                                            </td>
                                            <td className="border-b px-3 py-2 font-medium text-gray-900">{p.name}</td>
                                            <td className="border-b px-3 py-2 text-gray-900">{p.email ?? ""}</td>
                                            <td className="border-b px-3 py-2 text-gray-900">{p.company ?? ""}</td>
                                            <td className="border-b px-3 py-2 text-gray-900">{p.phone ?? ""}</td>
                                        </tr>
                                    );
                                })
                            )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                        * 중복 제거 기준: email 우선, 없으면 name+phone
                    </div>
                </div>
            </div>
        </div>
    );
}
