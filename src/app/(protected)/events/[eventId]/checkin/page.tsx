// src/app/(protected)/events/[eventId]/checkin/page.tsx
"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "next/navigation";
import type {Html5Qrcode} from "html5-qrcode";

type ScanState = "idle" | "starting" | "scanning" | "stopping" | "error";

export default function CheckinPage() {
    const {eventId} = useParams<{ eventId: string }>();

    const readerId = "qr-reader";
    const qrRef = useRef<Html5Qrcode | null>(null);

    const [state, setState] = useState<ScanState>("idle");
    const [error, setError] = useState<string>("");
    const [lastText, setLastText] = useState<string>("");
    const [history, setHistory] = useState<
        { text: string; time: string }[]
    >([]);

    const canStart = useMemo(() => state === "idle" || state === "error", [state]);
    const canStop = useMemo(() => state === "scanning", [state]);

    async function startScan() {
        if (!canStart) return;

        setError("");
        setState("starting");

        try {
            // ✅ Next.js/SSR 이슈 방지: 동적 import
            const mod = await import("html5-qrcode");
            const Html5QrcodeCtor = mod.Html5Qrcode;

            // 로컬 변수로 인스턴스 확정
            const qr: Html5Qrcode = qrRef.current ?? new Html5QrcodeCtor(readerId);

            // ref에도 저장
            qrRef.current = qr;

            // 카메라 목록에서 "environment" 우선 선택 (모바일 후면)
            const config = {
                fps: 10,
                qrbox: {width: 260, height: 260},
                aspectRatio: 1.0,
            };

            await qr.start(
                {facingMode: "environment"},
                config,
                (decodedText: string) => {
                    // QR 인식 성공
                    const now = new Date();
                    const time = now.toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                    });

                    setLastText(decodedText);
                    setHistory((prev) => [{text: decodedText, time}, ...prev].slice(0, 20));

                    // ✅ 프로토타입 체크인 처리
                    // 여기서 실제론 API 호출: POST /api/checkin { eventId, qr: decodedText }
                    console.log("CHECKIN", {eventId, decodedText});
                },
                // onScanFailure는 너무 자주 호출돼서 기본은 무시(성능)
                () => {
                }
            );

            setState("scanning");
        } catch (e: any) {
            setState("error");
            setError(
                e?.message ??
                "카메라 시작에 실패했습니다. 브라우저 권한/HTTPS/카메라 사용중 여부를 확인하세요."
            );
        }
    }

    async function stopScan() {
        const qr = qrRef.current;
        if (!qr) return;

        setState("stopping");
        setError("");

        try {
            // stop()은 보통 Promise
            await qr.stop();

            // clear()는 버전에 따라 Promise가 아닐 수 있음 → await 금지
            qr.clear();

            setState("idle");
        } catch (e: any) {
            setState("error");
            setError(e?.message ?? "카메라 종료 중 오류가 발생했습니다.");
        }
    }

    // 페이지 이탈/리렌더 시 카메라 정리
    useEffect(() => {
        return () => {
            (async () => {
                const qr = qrRef.current;
                if (!qr) return;

                try {
                    if (qrRef.current) {
                        await qr.stop();
                        qr.clear();
                    }
                } catch {
                    // ignore
                } finally {
                    qrRef.current = null;
                }
            })();
        };
    }, []);

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Check-in</h1>
                    <p className="mt-1 text-sm text-gray-700">eventId: {eventId}</p>
                    <p className="mt-1 text-sm text-gray-600">
                        카메라로 QR을 스캔하면 체크인 처리가 됩니다.(프로토타입)
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={startScan}
                        disabled={!canStart}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                            canStart
                                ? "bg-black text-white hover:bg-gray-800"
                                : "bg-gray-200 text-gray-500 cursor-not-allowed"
                        }`}
                    >
                        카메라 시작
                    </button>

                    <button
                        onClick={stopScan}
                        disabled={!canStop}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                            canStop
                                ? "border-gray-300 text-gray-900 hover:bg-gray-100"
                                : "border-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                    >
                        카메라 종료
                    </button>
                </div>
            </div>

            {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                    <div className="mt-2 text-xs text-red-600">
                        • 로컬에서는 브라우저/OS에 따라 카메라 권한 이슈가 있을 수 있습니다.<br/>
                        • 운영(HTTPS) 환경에서 가장 안정적으로 동작합니다.<br/>
                        • 다른 앱이 카메라를 사용중이면 실패할 수 있습니다.
                    </div>
                </div>
            )}

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
                {/* 카메라 영역 */}
                <div className="rounded-xl border bg-white p-4">
                    <h2 className="text-lg font-semibold text-black">스캐너</h2>
                    <p className="mt-1 text-sm text-gray-600">
                        QR이 프레임 중앙(박스)에 들어오게 맞추세요.
                    </p>

                    <div className="mt-4 overflow-hidden rounded-lg border bg-black">
                        {/* html5-qrcode가 여기에 카메라 뷰를 렌더 */}
                        <div id={readerId} className="w-full"/>
                    </div>

                    <div className="mt-4 rounded-lg bg-gray-50 p-3">
                        <div className="text-sm font-medium text-gray-900">최근 인식 결과</div>
                        <div className="mt-2 break-all text-sm text-gray-800">
                            {lastText ? lastText : "아직 인식된 QR이 없습니다."}
                        </div>
                    </div>
                </div>

                {/* 히스토리 */}
                <div className="rounded-xl border bg-white p-4">
                    <h2 className="text-lg font-semibold text-black">체크인 로그 (최대 20)</h2>

                    {history.length === 0 ? (
                        <p className="mt-3 text-sm text-gray-600">아직 기록이 없습니다.</p>
                    ) : (
                        <div className="mt-3 overflow-auto rounded-lg border">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                <tr>
                                    <th className="border-b px-3 py-2 text-left font-semibold text-gray-900">
                                        시간
                                    </th>
                                    <th className="border-b px-3 py-2 text-left font-semibold text-gray-900">
                                        QR 값
                                    </th>
                                </tr>
                                </thead>
                                <tbody>
                                {history.map((h, idx) => (
                                    <tr key={`${h.time}-${idx}`} className="odd:bg-white even:bg-gray-50">
                                        <td className="whitespace-nowrap border-b px-3 py-2 text-gray-700">
                                            {h.time}
                                        </td>
                                        <td className="border-b px-3 py-2 text-gray-900 break-all">
                                            {h.text}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            setHistory([]);
                            setLastText("");
                        }}
                        className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
                    >
                        로그 초기화
                    </button>
                </div>
            </section>
        </main>
    );
}
