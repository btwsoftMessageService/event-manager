// src/app/(protected)/print/badge/page.tsx
"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";

type FieldType = "name" | "company" | "title";

type BadgeDesignV2 = {
    version: 2;
    widthMm: number;
    heightMm: number;
    border: boolean;
    accent: string;
    fields: Record<
        FieldType,
        {
            x: number; // px in preview canvas
            y: number;
            w: number;
            h: number;
            fontSize: number;
            fontWeight: number;
            align: "left" | "center" | "right";
            visible: boolean;
        }
    >;
};

const STORAGE_KEY = "event-manager:badge-design:v2";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function clampHex(v: string) {
    const x = v.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(x)) return x;
    return "#111111";
}

const DEFAULTS: BadgeDesignV2 = {
    version: 2,
    widthMm: 90,
    heightMm: 55,
    border: true,
    accent: "#111111",
    fields: {
        name: {x: 24, y: 32, w: 220, h: 48, fontSize: 28, fontWeight: 800, align: "left", visible: true},
        company: {x: 24, y: 90, w: 220, h: 28, fontSize: 14, fontWeight: 600, align: "left", visible: true},
        title: {x: 24, y: 118, w: 220, h: 28, fontSize: 13, fontWeight: 500, align: "left", visible: true},
    },
};

type DragMode = "move" | "resize";
type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

