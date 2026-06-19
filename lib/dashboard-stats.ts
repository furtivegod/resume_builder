import type { ResumeRecord } from "@/lib/supabase/database.types";
import { DEFAULT_BID_STATUS } from "@/lib/supabase/database.types";

export interface CountEntry {
  label: string;
  count: number;
}

export interface BidSuccessStats {
  bidCount: number;
  interviewBidCount: number;
  interviewRate: number;
}

export interface ModelRateEntry {
  model: string;
  bidCount: number;
  interviewBidCount: number;
  interviewRate: number;
}

export function resolveBidStatusForStats(status: string | null | undefined): string {
  if (!status || status === "draft") return DEFAULT_BID_STATUS;
  return status;
}

export function isBidAdvanced(
  record: ResumeRecord,
  interviewCountForBid: number
): boolean {
  if (interviewCountForBid > 0) return true;
  return resolveBidStatusForStats(record.bid_status) !== DEFAULT_BID_STATUS;
}

export function buildInterviewsByResume<T extends { resume_id: string | null }>(
  interviews: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of interviews) {
    if (!row.resume_id) continue;
    const list = map.get(row.resume_id) ?? [];
    list.push(row);
    map.set(row.resume_id, list);
  }
  return map;
}

export function computeBidSuccessStats(
  records: ResumeRecord[],
  interviewsByResume: Map<string, { resume_id: string | null }[]>
): BidSuccessStats {
  let interviewBidCount = 0;

  for (const record of records) {
    const linked = interviewsByResume.get(record.id) ?? [];
    if (isBidAdvanced(record, linked.length)) {
      interviewBidCount += 1;
    }
  }

  const bidCount = records.length;
  const interviewRate =
    bidCount > 0 ? Math.round((interviewBidCount / bidCount) * 1000) / 10 : 0;

  return { bidCount, interviewBidCount, interviewRate };
}

export function computeModelSuccessStats(
  records: ResumeRecord[],
  interviewsByResume: Map<string, { resume_id: string | null }[]>
): ModelRateEntry[] {
  const byModel = new Map<string, ResumeRecord[]>();

  for (const record of records) {
    const model = record.model?.trim() || "Unknown";
    const list = byModel.get(model) ?? [];
    list.push(record);
    byModel.set(model, list);
  }

  return Array.from(byModel.entries())
    .map(([model, modelRecords]) => {
      const stats = computeBidSuccessStats(modelRecords, interviewsByResume);
      return {
        model,
        bidCount: stats.bidCount,
        interviewBidCount: stats.interviewBidCount,
        interviewRate: stats.interviewRate,
      };
    })
    .sort((a, b) => b.bidCount - a.bidCount || b.interviewRate - a.interviewRate);
}

export const AI_PROVIDER_ORDER = ["openai", "anthropic", "deepseek"] as const;

export function getLocalDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayKey(): string {
  return getLocalDateKey(new Date());
}

export function isToday(iso: string): boolean {
  return getLocalDateKey(iso) === getTodayKey();
}

export function isInDateRange(iso: string, from: string, to: string): boolean {
  const key = getLocalDateKey(iso);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function filterRecordsByDateRange(
  records: ResumeRecord[],
  from: string,
  to: string
): ResumeRecord[] {
  if (!from && !to) return records;
  return records.filter((record) => isInDateRange(record.created_at, from, to));
}

export function countByField(
  records: ResumeRecord[],
  field: "ai_type" | "model",
  fallback = "Unknown"
): CountEntry[] {
  const map = new Map<string, number>();
  for (const record of records) {
    const raw = field === "ai_type" ? record.ai_type : record.model;
    const key = raw?.trim() || fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function getMonthStartKey(reference = new Date()): string {
  const y = reference.getFullYear();
  const m = String(reference.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return getLocalDateKey(d);
}

export function formatDisplayDate(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function providerLabel(provider: string): string {
  if (provider === "Unknown") return provider;
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function providerColor(provider: string): {
  bar: string;
  bg: string;
  text: string;
  ring: string;
} {
  switch (provider.toLowerCase()) {
    case "openai":
      return {
        bar: "bg-emerald-500",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        ring: "stroke-emerald-500",
      };
    case "anthropic":
      return {
        bar: "bg-amber-500",
        bg: "bg-amber-50",
        text: "text-amber-700",
        ring: "stroke-amber-500",
      };
    case "deepseek":
      return {
        bar: "bg-violet-500",
        bg: "bg-violet-50",
        text: "text-violet-700",
        ring: "stroke-violet-500",
      };
    default:
      return {
        bar: "bg-slate-400",
        bg: "bg-slate-50",
        text: "text-slate-600",
        ring: "stroke-slate-400",
      };
  }
}
