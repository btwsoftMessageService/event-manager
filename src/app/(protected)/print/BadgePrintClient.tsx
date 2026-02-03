"use client";

import { useEffect, useMemo, useState } from "react";

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
            x: number;
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

export default function BadgePrintClient() {
    const [design, setDesign] = useState<BadgeDesignV2 | null>(null);
    const [badgeTemplate, setBadgeTemplate] = useState<"default" | "custom">("default");

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as BadgeDesignV2;
            if (parsed?.version === 2) {
                setDesign(parsed);
                // 저장된 커스텀이 있으면 선택지에 보이도록 기본값을 custom으로 해도 되고(취향)
                // setBadgeTemplate("custom");
            }
        } catch {
            // ignore
        }
    }, []);

    const canUseCustom = !!design;

    return (
        <div className="space-y-4">
            {/* ✅ 기존 "명찰 선택/사이즈 선택" UI 근처에 끼워넣기 */}
            <div className="rounded-xl border bg-white p-4">
                <div className="text-sm font-medium text-gray-700">명찰 선택</div>

                <div className="mt-2 flex flex-wrap gap-2">
                    <button
                        className={[
                            "rounded-lg border px-3 py-2 text-sm font-medium",
                            badgeTemplate === "default"
                                ? "border-black bg-black text-white"
                                : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                        ].join(" ")}
                        onClick={() => setBadgeTemplate("default")}
                    >
                        기본 명찰
                    </button>

                    <button
                        className={[
                            "rounded-lg border px-3 py-2 text-sm font-medium",
                            badgeTemplate === "custom"
                                ? "border-black bg-black text-white"
                                : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                            !canUseCustom ? "opacity-50 cursor-not-allowed" : "",
                        ].join(" ")}
                        disabled={!canUseCustom}
                        onClick={() => setBadgeTemplate("custom")}
                        title={!canUseCustom ? "명찰 커스텀 페이지에서 저장한 후 사용 가능합니다." : ""}
                    >
                        커스텀 명찰
                    </button>
                </div>

                {!canUseCustom ? (
                    <div className="mt-2 text-xs text-gray-500">
                        커스텀 명찰이 없습니다. <span className="font-mono">{STORAGE_KEY}</span> 저장이 필요합니다.
                    </div>
                ) : (
                    <div className="mt-2 text-xs text-gray-500">
                        커스텀 로드됨: {design!.widthMm}×{design!.heightMm}mm
                    </div>
                )}
            </div>

            {/* ✅ 실제 출력 렌더링 분기 */}
            <div className="rounded-xl border bg-white p-4">
                {badgeTemplate === "default" ? (
                    <div className="text-sm text-gray-700">여기에 기존 기본 명찰 출력 렌더링</div>
                ) : (
                    <CustomBadgePreviewForPrint design={design!} />
                )}
            </div>

            {/* ✅ 인쇄 버튼은 기존 Print 페이지 버튼 그대로 사용 */}
            {/* window.print() 를 기존 로직에 유지 */}
        </div>
    );
}

function CustomBadgePreviewForPrint({ design }: { design: BadgeDesignV2 }) {
    // 화면 프리뷰(px) 기준으로 저장했으니 Print에서도 동일한 스케일로 맞추는게 가장 간단
    const scale = 4;
    const w = Math.round(design.widthMm * scale);
    const h = Math.round(design.heightMm * scale);

    const sample = {
        name: "홍길동",
        company: "BTWSoft",
        title: "매니저",
    } as const;

    return (
        <div className="flex items-center justify-center">
            <div
                className={["relative bg-white rounded-lg", design.border ? "border" : ""].join(" ")}
                style={{ width: w, height: h }}
            >
                <div className="absolute left-0 top-0 h-2 w-full rounded-t-lg" style={{ backgroundColor: design.accent }} />

                {(Object.keys(design.fields) as Array<keyof typeof design.fields>).map((k) => {
                    const f = design.fields[k];
                    if (!f.visible) return null;

                    return (
                        <div
                            key={k}
                            className="absolute"
                            style={{
                                left: f.x,
                                top: f.y,
                                width: f.w,
                                height: f.h,
                                padding: 6,
                                boxSizing: "border-box",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: f.fontSize,
                                    fontWeight: f.fontWeight as any,
                                    textAlign: f.align,
                                    lineHeight: 1.1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: f.align === "left" ? "flex-start" : f.align === "center" ? "center" : "flex-end",
                                    height: "100%",
                                    width: "100%",
                                    overflow: "hidden",
                                }}
                            >
                                {sample[k]}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
