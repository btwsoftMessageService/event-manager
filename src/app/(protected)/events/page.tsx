// src/app/(protected)/events/page.tsx
"use client";

import Link from "next/link";
import {useEffect, useMemo, useState} from "react";

type EventStatus = "UPCOMING" | "ONGOING" | "ENDED";

type EventItem = {
    id: string;
    name: string;
    startAt: string; // ISO
    endAt: string; // ISO
    location?: string;
};

const STORAGE_KEY = "event-manager:events:v1";

// 초기 샘플 1개(기존과 동일하게 진행중으로 보이게)
function makeDefaultEvents(): EventItem[] {
    const now = new Date();
    const start = new Date(now.getTime() - 1000 * 60 * 30); // 30분 전
    const end = new Date(now.getTime() + 1000 * 60 * 90); // 90분 후

    return [
        {
            id: "sample-event-001",
            name: "Sample Event 001",
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            location: "서울 (샘플)",
        },
    ];
}

function getStatus(ev: EventItem): EventStatus {
    const now = Date.now();
    const s = new Date(ev.startAt).getTime();
    const e = new Date(ev.endAt).getTime();

    if (now < s) return "UPCOMING";
    if (now >= s && now <= e) return "ONGOING";
    return "ENDED";
}

function statusLabel(status: EventStatus) {
    if (status === "ONGOING")
        return {text: "진행중", className: "bg-green-50 text-green-700 border-green-200"};
    if (status === "ENDED")
        return {text: "종료", className: "bg-gray-50 text-gray-700 border-gray-200"};
    return {text: "예정", className: "bg-blue-50 text-blue-700 border-blue-200"};
}

function formatKST(iso: string) {
    return new Date(iso).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function EventCard({ev}: { ev: EventItem }) {
    const status = getStatus(ev);
    const badge = statusLabel(status);

    return (
        <Link href={`/events/${ev.id}`}
              className="block rounded-xl border bg-white p-4 transition hover:bg-gray-50">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-lg font-semibold text-black">{ev.name}</div>
                    <div className="mt-1 text-sm text-gray-700">eventId: {ev.id}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${badge.className}`}>
          {badge.text}
        </span>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs font-medium text-gray-600">시작</div>
                    <div className="mt-1 font-semibold text-gray-900">{formatKST(ev.startAt)}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs font-medium text-gray-600">종료</div>
                    <div className="mt-1 font-semibold text-gray-900">{formatKST(ev.endAt)}</div>
                </div>
            </div>

            {ev.location ? (
                <div className="mt-3 text-sm text-gray-700">
                    장소: <span className="font-medium text-gray-900">{ev.location}</span>
                </div>
            ) : null}
        </Link>
    );
}

export default function EventsPage() {
    // 1️state
    const [events, setEvents] = useState<EventItem[]>([]);

    // localStorage 로드
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as EventItem[];
                if (Array.isArray(parsed) && parsed.length) {
                    setEvents(parsed);
                    return;
                }
            }
            const defaults = makeDefaultEvents();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
            setEvents(defaults);
        } catch {
            setEvents(makeDefaultEvents());
        }
    }, []);

    // 테스트용 로컬스토리지 초기화 함수
    const handleResetStorage = () => {
        if (!confirm("로컬스토리지를 초기화할까요? (테스트용)")) return;

        localStorage.removeItem(STORAGE_KEY);

        const defaults = makeDefaultEvents();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
        setEvents(defaults);
    };

    const ongoing = useMemo(() => events.filter((e) => getStatus(e) === "ONGOING"), [events]);
    const ended = useMemo(() => events.filter((e) => getStatus(e) === "ENDED"), [events]);
    const upcoming = useMemo(() => events.filter((e) => getStatus(e) === "UPCOMING"), [events]);

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Events</h1>
                    <p className="mt-1 text-sm text-gray-700">현재 등록된 행사 목록</p>
                </div>

                <div className="flex items-center gap-2">

                    {/* 테스트용 로컬스토리지 초기화 */}
                    <button onClick={handleResetStorage}
                            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                        로컬 초기화
                    </button>

                    {/* 행사 추가 페이지로 이동 */}
                    <Link href="/events/new"
                          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                        행사 추가하기
                    </Link>

                    <div className="flex gap-2 text-sm">
                        <span className="rounded-full border bg-white px-3 py-1">전체 {events.length}</span>
                        <span className="rounded-full border bg-white px-3 py-1">진행중 {ongoing.length}</span>
                        <span className="rounded-full border bg-white px-3 py-1">종료 {ended.length}</span>
                    </div>
                </div>
            </div>

            {/* 진행중 */}
            <section className="mt-6">
                <h2 className="text-lg font-semibold text-black">진행중</h2>
                {ongoing.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">진행중인 행사가 없습니다.</p>
                ) : (
                    <div className="mt-3 grid gap-4">
                        {ongoing.map((ev) => (
                            <EventCard key={ev.id} ev={ev}/>
                        ))}
                    </div>
                )}
            </section>

            {/* 예정 */}
            <section className="mt-8">
                <h2 className="text-lg font-semibold text-black">예정</h2>
                {upcoming.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">예정된 행사가 없습니다.</p>
                ) : (
                    <div className="mt-3 grid gap-4">
                        {upcoming.map((ev) => (
                            <EventCard key={ev.id} ev={ev}/>
                        ))}
                    </div>
                )}
            </section>

            {/* 종료 */}
            <section className="mt-8">
                <h2 className="text-lg font-semibold text-black">종료</h2>
                {ended.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">종료된 행사가 없습니다.</p>
                ) : (
                    <div className="mt-3 grid gap-4">
                        {ended.map((ev) => (
                            <EventCard key={ev.id} ev={ev}/>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
