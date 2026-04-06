// src/app/layout.tsx
import type {Metadata} from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Event Manager Admin",
    description: "행사 운영 및 참가자 관리 콘솔"
};

export default function RootLayout({children}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
        <body>{children}</body>
        </html>
    );
}
