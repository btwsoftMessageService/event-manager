import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen bg-gray-50 text-gray-900">
            <Sidebar />
            <div className="flex flex-1 flex-col">
                <Topbar />
                <main className="flex-1 p-6 bg-white">
                    {children}
                </main>
            </div>
        </div>
    );
}

