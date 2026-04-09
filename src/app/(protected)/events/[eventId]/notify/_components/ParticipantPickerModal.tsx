// src/app/(protected)/events/[eventId]/notify/_components/ParticipantPickerModal.tsx
"use client";

import {useEffect, useMemo, useState} from "react";

export type Row = Record<string, string>;

type DbParticipant = {
    id: string;
    name: string;
    email?: string;
    company?: string;
    phone?: string;
};

type RawParticipant = {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    company?: unknown;
    phone?: unknown;
};

const GLOBAL_PARTICIPANTS_STORAGE_KEY = "event-manager:global-participants:v1";

function normalizeEmailKey(v: string) {
    return v.trim().toLowerCase();
}

function normalizePhoneKey(v: string) {
    return v.replace(/[^\d]/g, "").trim();
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallback;
}

function toDbParticipant(value: RawParticipant): DbParticipant {
    return {
        id: String(value.id ?? ""),
        name: String(value.name ?? ""),
        email: value.email ? String(value.email) : undefined,
        company: value.company ? String(value.company) : undefined,
        phone: value.phone ? String(value.phone) : undefined,
    };
}

async function loadDbParticipants(): Promise<DbParticipant[]> {
    try {
        const raw = localStorage.getItem(GLOBAL_PARTICIPANTS_STORAGE_KEY);
        if (!raw) return [];

        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item) => toDbParticipant((item ?? {}) as RawParticipant))
            .filter((participant) => participant.name.trim().length > 0);
    } catch {
        return [];
    }
}

/** 중복 제거 키: email 우선, 없으면 name+phone */
function makeKey(r: Row) {
    const email = (r["email"] ?? "").trim();
    if (email) return `email:${normalizeEmailKey(email)}`;

    const name = (r["name"] ?? "").trim().toLowerCase();
    const phone = normalizePhoneKey(r["phone"] ?? "");
    return `name:${name}|phone:${phone}`;
}

type ParticipantPickerModalProps = {
    open: boolean;
    onClose: () => void;
    existingRows: Row[];
    onAddRows: (rowsToAdd: Row[]) => void;
};

export default function ParticipantPickerModal({
                                                   open,
                                                   onClose,
                                                   existingRows,
                                                   onAddRows,
                                               }: ParticipantPickerModalProps) {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string>("");

    const [dbParticipants, setDbParticipants] = useState<DbParticipant[]>([]);
    const [q, setQ] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!open) return;

        void (async () => {
            setLoading(true);
            setErr("");

            try {
                const list = await loadDbParticipants();
                setDbParticipants(list);
                setSelectedIds(new Set());
                setQ("");
            } catch (error: unknown) {
                setErr(getErrorMessage(error, "참여자 목록을 불러오지 못했습니다."));
            } finally {
                setLoading(false);
            }
        })();
    }, [open]);

    const filtered = useMemo(() => {
        const keyword = q.trim().toLowerCase();
        if (!keyword) return dbParticipants;

        return dbParticipants.filter((participant) => {
            const haystack =
                `${participant.name} ${participant.email ?? ""} ${participant.company ?? ""} ${participant.phone ?? ""}`.toLowerCase();

            return haystack.includes(keyword);
        });
    }, [dbParticipants, q]);

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAllFiltered = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const participant of filtered) {
                next.add(participant.id);
            }
            return next;
        });
    };

    const clearSelected = () => {
        setSelectedIds(new Set());
    };

    const addSelected = () => {
        const picked = dbParticipants.filter((participant) => selectedIds.has(participant.id));
        if (picked.length === 0) return;

        const mapped: Row[] = picked.map((participant) => ({
            name: participant.name ?? "",
            email: participant.email ?? "",
            company: participant.company ?? "",
            phone: participant.phone ?? "",
        }));

        const existingKeys = new Set(existingRows.map(makeKey));
        const merged = [...existingRows, ...mapped];

        const seen = new Set<string>();
        const dedup: Row[] = [];

        for (const row of merged) {
            const key = makeKey(row);
            if (seen.has(key)) continue;
            seen.add(key);
            dedup.push(row);
        }

        const toAdd = dedup.filter((row) => !existingKeys.has(makeKey(row)));

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
                                placeholder="이름 / 이메일 / 회사 / 전화"/>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button onClick={selectAllFiltered}
                                    disabled={loading || filtered.length === 0}
                                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                                검색결과 전체선택
                            </button>
                            <button onClick={clearSelected}
                                    disabled={selectedIds.size === 0}
                                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                                선택해제
                            </button>
                            <button onClick={addSelected}
                                    disabled={selectedIds.size === 0}
                                    className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
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
                                filtered.map((participant) => {
                                    const checked = selectedIds.has(participant.id);

                                    return (
                                        <tr className="odd:bg-white even:bg-gray-50/50"
                                            key={participant.id}>
                                            <td className="border-b px-3 py-2">
                                                <input type="checkbox"
                                                       checked={checked}
                                                       onChange={() => toggleSelect(participant.id)}/>
                                            </td>
                                            <td className="border-b px-3 py-2 font-medium text-gray-900">
                                                {participant.name}
                                            </td>
                                            <td className="border-b px-3 py-2 text-gray-900">
                                                {participant.email ?? ""}
                                            </td>
                                            <td className="border-b px-3 py-2 text-gray-900">
                                                {participant.company ?? ""}
                                            </td>
                                            <td className="border-b px-3 py-2 text-gray-900">
                                                {participant.phone ?? ""}
                                            </td>
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