export default function BadgeBuilderPage() {
    const [design, setDesign] = useState<BadgeDesignV2>(DEFAULTS);
    const [selected, setSelected] = useState<FieldType>("name");
    const [info, setInfo] = useState("");

    // 미리보기 스케일: 1mm ≈ 4px (원하면 조정)
    const scale = 4;

    const canvasW = useMemo(() => Math.round(design.widthMm * scale), [design.widthMm]);
    const canvasH = useMemo(() => Math.round(design.heightMm * scale), [design.heightMm]);

    const MM_MIN_W = 50;
    const MM_MIN_H = 30;

    // 최대 사이즈 제한 (원하는 값으로 조정)
    const MM_MAX_W = 120;
    const MM_MAX_H = 80;

    // 입력 step
    const MM_STEP = 1;

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as BadgeDesignV2;
            if (parsed?.version === 2) setDesign({
                ...DEFAULTS, ...parsed,
                fields: {...DEFAULTS.fields, ...parsed.fields}
            });
        } catch {
            // ignore
        }
    }, []);

    const save = () => {
        setInfo("");
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
            setInfo("저장되었습니다. Print 페이지에서 이 설정을 읽어 출력에 반영하면 됩니다.");
        } catch {
            setInfo("저장 실패: localStorage 접근 불가");
        }
    };

    const reset = () => {
        setDesign(DEFAULTS);
        setSelected("name");
        setInfo("기본값으로 되돌렸습니다. 저장을 누르면 반영됩니다.");
    };

    // ===== Drag/Resize 구현 (pointer events) =====
    const dragRef = useRef<{
        active: boolean;
        mode: DragMode;
        handle?: ResizeHandle;
        field: FieldType;
        startX: number;
        startY: number;
        orig: { x: number; y: number; w: number; h: number };
    } | null>(null);

    const startMove = (e: React.PointerEvent, field: FieldType) => {
        e.preventDefault();
        e.stopPropagation();
        setSelected(field);

        const f = design.fields[field];
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        dragRef.current = {
            active: true,
            mode: "move",
            field,
            startX: e.clientX,
            startY: e.clientY,
            orig: {x: f.x, y: f.y, w: f.w, h: f.h},
        };
    };

    const startResize = (e: React.PointerEvent, field: FieldType, handle: ResizeHandle) => {
        e.preventDefault();
        e.stopPropagation();
        setSelected(field);

        const f = design.fields[field];
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        dragRef.current = {
            active: true,
            mode: "resize",
            handle,
            field,
            startX: e.clientX,
            startY: e.clientY,
            orig: {x: f.x, y: f.y, w: f.w, h: f.h},
        };
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d?.active) return;

        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;

        setDesign((prev) => {
            const f = prev.fields[d.field];
            const orig = d.orig;

            let x = orig.x;
            let y = orig.y;
            let w = orig.w;
            let h = orig.h;

            if (d.mode === "move") {
                x = orig.x + dx;
                y = orig.y + dy;
            } else {
                const handle = d.handle!;
                const minW = 80;
                const minH = 24;

                const right = orig.x + orig.w;
                const bottom = orig.y + orig.h;

                const applyClamp = () => {
                    // 캔버스 내부로 (완전 고정)
                    x = clamp(x, 0, canvasW - w);
                    y = clamp(y, 0, canvasH - h);
                    w = clamp(w, minW, canvasW);
                    h = clamp(h, minH, canvasH);
                    // 다시 한번 위치 보정
                    x = clamp(x, 0, canvasW - w);
                    y = clamp(y, 0, canvasH - h);
                };

                const resizeFromLeft = () => {
                    x = orig.x + dx;
                    w = right - x;
                };
                const resizeFromTop = () => {
                    y = orig.y + dy;
                    h = bottom - y;
                };
                const resizeFromRight = () => {
                    w = orig.w + dx;
                };
                const resizeFromBottom = () => {
                    h = orig.h + dy;
                };

                switch (handle) {
                    case "nw":
                        resizeFromLeft();
                        resizeFromTop();
                        break;
                    case "ne":
                        resizeFromRight();
                        resizeFromTop();
                        break;
                    case "sw":
                        resizeFromLeft();
                        resizeFromBottom();
                        break;
                    case "se":
                        resizeFromRight();
                        resizeFromBottom();
                        break;
                    case "n":
                        resizeFromTop();
                        break;
                    case "s":
                        resizeFromBottom();
                        break;
                    case "w":
                        resizeFromLeft();
                        break;
                    case "e":
                        resizeFromRight();
                        break;
                }

                // 최소 크기 보장
                w = Math.max(w, minW);
                h = Math.max(h, minH);

                // 왼쪽/위에서 줄이는 경우: x/y가 이동했으니 w/h에 따라 재보정
                if (handle === "nw" || handle === "sw" || handle === "w") {
                    // right 기준 유지
                    const newX = right - w;
                    x = newX;
                }
                if (handle === "nw" || handle === "ne" || handle === "n") {
                    const newY = bottom - h;
                    y = newY;
                }

                applyClamp();
            }

            // move 시에도 캔버스 밖으로 못 나가게
            x = clamp(x, 0, canvasW - w);
            y = clamp(y, 0, canvasH - h);

            return {
                ...prev,
                fields: {
                    ...prev.fields,
                    [d.field]: {...f, x, y, w, h},
                },
            };
        });
    };

    const onPointerUp = () => {
        if (dragRef.current) dragRef.current.active = false;
    };

    // ===== UI 핸들 =====
    const setField = (field: FieldType, patch: Partial<BadgeDesignV2["fields"][FieldType]>) => {
        setDesign((p) => ({
            ...p,
            fields: {
                ...p.fields,
                [field]: {...p.fields[field], ...patch},
            },
        }));
    };

    const presets = [
        {label: "90×55", w: 90, h: 55},
        {label: "100×70", w: 100, h: 70},
        {label: "85×54(카드형)", w: 85, h: 54},
        {label: "95×60", w: 95, h: 60},
        {label: "88×62", w: 88, h: 62},
        {label: "Custom", w: design.widthMm, h: design.heightMm},
    ] as const;

    const sampleText: Record<FieldType, string> = {
        name: "홍길동",
        company: "BTWSoft",
        title: "매니저",
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">명찰 커스텀</h1>
                    <p className="mt-1 text-sm text-gray-700">필드(이름/회사/직함)를 드래그로 이동하고, 모서리 핸들로 크기를 조절하세요.</p>
                </div>

                <div className="flex gap-2">
                    <Link href="/print"
                          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        Print로 이동
                    </Link>
                    <button onClick={reset}
                            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        기본값
                    </button>
                    <button onClick={save}
                            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                        저장
                    </button>
                </div>
            </div>

            {info ? (
                <div
                    className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">{info}</div>
            ) : null}

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
                {/* 좌: 설정 패널 */}
                <div className="rounded-2xl border bg-white p-5">
                    <h2 className="text-lg font-semibold text-black">설정</h2>

                    {/* 사이즈 */}
                    <div className="mt-4">
                        <div className="text-sm font-medium text-gray-700">명찰 사이즈 (mm)</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {presets.map((p) => (
                                <button
                                    key={p.label}
                                    onClick={() =>
                                        setDesign((s) => ({
                                            ...s,
                                            widthMm: clamp(p.w, MM_MIN_W, MM_MAX_W),
                                            heightMm: clamp(p.h, MM_MIN_H, MM_MAX_H),
                                        }))
                                    }
                                    className={[
                                        "rounded-lg border px-3 py-2 text-sm font-medium",
                                        design.widthMm === p.w && design.heightMm === p.h
                                            ? "border-black bg-black text-white"
                                            : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                                    ].join(" ")}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="text-sm text-gray-700">
                                너비(mm)
                                <input
                                    type="number"
                                    value={design.widthMm}
                                    min={MM_MIN_W}
                                    max={MM_MAX_W}
                                    step={MM_STEP}
                                    onChange={(e) => setDesign((s) => ({
                                        ...s,
                                        widthMm: clamp(Number(e.target.value), MM_MIN_W, MM_MAX_W)
                                    }))}
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                />
                            </label>
                            <label className="text-sm text-gray-700">
                                높이(mm)
                                <input
                                    type="number"
                                    value={design.heightMm}
                                    min={MM_MIN_H}
                                    max={MM_MAX_H}
                                    step={MM_STEP}
                                    onChange={(e) => setDesign((s) => ({
                                        ...s,
                                        heightMm: clamp(Number(e.target.value), MM_MIN_H, MM_MAX_H)
                                    }))}
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                />
                            </label>
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                            미리보기 캔버스: {canvasW}px × {canvasH}px (scale={scale})
                        </div>
                    </div>

                    {/* 전역 */}
                    <div className="mt-6 grid gap-3 rounded-xl bg-gray-50 p-4">
                        <label className="flex items-center gap-2 text-sm text-gray-800">
                            <input type="checkbox" checked={design.border}
                                   onChange={(e) => setDesign((p) => ({...p, border: e.target.checked}))}/>
                            테두리 표시
                        </label>

                        <div>
                            <div className="text-sm font-medium text-gray-700">강조색</div>
                            <div className="mt-2 flex items-center gap-3">
                                <input
                                    type="color"
                                    value={design.accent}
                                    onChange={(e) => setDesign((p) => ({...p, accent: e.target.value}))}
                                    className="h-10 w-14 rounded-lg border"
                                />
                                <input
                                    value={design.accent}
                                    onChange={(e) => setDesign((p) => ({...p, accent: clampHex(e.target.value)}))}
                                    className="w-40 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                    placeholder="#111111"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 필드 선택 + 속성 */}
                    <div className="mt-6">
                        <div className="text-sm font-medium text-gray-700">필드 편집</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(["name", "company", "title"] as const).map((k) => (
                                <button
                                    key={k}
                                    onClick={() => setSelected(k)}
                                    className={[
                                        "rounded-lg border px-3 py-2 text-sm font-medium",
                                        selected === k ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                                    ].join(" ")}
                                >
                                    {k === "name" ? "이름" : k === "company" ? "회사" : "직함"}
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 grid gap-3 rounded-xl border bg-white p-4">
                            <label className="flex items-center gap-2 text-sm text-gray-800">
                                <input
                                    type="checkbox"
                                    checked={design.fields[selected].visible}
                                    onChange={(e) => setField(selected, {visible: e.target.checked})}
                                />
                                표시
                            </label>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-sm text-gray-700">
                                    폰트 크기
                                    <input
                                        type="number"
                                        value={design.fields[selected].fontSize}
                                        min={8}
                                        max={80}
                                        onChange={(e) => setField(selected, {fontSize: clamp(Number(e.target.value), 8, 80)})}
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                    />
                                </label>
                                <label className="text-sm text-gray-700">
                                    굵기
                                    <input
                                        type="number"
                                        value={design.fields[selected].fontWeight}
                                        min={300}
                                        max={900}
                                        step={100}
                                        onChange={(e) => setField(selected, {fontWeight: clamp(Number(e.target.value), 300, 900)})}
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                    />
                                </label>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {(["left", "center", "right"] as const).map((a) => (
                                    <button
                                        key={a}
                                        onClick={() => setField(selected, {align: a})}
                                        className={[
                                            "rounded-lg border px-3 py-2 text-sm font-medium",
                                            design.fields[selected].align === a ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                                        ].join(" ")}
                                    >
                                        {a === "left" ? "좌" : a === "center" ? "중앙" : "우"}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                                <div className="rounded-lg bg-gray-50 p-2">
                                    x: {Math.round(design.fields[selected].x)} /
                                    y: {Math.round(design.fields[selected].y)}
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    w: {Math.round(design.fields[selected].w)} /
                                    h: {Math.round(design.fields[selected].h)}
                                </div>
                            </div>

                            <div className="text-xs text-gray-500">
                                팁: 캔버스에서 필드를 드래그하면 이동, 모서리 핸들을 드래그하면 크기 변경.
                            </div>
                        </div>
                    </div>
                </div>

                {/* 우: 미리보기 캔버스 */}
                <div className="rounded-2xl border bg-white p-5">
                    <h2 className="text-lg font-semibold text-black">미리보기</h2>
                    <p className="mt-1 text-sm text-gray-600">아래 캔버스에서 직접 위치/크기를 조정하세요.</p>

                    <div className="mt-4 flex items-center justify-center">
                        <div
                            className={["relative bg-white", design.border ? "border" : "", "rounded-lg shadow-sm select-none"].join(" ")}
                            style={{width: canvasW, height: canvasH}}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                            onPointerLeave={onPointerUp}
                            onMouseDown={() => setSelected("name")}>
                            {/* 상단 강조 바 */}
                            <div className="absolute left-0 top-0 h-2 w-full rounded-t-lg"
                                 style={{backgroundColor: design.accent}}/>

                            {(["name", "company", "title"] as const).map((k) => {
                                const f = design.fields[k];
                                if (!f.visible) return null;

                                const isSel = selected === k;
                                const text = sampleText[k];

                                return (
                                    <div key={k}
                                         className={[
                                             "absolute",
                                             isSel ? "ring-2 ring-black/30" : "",
                                             "rounded-md",
                                         ].join(" ")}
                                         style={{
                                             left: f.x,
                                             top: f.y,
                                             width: f.w,
                                             height: f.h,
                                             cursor: "move",
                                             padding: 6,
                                             boxSizing: "border-box",
                                         }}
                                         onPointerDown={(e) => startMove(e, k)}
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             setSelected(k);
                                         }}>
                                        <div className="h-full w-full overflow-hidden"
                                             style={{
                                                 fontSize: f.fontSize,
                                                 fontWeight: f.fontWeight as any,
                                                 textAlign: f.align,
                                                 lineHeight: 1.1,
                                                 display: "flex",
                                                 alignItems: "center",
                                                 justifyContent: f.align === "left" ? "flex-start" : f.align === "center" ? "center" : "flex-end",
                                             }}>
                                            <span>{text}</span>
                                        </div>

                                        {/* 선택된 요소만 리사이즈 핸들 표시 */}
                                        {isSel ? <ResizeHandles field={k} startResize={startResize}/> : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-gray-50 p-4 text-xs text-gray-600">
                        저장 키: <span className="font-mono">{STORAGE_KEY}</span>
                        <br/>
                        Print 페이지에서 이 키를 읽어 명찰 렌더링에 반영하세요. (현재는 커스텀 저장/미리보기까지)
                    </div>
                </div>
            </section>
        </main>
    );
}

function ResizeHandles({field, startResize}: {
    field: FieldType;
    startResize: (e: React.PointerEvent, field: FieldType, handle: ResizeHandle) => void;
}) {
    const common = "absolute h-3 w-3 rounded-sm border bg-white shadow-sm";
    return (
        <>
            {/* corners */}
            <div className={`${common} -left-1 -top-1 cursor-nwse-resize`}
                 onPointerDown={(e) => startResize(e, field, "nw")}/>
            <div className={`${common} -right-1 -top-1 cursor-nesw-resize`}
                 onPointerDown={(e) => startResize(e, field, "ne")}/>
            <div className={`${common} -left-1 -bottom-1 cursor-nesw-resize`}
                 onPointerDown={(e) => startResize(e, field, "sw")}/>
            <div className={`${common} -right-1 -bottom-1 cursor-nwse-resize`}
                 onPointerDown={(e) => startResize(e, field, "se")}/>

            {/* edges */}
            <div className={`${common} left-1/2 -top-1 -translate-x-1/2 cursor-ns-resize`}
                 onPointerDown={(e) => startResize(e, field, "n")}/>
            <div className={`${common} left-1/2 -bottom-1 -translate-x-1/2 cursor-ns-resize`}
                 onPointerDown={(e) => startResize(e, field, "s")}/>
            <div className={`${common} -left-1 top-1/2 -translate-y-1/2 cursor-ew-resize`}
                 onPointerDown={(e) => startResize(e, field, "w")}/>
            <div className={`${common} -right-1 top-1/2 -translate-y-1/2 cursor-ew-resize`}
                 onPointerDown={(e) => startResize(e, field, "e")}/>
        </>
    );
}
