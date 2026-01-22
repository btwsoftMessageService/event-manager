"use client";

import { useRouter } from "next/navigation";
import { loginClient } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();

    const onLogin = () => {
        loginClient();
        router.replace("/events");
    };

    return (
        <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
            <div className="w-full max-w-sm rounded-xl border bg-white p-6">
                <h1 className="text-xl font-semibold">Event Manager Login</h1>
                <p className="mt-2 text-sm text-gray-600">
                    프로토타입 로그인 (DB/계정 없이 상태만 저장)
                </p>

                <button
                    onClick={onLogin}
                    className="mt-6 w-full rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800"
                >
                    로그인
                </button>
            </div>
        </main>
    );
}
