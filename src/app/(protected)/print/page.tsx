"use client";

import {useEffect, useMemo, useState} from "react";
import QRCode from "qrcode";

type EventItem = {
    id: string;
    name: string;
    startAt: string; // ISO
    endAt: string; // ISO
    location?: string;
};

type Participant = {
    id?: string; // QR/체크인 연동용 식별자 (없으면 자동 생성)
    name: string;
    company?: string;
    title?: string; // 직함
    role?: string;
    email?: string;
    phone?: string;
};

const EVENTS_KEY = "event-manager:events:v1";
const PARTICIPANTS_KEY_PREFIX = "event-manager:participants:";
const CHECKINS_KEY_PREFIX = "event-manager:checkins:"; // 체크인 저장

type SizePreset = {
    key: string;
    label: string;
    widthMm: number;
    heightMm: number;
    gapMm: number;
    radiusMm: number;
    qrMm: number;
};

const PRESETS: SizePreset[] = [
    {key: "id1", label: "ID-1 (85.6×54mm)", widthMm: 85.6, heightMm: 54, gapMm: 4, radiusMm: 3, qrMm: 18},
    {key: "90x60", label: "90×60mm", widthMm: 90, heightMm: 60, gapMm: 4, radiusMm: 3, qrMm: 18},
    {key: "100x70", label: "100×70mm", widthMm: 100, heightMm: 70, gapMm: 4, radiusMm: 3, qrMm: 20},
    {key: "a6", label: "A6 (105×148mm)", widthMm: 105, heightMm: 148, gapMm: 6, radiusMm: 4, qrMm: 24},
];

