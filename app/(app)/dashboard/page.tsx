"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CountBarChart from "@/components/dashboard/CountBarChart";
import ModelRateTable from "@/components/dashboard/ModelRateTable";
import ProviderBreakdown from "@/components/dashboard/ProviderBreakdown";
import SuccessRatePanel from "@/components/dashboard/SuccessRatePanel";
import {
  buildInterviewsByResume,
  computeBidSuccessStats,
  computeModelSuccessStats,
  countByField,
  filterRecordsByDateRange,
  formatDisplayDate,
  getLocalDateKey,
  getMonthStartKey,
  getTodayKey,
  isToday,
  shiftDateKey,
} from "@/lib/dashboard-stats";
import { listInterviews } from "@/lib/supabase/services/interviews";
import { listResumes } from "@/lib/supabase/services/resumes";
import type { InterviewRecord, ResumeRecord } from "@/lib/supabase/database.types";

type RangePreset = "7d" | "30d" | "month" | "all";

const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "month", label: "Month" },
  { id: "all", label: "All" },
];

function getPresetRange(preset: RangePreset, records: ResumeRecord[]): { from: string; to: string } {
  const today = getTodayKey();

  switch (preset) {
    case "7d":
      return { from: shiftDateKey(today, -6), to: today };
    case "30d":
      return { from: shiftDateKey(today, -29), to: today };
    case "month":
      return { from: getMonthStartKey(), to: today };
    case "all": {
      if (records.length === 0) return { from: "", to: today };
      const earliest = records.reduce((min, record) => {
        const key = getLocalDateKey(record.created_at);
        return key < min ? key : min;
      }, getLocalDateKey(records[0].created_at));
      return { from: earliest, to: today };
    }
  }
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<ResumeRecord[]>([]);
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeStart, setRangeStart] = useState(getMonthStartKey);
  const [rangeEnd, setRangeEnd] = useState(getTodayKey);
  const [activePreset, setActivePreset] = useState<RangePreset>("month");

  useEffect(() => {
    if (!authLoading && user) {
      void loadRecords();
    }
  }, [authLoading, user]);

  const loadRecords = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [resumeRows, interviewRows] = await Promise.all([
        listResumes(user.id),
        listInterviews(user.id),
      ]);
      setRecords(resumeRows);
      setInterviews(interviewRows);
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const interviewsByResume = useMemo(
    () => buildInterviewsByResume(interviews),
    [interviews]
  );

  const todayRecords = useMemo(
    () => records.filter((record) => isToday(record.created_at)),
    [records]
  );

  const todayTotal = todayRecords.length;
  const todayByProvider = useMemo(() => countByField(todayRecords, "ai_type"), [todayRecords]);

  const rangeRecords = useMemo(
    () => filterRecordsByDateRange(records, rangeStart, rangeEnd),
    [records, rangeStart, rangeEnd]
  );

  const rangeTotal = rangeRecords.length;
  const rangeByProvider = useMemo(() => countByField(rangeRecords, "ai_type"), [rangeRecords]);
  const rangeByModel = useMemo(() => countByField(rangeRecords, "model"), [rangeRecords]);
  const rangeSuccess = useMemo(
    () => computeBidSuccessStats(rangeRecords, interviewsByResume),
    [rangeRecords, interviewsByResume]
  );
  const rangeModelRates = useMemo(
    () => computeModelSuccessStats(rangeRecords, interviewsByResume),
    [rangeRecords, interviewsByResume]
  );

  const applyPreset = (preset: RangePreset) => {
    const { from, to } = getPresetRange(preset, records);
    setActivePreset(preset);
    setRangeStart(from);
    setRangeEnd(to);
  };

  const handleRangeStartChange = (value: string) => {
    setActivePreset("all");
    setRangeStart(value);
    if (rangeEnd && value > rangeEnd) setRangeEnd(value);
  };

  const handleRangeEndChange = (value: string) => {
    setActivePreset("all");
    setRangeEnd(value);
    if (rangeStart && value < rangeStart) setRangeStart(value);
  };

  const rangeLabel =
    rangeStart && rangeEnd
      ? `${formatDisplayDate(rangeStart)} – ${formatDisplayDate(rangeEnd)}`
      : "Select dates";

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <main className="page-shell py-5 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="glass-panel overflow-hidden">
          <div className="dashboard-header">
            <h2 className="dashboard-title">Dashboard</h2>
            <p className="dashboard-subtitle">
              Bid activity{user.email ? ` · ${user.email}` : ""}
            </p>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            ) : (
              <>
                <section className="chart-panel-compact">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="label-kicker">Today · {formatDisplayDate(getTodayKey())}</p>
                    <p className="font-display text-xl font-semibold tabular-nums text-slate-900">
                      {todayTotal}
                      <span className="ml-1.5 text-xs font-normal text-slate-500">bids</span>
                    </p>
                  </div>
                  {todayTotal > 0 ? (
                    <div className="mt-2">
                      <ProviderBreakdown entries={todayByProvider} compact />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">No bids yet today.</p>
                  )}
                </section>

                <section className="space-y-3 border-t border-slate-200/80 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="label-kicker">Analytics</p>
                      <p className="text-xs text-slate-500">{rangeLabel}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {RANGE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset.id)}
                          className={
                            activePreset === preset.id
                              ? "rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white"
                              : "btn-compact px-2"
                          }
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <div>
                      <label htmlFor="dashboard-range-start" className="filter-label">
                        From
                      </label>
                      <input
                        id="dashboard-range-start"
                        type="date"
                        value={rangeStart}
                        max={rangeEnd || undefined}
                        onChange={(e) => handleRangeStartChange(e.target.value)}
                        className="filter-control"
                      />
                    </div>
                    <div>
                      <label htmlFor="dashboard-range-end" className="filter-label">
                        To
                      </label>
                      <input
                        id="dashboard-range-end"
                        type="date"
                        value={rangeEnd}
                        min={rangeStart || undefined}
                        max={getTodayKey()}
                        onChange={(e) => handleRangeEndChange(e.target.value)}
                        className="filter-control"
                      />
                    </div>
                    <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Bids
                      </p>
                      <p className="font-display text-lg font-semibold tabular-nums text-slate-900">
                        {rangeTotal}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <SuccessRatePanel
                      compact
                      title="Interview rate"
                      subtitle={`${rangeSuccess.interviewBidCount} / ${rangeSuccess.bidCount} at interview stage`}
                      stats={rangeSuccess}
                    />
                    <ModelRateTable compact title="By model" entries={rangeModelRates} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <CountBarChart
                      compact
                      title="By provider"
                      entries={rangeByProvider}
                      colorByProvider
                      emptyMessage="No bids in range."
                      maxItems={5}
                    />
                    <CountBarChart
                      compact
                      title="By model"
                      entries={rangeByModel}
                      emptyMessage="No model data in range."
                      maxItems={5}
                    />
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
