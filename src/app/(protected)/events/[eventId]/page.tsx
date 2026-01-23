// src/app/(protected)/events/[eventId]/page.tsx

import Link from "next/link";
import {use} from "react";

type Props = {
    params: Promise<{ eventId: string }>;
};

// ✅ 프로토타입용 Mock (나중에 API/DB로 교체)
function getMockEvent(eventId: string) {
    const now = new Date();
    const start = new Date(now.getTime() + 1000 * 60 * 60 * 24); // +1일
    const end = new Date(now.getTime() + 1000 * 60 * 60 * 26); // +1일 +2시간

    return {
        id: eventId,
        name: `샘플 행사 (${eventId})`,
        status: "준비중", // 준비중 / 진행중 / 종료
        location: "서울 강남구 삼성동 (코엑스)",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        organizer: "BTWSoft",
        participantCount: 128,
        checkedInCount: 37,
        lastUpdatedAt: now.toISOString(),
    };
}

function formatKST(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function StatCard({
                      title,
                      value,
                      hint,
                  }: {
    title: string;
    value: string;
    hint?: string;
}) {
    return (
        <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-medium text-gray-700">{title}</div>
            <div className="mt-2 text-2xl font-semibold text-black">{value}</div>
            {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
        </div>
    );
}

function ActionLink({
                        href,
                        title,
                        desc,
                    }: {
    href: string;
    title: string;
    desc: string;
}) {
    return (
        <Link
            href={href}
            className="group rounded-xl border bg-white p-4 transition hover:bg-gray-50"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-black group-hover:underline">
                    {title}
                </div>
                <span className="text-sm text-gray-500">→</span>
            </div>
            <div className="mt-1 text-sm text-gray-700">{desc}</div>
        </Link>
    );
}

export default function EventDashboardPage({params}: Props) {
    const {eventId} = use(params);

    if (!eventId) {
        return (
            <main className="p-6">
                <h1 className="text-2xl font-semibold text-black">Event Dashboard</h1>
                <p className="mt-2 text-sm text-red-600">
                    eventId가 전달되지 않았습니다. 올바른 경로로 접속하였는지 확인하여 주세요.
                </p>
                <div className="mt-4">
                    <Link className="text-blue-600 underline" href="/events">
                        이벤트 목록으로
                    </Link>
                </div>
            </main>
        );
    }

    const event = getMockEvent(eventId);

    const attendanceRate =
        event.participantCount > 0
            ? Math.round((event.checkedInCount / event.participantCount) * 100)
            : 0;

    return (
        <main className="p-6 text-gray-900">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-black">{event.name}</h1>
                    <div className="mt-1 text-sm text-gray-700">
                        eventId: <span className="font-medium">{event.id}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
          <span className="rounded-full border px-3 py-1 text-sm font-medium text-gray-900">
            상태: {event.status}
          </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
            마지막 업데이트: {formatKST(event.lastUpdatedAt)}
          </span>
                </div>
            </div>

            {/* Event Info */}
            <section className="mt-6 rounded-xl border bg-white p-4">
                <h2 className="text-lg font-semibold text-black">행사 정보</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-xs font-medium text-gray-600">주관</div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">
                            {event.organizer}
                        </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-xs font-medium text-gray-600">장소</div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">
                            {event.location}
                        </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-xs font-medium text-gray-600">시작</div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">
                            {formatKST(event.startAt)}
                        </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-xs font-medium text-gray-600">종료</div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">
                            {formatKST(event.endAt)}
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section className="mt-6 grid gap-4 md:grid-cols-3">
                <StatCard
                    title="참여자 수"
                    value={`${event.participantCount.toLocaleString()} 명`}
                    hint="업로드된 참가자(명단) 기준"
                />
                <StatCard
                    title="체크인 수"
                    value={`${event.checkedInCount.toLocaleString()} 명`}
                    hint="QR/현장 인증 완료"
                />
                <StatCard
                    title="참석률"
                    value={`${attendanceRate}%`}
                    hint="체크인 / 참여자"
                />
            </section>

            {/* Quick Actions */}
            <section className="mt-6">
                <div className="flex items-end justify-between">
                    <h2 className="text-lg font-semibold text-black">빠른 메뉴</h2>
                    <div className="text-sm text-gray-600">행사 운영 흐름 기준으로 배치</div>
                </div>

                <div className="mt-3 grid gap-4 md:grid-cols-3">
                    {/* ✅ event.id 대신 eventId로 링크 생성 */}
                    <ActionLink
                        href={`/events/${eventId}/participants`}
                        title="Participants"
                        desc="참가자 명단 업로드/조회"
                    />
                    <ActionLink
                        href={`/events/${eventId}/checkin`}
                        title="Check-in"
                        desc="QR 체크인/현장 인증"
                    />
                    <ActionLink
                        href={`/events/${eventId}/notify`}
                        title="Notify"
                        desc="메일/알림 발송"
                    />
                </div>
            </section>
        </main>
    );
}
