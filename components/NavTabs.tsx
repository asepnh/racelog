"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/import", label: "Import" },
  { href: "/sessions", label: "Sessions" },
];

export default function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="nav-tabs">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={pathname.startsWith(t.href) ? "active" : ""}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
