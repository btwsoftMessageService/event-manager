// src/app/(protected)/events/page.tsx
import Link from "next/link";

type EventStatus = "UPCOMING" | "ONGOING" | "ENDED";

type EventItem = {
    id: string;
    name: string;
    startAt: string; // ISO
    endAt: string; // ISO
    location?: string;
};

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
        return {
            text: "진행중",
            className: "bg-green-50 text-green-700 border-green-200",
        };
    if (status === "ENDED")
        return {
            text: "종료",
            className: "bg-gray-50 text-gray-700 border-gray-200",
        };
    return {
        text: "예정",
        className: "bg-blue-50 text-blue-700 border-blue-200",
    };
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

// ✅ 프로토타입: 현재는 sample-event-001만 존재
function getMockEvents(): EventItem[] {
    const now = new Date();

    // 샘플 1개를 "진행중"으로 보이게 하고 싶으면 start/end를 now 기준으로 잡아주면 됨
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

function EventCard({ev}: { ev: EventItem }) {
    const status = getStatus(ev);
    const badge = statusLabel(status);
    const locationBlock = ev.location ? (
        <div className="mt-3 text-sm text-gray-700">
            장소:{" "}
            <span className="font-medium text-gray-900">{ev.location}</span>
        </div>
    ) : null;

    return (
        <Link href={`/events/${ev.id}`}
              className="block rounded-xl border bg-white p-4 transition hover:bg-gray-50"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-lg font-semibold text-black">{ev.name}</div>
                    <div className="mt-1 text-sm text-gray-700">eventId: {ev.id}</div>
                </div>
                <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${badge.className}`}
                >
          {badge.text}
        </span>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs font-medium text-gray-600">시작</div>
                    <div className="mt-1 font-semibold text-gray-900">
                        {formatKST(ev.startAt)}
                    </div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs font-medium text-gray-600">종료</div>
                    <div className="mt-1 font-semibold text-gray-900">
                        {formatKST(ev.endAt)}
                    </div>
                </div>
            </div>

            {locationBlock}
        </Link>
    );
}

export default function EventsPage() {
    const events = getMockEvents();

    const ongoing = events.filter((e) => getStatus(e) === "ONGOING");
    const ended = events.filter((e) => getStatus(e) === "ENDED");
    const upcoming = events.filter((e) => getStatus(e) === "UPCOMING");

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Events</h1>
                    <p className="mt-1 text-sm text-gray-700">현재 등록된 행사 목록</p>
                </div>

                <div className="flex gap-2 text-sm">
          <span className="rounded-full border bg-white px-3 py-1">
            전체 {events.length}
          </span>
                    <span className="rounded-full border bg-white px-3 py-1">
            진행중 {ongoing.length}
          </span>
                    <span className="rounded-full border bg-white px-3 py-1">
            종료 {ended.length}
          </span>
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
