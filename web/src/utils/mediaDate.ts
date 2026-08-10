import type { MediaItem } from "../api/types";

/** 撮影日を持つか。持たないものは「撮影日なし」枠として分離する。 */
export function hasCapturedDate(m: MediaItem): boolean {
  return !!m.capturedAt;
}

/** 表示・並び替えに使う実効日付(撮影日優先、無ければアップロード日)。ISO文字列。 */
export function effectiveDate(m: MediaItem): string {
  return m.capturedAt ?? m.createdAt;
}

/** 実効日付で比較(降順/昇順)。 */
export function compareByDate(
  a: MediaItem,
  b: MediaItem,
  order: "desc" | "asc"
): number {
  const da = effectiveDate(a);
  const db = effectiveDate(b);
  return order === "desc" ? db.localeCompare(da) : da.localeCompare(db);
}

export interface MonthGroup {
  year: number;
  month: number; // 1-12
  key: string; // "YYYY-MM"
  items: MediaItem[];
}

export interface YearGroup {
  year: number;
  count: number;
  months: MonthGroup[];
}

export interface CalendarGroups {
  /** 撮影日なし(カレンダーでは一番上に表示する) */
  noDate: MediaItem[];
  /** 撮影日ありを 年→月 でグルーピング */
  years: YearGroup[];
}

/**
 * カレンダー表示用に 撮影日なし枠 + 年→月グループ を作る。
 * 撮影日なしは noDate に集め、UI 側で一番上に表示する。
 * order で年・月の並び、各月内・なし枠のソートを制御。
 */
export function groupForCalendar(
  items: MediaItem[],
  order: "desc" | "asc"
): CalendarGroups {
  const noDate: MediaItem[] = [];
  const dated: MediaItem[] = [];
  for (const m of items) {
    (hasCapturedDate(m) ? dated : noDate).push(m);
  }
  noDate.sort((a, b) => compareByDate(a, b, order));
  return { noDate, years: groupByYearMonth(dated, order) };
}

/**
 * メディアを 年 → 月 にグルーピングする(撮影日ありのみ想定)。
 * order で年・月の並びを降順/昇順にする。各月内は実効日付でソート。
 */
export function groupByYearMonth(
  items: MediaItem[],
  order: "desc" | "asc"
): YearGroup[] {
  const monthMap = new Map<string, MonthGroup>();

  for (const m of items) {
    const d = new Date(effectiveDate(m));
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    let g = monthMap.get(key);
    if (!g) {
      g = { year, month, key, items: [] };
      monthMap.set(key, g);
    }
    g.items.push(m);
  }

  // 各月内をソート
  for (const g of monthMap.values()) {
    g.items.sort((a, b) => compareByDate(a, b, order));
  }

  // 年でまとめる
  const yearMap = new Map<number, YearGroup>();
  for (const g of monthMap.values()) {
    let y = yearMap.get(g.year);
    if (!y) {
      y = { year: g.year, count: 0, months: [] };
      yearMap.set(g.year, y);
    }
    y.months.push(g);
    y.count += g.items.length;
  }

  const dir = order === "desc" ? -1 : 1;
  const years = [...yearMap.values()].sort((a, b) => (a.year - b.year) * dir);
  for (const y of years) {
    y.months.sort((a, b) => (a.month - b.month) * dir);
  }
  return years;
}
