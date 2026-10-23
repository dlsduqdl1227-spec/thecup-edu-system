"use client";

import { useEffect, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog";

type NavigationItem = { key: string; label: string; title?: string };

/** Five readable destinations at most; every secondary destination remains in the menu. */
export function MobileNavigation({ items, activeKey, onSelect, primaryKeys, label, className }: {
  items: NavigationItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  primaryKeys?: string[];
  label: string;
  className: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > 5;
  const primary = hasMore
    ? [...items.filter(item => primaryKeys?.includes(item.key)), ...items.filter(item => !primaryKeys?.includes(item.key))].slice(0, 4)
    : items;
  const secondaryActive = !primary.some(item => item.key === activeKey);

  // Rotation to desktop must not leave a hidden modal blocking the page.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1025px)");
    const dismiss = () => { if (desktop.matches) setExpanded(false); };
    desktop.addEventListener("change", dismiss);
    return () => desktop.removeEventListener("change", dismiss);
  }, []);

  function select(key: string) {
    setExpanded(false);
    onSelect(key);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return <>
    <nav className={`${className} mobile-dock`} aria-label={label}>
      {primary.map(item => <button type="button" key={item.key}
        className={activeKey === item.key ? "active" : ""}
        aria-current={activeKey === item.key ? "page" : undefined}
        onClick={() => select(item.key)}>
        <NavigationIcon name={item.key} /><span>{item.label}</span>
      </button>)}
      {hasMore && <button type="button" className={secondaryActive ? "active" : ""}
        aria-haspopup="dialog" aria-expanded={expanded} onClick={event => { event.currentTarget.focus(); setExpanded(true); }}>
        <NavigationIcon name="more" /><span>전체 메뉴</span>
      </button>}
    </nav>
    {expanded && <AccessibleDialog label="전체 메뉴" onClose={() => setExpanded(false)}>
      <section className="mobile-menu-sheet">
        <header><div><span>THE CUP EDU</span><h2>전체 메뉴</h2></div><button type="button" aria-label="메뉴 닫기" onClick={() => setExpanded(false)}>닫기</button></header>
        <p>필요한 업무를 선택하세요.</p>
        <nav aria-label="전체 업무 메뉴">{items.map(item => <button type="button" key={item.key}
          className={activeKey === item.key ? "active" : ""}
          aria-current={activeKey === item.key ? "page" : undefined}
          onClick={() => select(item.key)}>
          <NavigationIcon name={item.key} /><span>{item.title ?? item.label}</span><small>{activeKey === item.key ? "현재" : "→"}</small>
        </button>)}</nav>
      </section>
    </AccessibleDialog>}
  </>;
}

export function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 11 12 3l9 8M5 9v12h5v-7h4v7h5V9",
    dashboard: "M4 4v16h17M8 16v-5m5 5V7m5 9V3",
    inventory: "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7m-9 4v10M7 5l9 4",
    education: "M12 5v16M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 2-3-3-6-3-9-2V4Z",
    booking: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2-3v6m10-6v6M3 11h18m-14 5h3m4 0h3",
    reservations: "M5 3h14v18H5V3Zm3 5h8m-8 5 2 2 5-5",
    practice: "m5 16 11-11 3 3L8 19l-4 1 1-4ZM14 7l3 3M13 20h7",
    record: "M5 3h14v18H5V3Zm3 5h8m-8 4h8m-8 4h5",
    finance: "M3 6h18v14H3V6Zm0 4h18m-4 5h1M6 6V3h12v3",
    students: "M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 5 5v2",
    staff: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a8 5 0 0 1 16 0v2",
    more: "M4 5h16M4 12h16M4 19h16",
  };
  return <svg className="navigation-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name === "schedule" ? "booking" : name] ?? paths.record} /></svg>;
}
