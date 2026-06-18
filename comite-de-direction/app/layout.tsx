import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, FileSpreadsheet, History, Plus, Settings } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comité de Direction — AGL Studio",
  description:
    "Plateforme de génération automatisée des études de marché stratégiques AGL Côte d'Ivoire.",
};

const NAV_ITEMS = [
  { href: "/", label: "Tableau de bord", icon: BarChart3 },
  { href: "/studies/new", label: "Nouvelle étude", icon: Plus },
  { href: "/studies/history", label: "Historique", icon: History },
  { href: "/datasets", label: "Données sources", icon: FileSpreadsheet },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <aside className="w-60 shrink-0 bg-navy text-white flex flex-col">
            <div className="px-5 py-6 border-b border-white/10">
              <div className="text-gold text-xs uppercase tracking-widest font-semibold">
                Africa Global Logistics
              </div>
              <div className="mt-1 text-lg font-bold leading-tight">
                Comité de Direction
              </div>
              <div className="mt-1 text-[10px] text-white/60">
                Direction Marketing &amp; RP — Abidjan
              </div>
            </div>
            <nav className="flex-1 px-2 py-4 space-y-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="px-5 py-4 text-[10px] text-white/40 border-t border-white/10">
              v0.1.0 · Olivier Germanos
            </div>
          </aside>
          <main className="flex-1 max-w-[1280px] mx-auto px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
