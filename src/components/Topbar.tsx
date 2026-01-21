"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthedClient } from "@/lib/auth";

export default function Topbar() {
    const router = useRouter();

    // 로그인 안 했으면 /login으로
    useEffect(() => {
        if (!isAuthedClient()) router.replace("/login");
    }, [router]);

    return (
        <header className="sticky top-0 z-10 border-b bg-white px-6 py-3">
            <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">Admin Console</div>
            </div>
        </header>
    );
}
