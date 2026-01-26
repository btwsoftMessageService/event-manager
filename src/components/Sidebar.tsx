// src/components/Sidebar.tsx
"use client";

import Link from "next/link";
import {usePathname, useRouter} from "next/navigation";
import {logoutClient} from "@/lib/auth";

function NavItem({
                     href,
                     label,
                     isActive,
                 }: {
    href: string;
    label: string;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            className={[
                "block rounded-lg px-4 py-3 text-base font-medium",
                isActive
                    ? "bg-black text-white"
                    : "text-gray-900 hover:bg-gray-100",
            ].join(" ")}
        >
            {label}
        </Link>
    );
}

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();

    const onLogout = () => {
        logoutClient();
        router.replace("/login");
    };

    const isEvents = pathname.startsWith("/events");

    return (
        <aside className="sticky top-0 h-screen w-64 border-r bg-white p-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm text-gray-500">행사 관리 솔루션</div>
                    <div className="text-lg font-semibold">Event Manager</div>
                </div>
            </div>

            <nav className="mt-6 space-y-2">
                <NavItem href="/events" label="Events" active={isEvents}/>
                <NavItem href="/participants" label="Participants" active={pathname.startsWith("/participants")}/>
                <NavItem href="/settings" label="Settings" active={pathname.startsWith("/settings")}/>
            </nav>

            <div className="mt-auto pt-6">
                <button className="w-full rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-zinc-100"
                        onClick={onLogout}>로그아웃
                </button>
            </div>
        </aside>
    );
}