function escapeHtml(s: string) {
    return (s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function downloadTextFile(text: string, filename: string, mime = "text/html;charset=utf-8") {
    const blob = new Blob([text], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function stableIdFromParticipant(p: Participant) {
    // DB 없는 상태에서 최대한 안정적인 키
    const base = `${p.email ?? ""}|${p.phone ?? ""}|${p.name ?? ""}|${p.company ?? ""}`.trim();
    // 간단 해시(브라우저 내 안정성용)
    let h = 2166136261;
    for (let i = 0; i < base.length; i++) {
        h ^= base.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `p_${(h >>> 0).toString(36)}`;
}

// 체크인/연동용 QR payload (버전 포함)
// 체크인 스캐너에서 이 문자열을 파싱해서 eventId/participantId를 얻으면 됨.
function buildQrPayload(eventId: string, participantId: string) {
    // 예: EM1|evt_123|p_abcd
    return `EM1|${eventId}|${participantId}`;
}

function loadEvents(): EventItem[] {
    try {
        const raw = localStorage.getItem(EVENTS_KEY);
        const parsed = raw ? (JSON.parse(raw) as EventItem[]) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveEvents(events: EventItem[]) {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

function participantsKey(eventId: string) {
    return `${PARTICIPANTS_KEY_PREFIX}${eventId}`;
}

function loadParticipants(eventId: string): Participant[] {
    try {
        const raw = localStorage.getItem(participantsKey(eventId));
        const parsed = raw ? (JSON.parse(raw) as Participant[]) : [];
        const list = Array.isArray(parsed) ? parsed : [];
        // id 보정
        return list.map((p) => ({
            ...p,
            id: p.id ?? stableIdFromParticipant(p),
            title: p.title ?? p.role, // 호환
        }));
    } catch {
        return [];
    }
}

function saveParticipants(eventId: string, participants: Participant[]) {
    localStorage.setItem(participantsKey(eventId), JSON.stringify(participants));
}

function upsertDummyEventIfEmpty(): EventItem {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    const dummy: EventItem = {
        id: "evt_demo",
        name: "데모 행사 (Print 미리보기)",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        location: "Demo Hall",
    };

    const evs = loadEvents();
    const exists = evs.find((e) => e.id === dummy.id);
    if (!exists) {
        saveEvents([dummy, ...evs]);
    }
    return dummy;
}

function buildDummyParticipants(): Participant[] {
    const list: Participant[] = [
        {name: "김민지", company: "네오테크", title: "매니저", email: "minji.kim@example.com"},
        {name: "박현수", company: "이벤트랩", title: "CTO", email: "hyunsoo.park@example.com"},
        {name: "이서준", company: "그로스컴퍼니", title: "팀장", email: "seojun.lee@example.com"},
        {name: "정유나", company: "클라우드나인", title: "프로덕트 오너", email: "yuna.jung@example.com"},
        {name: "최지훈", company: "핀테크웍스", title: "리드 엔지니어", email: "jihoon.choi@example.com"},
        {name: "한지아", company: "리테일플러스", title: "마케팅", email: "jia.han@example.com"},
    ];

    return list.map((p) => ({...p, id: stableIdFromParticipant(p)}));
}

export default function PrintPage() {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [eventId, setEventId] = useState<string>("");
    const [eventName, setEventName] = useState<string>("");

    const [participants, setParticipants] = useState<Participant[]>([]);
    const [presetKey, setPresetKey] = useState<string>(PRESETS[0]!.key);

    // 표시 옵션
    const [showCompany, setShowCompany] = useState(true);
    const [showTitle, setShowTitle] = useState(true);
    const [showCutLine, setShowCutLine] = useState(true);
    const [fontScale, setFontScale] = useState(1);

    // QR 옵션
    const [showQr, setShowQr] = useState(true);
    const [qrLabel, setQrLabel] = useState(true); // 하단에 ID 텍스트 표시(선택)
    const [qrMap, setQrMap] = useState<Record<string, string>>({}); // participantId -> dataURL
    const [isDownloading, setIsDownloading] = useState(false);

    const preset = useMemo(
        () => PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!,
        [presetKey]
    );

    // 초기 로드: events
    useEffect(() => {
        const evs = loadEvents();
        setEvents(evs);

        if (evs.length > 0) {
            setEventId(evs[0]!.id);
            setEventName(evs[0]!.name);
        } else {
            setEventId("");
            setEventName("");
        }
    }, []);

    // eventId 변경 시 participants 로드
    useEffect(() => {
        if (!eventId) {
            setParticipants([]);
            setQrMap({});
            setEventName("");
            return;
        }

        const ev = events.find((e) => e.id === eventId);
        setEventName(ev?.name ?? eventId);

        const list = loadParticipants(eventId);
        setParticipants(list);
        setQrMap({}); // 행사 바뀌면 QR cache reset (선택)
    }, [eventId, events]);

    // 미리보기용: 화면에 보이는 일부(최대 60명) QR 생성 캐시
    useEffect(() => {
        let cancelled = false;

        async function gen() {
            if (!eventId || !showQr) return;
            const target = participants.slice(0, 60);

            const tasks = target.map(async (p) => {
                const pid = p.id ?? stableIdFromParticipant(p);
                if (qrMap[pid]) return;
                const payload = buildQrPayload(eventId, pid);
                const dataUrl = await QRCode.toDataURL(payload, {
                    margin: 0,
                    errorCorrectionLevel: "M",
                    scale: 6,
                });
                return {pid, dataUrl};
            });

            const results = await Promise.all(tasks);
            if (cancelled) return;

            const next: Record<string, string> = {...qrMap};
            for (const r of results) {
                if (r?.pid && r.dataUrl) next[r.pid] = r.dataUrl;
            }
            setQrMap(next);
        }

        gen();
        return () => {
            cancelled = true;
        };
        // qrMap을 deps에 넣으면 생성→set→재실행 루프가 생길 수 있어,
        // 아래는 participants/eventId/showQr만으로 트리거하고 내부에서 qrMap을 읽는 구조로 둠.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [participants, eventId, showQr]);

    const onAddDummy = () => {
        const evs = loadEvents();
        let targetEventId = eventId;

        // 행사 없으면 더미 행사 생성
        if (evs.length === 0) {
            const dummyEvent = upsertDummyEventIfEmpty();
            const newEvents = loadEvents();
            setEvents(newEvents);
            targetEventId = dummyEvent.id;
            setEventId(dummyEvent.id);
            setEventName(dummyEvent.name);
        }

        if (!targetEventId) return;

        const current = loadParticipants(targetEventId);
        const dummy = buildDummyParticipants();

        // 중복 방지: id 기준
        const map = new Map<string, Participant>();
        for (const p of current) map.set(p.id ?? stableIdFromParticipant(p), p);
        for (const p of dummy) map.set(p.id!, p);

        const merged = Array.from(map.values());
        saveParticipants(targetEventId, merged);
        setParticipants(merged);
        setQrMap({});
    };

    const onClearDummy = () => {
        if (!eventId) return;
        // “더미 삭제”를 “참가자 전체 삭제”로 동작시키는 게 테스트 환경에서 명확해서 그렇게 했습니다.
        // 필요하면 "더미만 삭제"도 구현 가능(플래그 필요).
        saveParticipants(eventId, []);
        setParticipants([]);
        setQrMap({});
    };

    // 체크인(프로토타입): QR 스캔 결과를 로컬에 저장하는 형태를 상정
    // 실제 체크인 페이지에서 이 키를 동일하게 쓰면 "연동"이 됩니다.
    const onMarkAllCheckedInDemo = () => {
        if (!eventId) return;
        const key = `${CHECKINS_KEY_PREFIX}${eventId}`;
        const payload = participants.reduce<Record<string, { at: string }>>((acc, p) => {
            const pid = p.id ?? stableIdFromParticipant(p);
            acc[pid] = {at: new Date().toISOString()};
            return acc;
        }, {});
        localStorage.setItem(key, JSON.stringify(payload));
        alert("데모용: 전체 체크인 처리(localStorage 저장) 완료");
    };

    async function ensureAllQrDataUrls(list: Participant[]) {
        // 다운로드 HTML에 QR을 다 넣기 위해 전체 생성
        const next: Record<string, string> = {...qrMap};

        for (const p of list) {
            const pid = p.id ?? stableIdFromParticipant(p);
            if (!showQr) continue;
            if (next[pid]) continue;

            const payload = buildQrPayload(eventId, pid);
            // 인쇄용은 조금 더 선명하게
            const dataUrl = await QRCode.toDataURL(payload, {
                margin: 0,
                errorCorrectionLevel: "M",
                scale: 8,
            });
            next[pid] = dataUrl;
        }

        setQrMap(next);
        return next;
    }

    function buildPrintableHtml(list: Participant[], qrData: Record<string, string>) {
        const {widthMm, heightMm, gapMm, radiusMm, qrMm} = preset;

        const badgesHtml = list
            .map((p) => {
                const pid = p.id ?? stableIdFromParticipant(p);
                const name = escapeHtml(p.name ?? "");
                const company = escapeHtml(p.company ?? "");
                const title = escapeHtml((p.title ?? p.role ?? "") as string);

                const qrImg = showQr ? qrData[pid] : "";
                const qrPayload = buildQrPayload(eventId, pid);

                return `
<div class="badge">
  <div class="badge-inner">
    <div class="top">
      <div class="event">${escapeHtml(eventName)}</div>
    </div>

    <div class="mid">
      <div class="name">${name}</div>
      ${showCompany ? `<div class="company">${company}</div>` : ""}
      ${showTitle ? `<div class="title">${title}</div>` : ""}
    </div>

    ${
                    showQr
                        ? `
    <div class="qr-area">
      <div class="qr-box">
        <img class="qr-img" alt="QR" src="${qrImg}" />
      </div>
      ${qrLabel ? `<div class="qr-text">${escapeHtml(qrPayload)}</div>` : ""}
    </div>`
                        : ""
                }
  </div>
</div>
`;
            })
            .join("\n");

        return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>명찰 출력 - ${escapeHtml(eventName)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .sheet { padding: 10mm; }
    .grid { display: flex; flex-wrap: wrap; gap: ${gapMm}mm; align-content: flex-start; }

    .badge {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      border-radius: ${radiusMm}mm;
      background: #fff;
      position: relative;
      ${showCutLine ? "outline: 1px dashed rgba(0,0,0,0.35);" : "outline: none;"}
      overflow: hidden;
    }

    .badge-inner {
      height: 100%;
      padding: 5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 2mm;
      text-align: center;
    }

    .event {
      font-size: ${Math.round(10 * fontScale)}px;
      color: #666;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .name {
      font-size: ${Math.round(22 * fontScale)}px;
      font-weight: 800;
      letter-spacing: -0.4px;
      line-height: 1.1;
      word-break: keep-all;
    }

    .company {
      font-size: ${Math.round(14 * fontScale)}px;
      font-weight: 650;
      color: #111;
      opacity: 0.9;
      word-break: keep-all;
      margin-top: 1mm;
    }

    .title {
      font-size: ${Math.round(12 * fontScale)}px;
      color: #444;
      word-break: keep-all;
      margin-top: 0.8mm;
    }

    .qr-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1mm;
    }

    .qr-box {
      width: ${qrMm}mm;
      height: ${qrMm}mm;
      background: #fff;
      display: grid;
      place-items: center;
    }

    .qr-img {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }

    .qr-text {
      font-size: 9px;
      color: #666;
      word-break: break-all;
      max-width: 100%;
    }

    @media print { .sheet { padding: 0; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="grid">
      ${badgesHtml}
    </div>
  </div>
</body>
</html>`;
    }

    const onDownloadHtml = async () => {
        if (!eventId || participants.length === 0) return;

        setIsDownloading(true);
        try {
            const qrData = await ensureAllQrDataUrls(participants);
            const html = buildPrintableHtml(participants, qrData);
            const safeId = (eventId || "event").replaceAll(/[^a-zA-Z0-9_-]/g, "_");
            downloadTextFile(html, `badges-${safeId}.html`);
        } finally {
            setIsDownloading(false);
        }
    };

    const onPrintNow = () => window.print();

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Print</h1>
                    <p className="mt-1 text-sm text-gray-700">QR 포함 명찰 출력 (HTML 다운로드 → 인쇄)</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={onAddDummy}
                        className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                        더미데이터 추가
                    </button>

                    <button
                        onClick={onClearDummy}
                        disabled={!eventId}
                        className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-40"
                    >
                        더미데이터 삭제
                    </button>

                    <button
                        onClick={onMarkAllCheckedInDemo}
                        disabled={!eventId || participants.length === 0}
                        className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-40"
                        title="체크인 페이지가 아직 없을 때 테스트용"
                    >
                        (데모) 전체 체크인
                    </button>

                    <button
                        onClick={onDownloadHtml}
                        disabled={!eventId || participants.length === 0 || isDownloading}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                    >
                        {isDownloading ? "생성 중..." : "HTML 다운로드"}
                    </button>

                    <button
                        onClick={onPrintNow}
                        className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                        지금 인쇄
                    </button>
                </div>
            </div>

            {/* 설정 */}
            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium text-gray-700">행사 선택</label>
                        <select
                            value={eventId}
                            onChange={(e) => setEventId(e.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        >
                            {events.length === 0 ? (
                                <option value="">등록된 행사가 없습니다 (더미데이터 추가로 생성 가능)</option>
                            ) : (
                                events.map((ev) => (
                                    <option key={ev.id} value={ev.id}>
                                        {ev.name} ({ev.id})
                                    </option>
                                ))
                            )}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                            참가자는 이벤트별 localStorage 키({PARTICIPANTS_KEY_PREFIX}{"{eventId}"})에서 로드됩니다.
                        </p>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">명찰 템플릿</label>
                        <select value={presetKey}
                                onChange={(e) => setPresetKey(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10">
                            {PRESETS.map((p) => (
                                <option key={p.key} value={p.key}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">다운로드한 HTML을 열고 인쇄에서 A4/배율 100% 권장</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showCompany}
                                   onChange={(e) => setShowCompany(e.target.checked)}/>
                            회사 표시
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showTitle}
                                   onChange={(e) => setShowTitle(e.target.checked)}/>
                            직함 표시
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)}/>
                            QR 표시
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={qrLabel}
                                onChange={(e) => setQrLabel(e.target.checked)}
                                disabled={!showQr}
                            />
                            QR 텍스트 표시
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showCutLine}
                                   onChange={(e) => setShowCutLine(e.target.checked)}/>
                            컷라인(점선) 표시
                        </label>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">
                            글자 크기 배율 <span className="ml-2 text-xs text-gray-500">(0.8 ~ 1.3)</span>
                        </label>
                        <input
                            type="range"
                            min={0.8}
                            max={1.3}
                            step={0.05}
                            value={fontScale}
                            onChange={(e) => setFontScale(Number(e.target.value))}
                            className="mt-2 w-full"
                        />
                        <div className="mt-1 text-xs text-gray-500">현재: {fontScale.toFixed(2)}</div>
                    </div>
                </div>
            </section>

            {/* 요약 */}
            <section className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">선택 행사</div>
                    <div className="mt-2 text-base font-semibold text-black">{eventName || "-"}</div>
                    <div className="mt-1 text-xs text-gray-500">eventId: {eventId || "-"}</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">참가자 수</div>
                    <div className="mt-2 text-2xl font-semibold text-black">{participants.length.toLocaleString()} 명
                    </div>
                    <div className="mt-1 text-xs text-gray-500">프리뷰 QR은 최대 60명까지 미리 생성</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">QR 연동 포맷</div>
                    <div className="mt-2 text-sm text-gray-800">EM1|eventId|participantId</div>
                    <div className="mt-1 text-xs text-gray-500">
                        체크인 스캐너에서 이 문자열을 파싱해 체크인 저장 키({CHECKINS_KEY_PREFIX}
                        {"{eventId}"})로 기록하면 연동됩니다.
                    </div>
                </div>
            </section>

            {/* 프리뷰 */}
            <section className="mt-6 rounded-2xl border bg-white">
                <div className="border-b p-4">
                    <h2 className="text-lg font-semibold text-black">명찰 미리보기</h2>
                    <p className="mt-1 text-sm text-gray-600">
                        실제 인쇄는 “HTML 다운로드”로 받은 파일에서 인쇄하는 방식을 권장합니다.
                    </p>
                </div>

                {participants.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">
                        참가자가 없습니다. 상단의 <b>더미데이터 추가</b> 버튼으로 미리보기 데이터를 넣을 수 있어요.
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="flex flex-wrap" style={{gap: `${preset.gapMm}mm` as any}}>
                            {participants.slice(0, 60).map((p, idx) => {
                                const pid = p.id ?? stableIdFromParticipant(p);
                                const payload = buildQrPayload(eventId, pid);
                                const titleText = p.title ?? p.role ?? "";

                                return (
                                    <div
                                        key={`${pid}-${idx}`}
                                        className={[
                                            "bg-white relative overflow-hidden",
                                            showCutLine ? "outline outline-1 outline-dashed outline-black/30" : "",
                                        ].join(" ")}
                                        style={{
                                            width: `${preset.widthMm}mm`,
                                            height: `${preset.heightMm}mm`,
                                            borderRadius: `${preset.radiusMm}mm`,
                                        }}
                                    >
                                        <div
                                            className="h-full flex flex-col justify-between text-center"
                                            style={{padding: "5mm", gap: "2mm"}}
                                        >
                                            <div className="text-gray-500 truncate"
                                                 style={{fontSize: `${Math.round(10 * fontScale)}px`}}>
                                                {eventName}
                                            </div>

                                            <div>
                                                <div className="font-extrabold leading-tight"
                                                     style={{fontSize: `${Math.round(22 * fontScale)}px`}}>
                                                    {p.name}
                                                </div>

                                                {showCompany ? (
                                                    <div className="font-semibold text-gray-900/90 mt-[1mm]"
                                                         style={{fontSize: `${Math.round(14 * fontScale)}px`}}>
                                                        {p.company ?? ""}
                                                    </div>
                                                ) : null}

                                                {showTitle ? (
                                                    <div className="text-gray-700 mt-[0.8mm]"
                                                         style={{fontSize: `${Math.round(12 * fontScale)}px`}}>
                                                        {titleText}
                                                    </div>
                                                ) : null}
                                            </div>

                                            {showQr ? (
                                                <div className="flex flex-col items-center" style={{gap: "1mm"}}>
                                                    <div
                                                        style={{
                                                            width: `${preset.qrMm}mm`,
                                                            height: `${preset.qrMm}mm`,
                                                            background: "#fff",
                                                            display: "grid",
                                                            placeItems: "center",
                                                        }}
                                                    >
                                                        {qrMap[pid] ? (
                                                            <img
                                                                src={qrMap[pid]}
                                                                alt="QR"
                                                                style={{
                                                                    width: "100%",
                                                                    height: "100%",
                                                                    imageRendering: "pixelated" as any
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="text-xs text-gray-400">QR...</div>
                                                        )}
                                                    </div>
                                                    {qrLabel ? (
                                                        <div
                                                            className="text-[9px] text-gray-500 break-all">{payload}</div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {participants.length > 60 ? (
                            <div className="mt-4 text-xs text-gray-500">
                                미리보기는 성능을 위해 60개까지만 표시합니다. 다운로드 HTML에는 전체가 포함됩니다.
                            </div>
                        ) : null}
                    </div>
                )}
            </section>
        </main>
    );
}
