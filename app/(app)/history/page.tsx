"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  BID_STATUSES,
  DEFAULT_BID_STATUS,
  INTERVIEW_CALL_TYPES,
  type BidStatus,
  type InterviewCallType,
  type InterviewRecord,
  type ResumeRecord,
} from "@/lib/supabase/database.types";
import {
  listResumes,
  updateResumeBidStatus,
  getResumeArtifacts,
} from "@/lib/supabase/services/resumes";
import {
  listInterviews,
  createInterview,
  deleteInterview,
} from "@/lib/supabase/services/interviews";
import { JOBSITES } from "@/lib/jobsites";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

const AI_PROVIDERS = ["openai", "anthropic", "deepseek"] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatListDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatInterviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resolveBidStatus(status: string | null | undefined): BidStatus {
  if (!status || status === "draft") return DEFAULT_BID_STATUS;
  return BID_STATUSES.includes(status as BidStatus) ? (status as BidStatus) : DEFAULT_BID_STATUS;
}

function jobsiteLabel(id: string | null): string {
  if (!id) return "—";
  return JOBSITES.find((site) => site.id === id)?.label ?? id;
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function isDateInRange(iso: string, from: string, to: string): boolean {
  const d = toDateOnly(iso);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function matchesSearch(
  record: ResumeRecord,
  recordInterviews: InterviewRecord[],
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    record.job_title,
    record.job_company,
    record.job_link,
    record.ai_type,
    record.model,
    jobsiteLabel(record.job_site),
    record.bid_status,
    formatListDate(record.created_at),
    toDateOnly(record.created_at),
    ...recordInterviews.flatMap((row) => [
      row.caller,
      row.interviewer,
      formatInterviewDate(row.interview_date),
      toDateOnly(row.interview_date),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function matchesDateFilter(
  record: ResumeRecord,
  recordInterviews: InterviewRecord[],
  from: string,
  to: string
): boolean {
  if (!from && !to) return true;
  if (isDateInRange(record.created_at, from, to)) return true;
  return recordInterviews.some((row) => isDateInRange(row.interview_date, from, to));
}

function matchesTextOnInterviews(
  recordInterviews: InterviewRecord[],
  query: string,
  field: "caller" | "interviewer"
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return recordInterviews.some((row) => row[field]?.toLowerCase().includes(q));
}

function matchesModelFilter(record: ResumeRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return record.model?.toLowerCase().includes(q) ?? false;
}

function emptyInterviewForm() {
  return {
    interview_date: new Date().toISOString().slice(0, 10),
    caller: "",
    interviewer: "",
    call_type: "" as InterviewCallType | "",
    video_name: "",
    note: "",
  };
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<ResumeRecord[]>([]);
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedJd, setExpandedJd] = useState("");
  const [expandedResume, setExpandedResume] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [interviewFormFor, setInterviewFormFor] = useState<string | null>(null);
  const [interviewForm, setInterviewForm] = useState(emptyInterviewForm);
  const [savingInterview, setSavingInterview] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBidStatus, setFilterBidStatus] = useState<BidStatus | "">("");
  const [filterJobSite, setFilterJobSite] = useState("");
  const [filterAiProvider, setFilterAiProvider] = useState("");
  const [filterAiModel, setFilterAiModel] = useState("");
  const [filterHasInterviews, setFilterHasInterviews] = useState<"" | "yes" | "no">("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCaller, setFilterCaller] = useState("");
  const [filterInterviewer, setFilterInterviewer] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const interviewsByResume = useMemo(() => {
    const map = new Map<string, InterviewRecord[]>();
    for (const row of interviews) {
      if (!row.resume_id) continue;
      const list = map.get(row.resume_id) ?? [];
      list.push(row);
      map.set(row.resume_id, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.interview_date).getTime() -
          new Date(a.interview_date).getTime()
      );
    }
    return map;
  }, [interviews]);

  const modelOptions = useMemo(() => {
    const models = new Set<string>();
    for (const record of records) {
      const model = record.model?.trim();
      if (model) models.add(model);
    }
    return Array.from(models).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const recordInterviews = interviewsByResume.get(record.id) ?? [];

      if (!matchesSearch(record, recordInterviews, searchQuery)) return false;

      if (filterBidStatus && resolveBidStatus(record.bid_status) !== filterBidStatus) {
        return false;
      }

      if (filterJobSite && record.job_site !== filterJobSite) return false;

      if (filterAiProvider && record.ai_type !== filterAiProvider) return false;

      if (!matchesModelFilter(record, filterAiModel)) return false;

      const interviewCount = recordInterviews.length;
      if (filterHasInterviews === "yes" && interviewCount === 0) return false;
      if (filterHasInterviews === "no" && interviewCount > 0) return false;

      if (!matchesDateFilter(record, recordInterviews, filterDateFrom, filterDateTo)) {
        return false;
      }

      if (!matchesTextOnInterviews(recordInterviews, filterCaller, "caller")) return false;
      if (!matchesTextOnInterviews(recordInterviews, filterInterviewer, "interviewer")) {
        return false;
      }

      return true;
    });
  }, [
    records,
    searchQuery,
    filterBidStatus,
    filterJobSite,
    filterAiProvider,
    filterAiModel,
    filterHasInterviews,
    filterDateFrom,
    filterDateTo,
    filterCaller,
    filterInterviewer,
    interviewsByResume,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));

  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterBidStatus !== "" ||
    filterJobSite !== "" ||
    filterAiProvider !== "" ||
    filterAiModel.trim().length > 0 ||
    filterHasInterviews !== "" ||
    filterDateFrom !== "" ||
    filterDateTo !== "" ||
    filterCaller.trim().length > 0 ||
    filterInterviewer.trim().length > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterBidStatus("");
    setFilterJobSite("");
    setFilterAiProvider("");
    setFilterAiModel("");
    setFilterHasInterviews("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterCaller("");
    setFilterInterviewer("");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    filterBidStatus,
    filterJobSite,
    filterAiProvider,
    filterAiModel,
    filterHasInterviews,
    filterDateFrom,
    filterDateTo,
    filterCaller,
    filterInterviewer,
    pageSize,
  ]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!authLoading && user) {
      loadRecords();
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
      console.error("Failed to load resume history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBidStatusChange = async (record: ResumeRecord, bidStatus: BidStatus) => {
    try {
      const updated = await updateResumeBidStatus(record.id, bidStatus);
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (error) {
      console.error("Failed to update bid status:", error);
      alert("Failed to update status");
    }
  };

  const toggleExpand = async (record: ResumeRecord) => {
    if (expandedId === record.id) {
      setExpandedId(null);
      setInterviewFormFor(null);
      return;
    }

    setExpandedId(record.id);
    setInterviewFormFor(null);
    setInterviewForm(emptyInterviewForm());
    setLoadingDetail(true);
    setExpandedJd("");
    setExpandedResume("");
    try {
      const { jd, resume } = await getResumeArtifacts(record);
      setExpandedJd(jd);
      setExpandedResume(JSON.stringify(resume, null, 2));
    } catch (error) {
      console.error("Failed to load artifacts:", error);
      setExpandedJd("Failed to load job description.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const openInterviewForm = (resumeId: string) => {
    setInterviewFormFor(resumeId);
    setInterviewForm(emptyInterviewForm());
  };

  const handleCreateInterview = async (e: React.FormEvent, resumeId: string) => {
    e.preventDefault();
    if (!user) return;
    setSavingInterview(true);
    try {
      const { interview: created, resume: updatedResume } = await createInterview(user.id, {
        resume_id: resumeId,
        interview_date: interviewForm.interview_date,
        caller: interviewForm.caller || null,
        interviewer: interviewForm.interviewer || null,
        call_type: interviewForm.call_type || null,
        video_name: interviewForm.video_name || null,
        note: interviewForm.note || null,
      });
      setInterviews((prev) => [created, ...prev]);
      if (updatedResume) {
        setRecords((prev) =>
          prev.map((record) => (record.id === updatedResume.id ? updatedResume : record))
        );
      }
      setInterviewFormFor(null);
      setInterviewForm(emptyInterviewForm());
    } catch (error) {
      console.error("Failed to create interview:", error);
      alert("Failed to save interview info");
    } finally {
      setSavingInterview(false);
    }
  };

  const handleDeleteInterview = async (id: string) => {
    if (!confirm("Delete this interview record?")) return;
    try {
      await deleteInterview(id);
      setInterviews((prev) => prev.filter((row) => row.id !== id));
    } catch (error) {
      console.error("Failed to delete interview:", error);
      alert("Failed to delete");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <main className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="glass-panel overflow-hidden">
          <div className="page-header">
            <h2 className="page-title">Resume History</h2>
            <p className="page-subtitle">
              Job bids and interview notes saved to cloud storage
            </p>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            ) : records.length === 0 ? (
              <p className="py-12 text-center text-slate-500">No resumes yet. Generate one from the Generator page.</p>
            ) : (
              <>
                <div className="card-soft mb-3 space-y-2 p-3">
                  <div>
                    <label htmlFor="history-search" className="filter-label">
                      Search
                    </label>
                    <input
                      id="history-search"
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Title, company, AI model, date, caller…"
                      className="filter-control"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                      <div className="min-w-0">
                        <label htmlFor="filter-status" className="filter-label">
                          Status
                        </label>
                        <select
                          id="filter-status"
                          value={filterBidStatus}
                          onChange={(e) => setFilterBidStatus(e.target.value as BidStatus | "")}
                          className="filter-select"
                        >
                          <option value="">All statuses</option>
                          {BID_STATUSES.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-jobsite" className="filter-label">
                          Jobsite
                        </label>
                        <select
                          id="filter-jobsite"
                          value={filterJobSite}
                          onChange={(e) => setFilterJobSite(e.target.value)}
                          className="filter-select"
                        >
                          <option value="">All jobsites</option>
                          {JOBSITES.map((site) => (
                            <option key={site.id} value={site.id}>{site.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-ai" className="filter-label">
                          AI
                        </label>
                        <select
                          id="filter-ai"
                          value={filterAiProvider}
                          onChange={(e) => setFilterAiProvider(e.target.value)}
                          className="filter-select"
                        >
                          <option value="">All providers</option>
                          {AI_PROVIDERS.map((provider) => (
                            <option key={provider} value={provider}>{provider}</option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-ai-model" className="filter-label">
                          Model
                        </label>
                        <input
                          id="filter-ai-model"
                          type="search"
                          list="history-model-options"
                          value={filterAiModel}
                          onChange={(e) => setFilterAiModel(e.target.value)}
                          placeholder="All models"
                          className="filter-control"
                        />
                        <datalist id="history-model-options">
                          {modelOptions.map((model) => (
                            <option key={model} value={model} />
                          ))}
                        </datalist>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-interviews" className="filter-label">
                          Interviews
                        </label>
                        <select
                          id="filter-interviews"
                          value={filterHasInterviews}
                          onChange={(e) => setFilterHasInterviews(e.target.value as "" | "yes" | "no")}
                          className="filter-select"
                        >
                          <option value="">All bids</option>
                          <option value="yes">Has interviews</option>
                          <option value="no">No interviews</option>
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-date-from" className="filter-label">
                          From
                        </label>
                        <input
                          id="filter-date-from"
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                          className="filter-control"
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-date-to" className="filter-label">
                          To
                        </label>
                        <input
                          id="filter-date-to"
                          type="date"
                          value={filterDateTo}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                          className="filter-control"
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-caller" className="filter-label">
                          Caller
                        </label>
                        <input
                          id="filter-caller"
                          type="search"
                          value={filterCaller}
                          onChange={(e) => setFilterCaller(e.target.value)}
                          placeholder="Caller"
                          className="filter-control"
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="filter-interviewer" className="filter-label">
                          Interviewer
                        </label>
                        <input
                          id="filter-interviewer"
                          type="search"
                          value={filterInterviewer}
                          onChange={(e) => setFilterInterviewer(e.target.value)}
                          placeholder="Interviewer"
                          className="filter-control"
                        />
                      </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-0.5 text-[11px] text-slate-500">
                    <span>
                      {filteredRecords.length === 0
                        ? "No matching bids"
                        : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredRecords.length)} of ${filteredRecords.length}`}
                      {records.length !== filteredRecords.length ? ` (${records.length} total)` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {hasActiveFilters && (
                        <button type="button" onClick={clearFilters} className="btn-compact">
                          Clear filters
                        </button>
                      )}
                      <label className="flex items-center gap-1.5">
                        <span>Per page</span>
                        <select
                          value={pageSize}
                          onChange={(e) => setPageSize(Number(e.target.value))}
                          className="select-compact min-w-[4.5rem] py-1 text-xs"
                        >
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                {filteredRecords.length === 0 ? (
                  <p className="py-12 text-center text-slate-500">
                    No bids match your search or filters.
                  </p>
                ) : (
              <div className="space-y-2">
                {paginatedRecords.map((record) => {
                  const recordInterviews = interviewsByResume.get(record.id) ?? [];
                  const isExpanded = expandedId === record.id;
                  const showForm = interviewFormFor === record.id;

                  return (
                    <div key={record.id} className="card overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {record.job_link ? (
                              <a
                                href={record.job_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 truncate text-sm font-semibold leading-none text-slate-900 hover:text-blue-600 hover:underline"
                              >
                                {record.job_title || "Untitled role"}
                                {record.job_company ? ` · ${record.job_company}` : ""}
                              </a>
                            ) : (
                              <p className="min-w-0 truncate text-sm font-semibold leading-none text-slate-900">
                                {record.job_title || "Untitled role"}
                                {record.job_company ? ` · ${record.job_company}` : ""}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="badge">{formatListDate(record.created_at)}</span>
                              <span className="badge">{jobsiteLabel(record.job_site)}</span>
                              <span className="badge">{record.ai_type ?? "AI"}</span>
                              {record.model && <span className="badge max-w-[9rem] truncate">{record.model}</span>}
                              {recordInterviews.length > 0 && (
                                <span className="badge border-blue-200 bg-blue-50 text-blue-700">
                                  {recordInterviews.length} interview{recordInterviews.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <select
                            value={resolveBidStatus(record.bid_status)}
                            onChange={(e) => handleBidStatusChange(record, e.target.value as BidStatus)}
                            className="select-compact min-w-[7rem]"
                            aria-label="Bid status"
                          >
                            {BID_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => toggleExpand(record)}
                            className="btn-compact"
                          >
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 px-4 py-4">
                          {loadingDetail ? (
                            <div className="flex justify-center py-6">
                              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
                            </div>
                          ) : (
                            <div className="space-y-6">
                              <div className="grid gap-4 lg:grid-cols-2">
                                <div>
                                  <h4 className="mb-2 text-sm font-semibold text-slate-700">Job Description</h4>
                                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap">{expandedJd}</pre>
                                </div>
                                <div>
                                  <h4 className="mb-2 text-sm font-semibold text-slate-700">Resume JSON</h4>
                                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap">{expandedResume}</pre>
                                </div>
                              </div>

                              <div>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <h4 className="text-sm font-semibold text-slate-700">Interviews</h4>
                                  {!showForm && (
                                    <button
                                      type="button"
                                      onClick={() => openInterviewForm(record.id)}
                                      className="btn-primary px-3 py-1.5 text-xs"
                                    >
                                      Add interview info
                                    </button>
                                  )}
                                </div>

                                {recordInterviews.length === 0 && !showForm ? (
                                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                                    No interviews recorded for this bid yet.
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {recordInterviews.map((row) => (
                                      <div
                                        key={row.id}
                                        className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-semibold text-slate-900">
                                            {formatInterviewDate(row.interview_date)}
                                            {row.call_type ? ` · ${row.call_type.replace(/_/g, " ")}` : ""}
                                          </p>
                                          {row.caller && (
                                            <p className="text-sm text-slate-600">Caller: {row.caller}</p>
                                          )}
                                          {row.interviewer && (
                                            <p className="text-sm text-slate-600">Interviewer: {row.interviewer}</p>
                                          )}
                                          {row.video_name && (
                                            <p className="text-xs text-slate-500">Recording: {row.video_name}</p>
                                          )}
                                          {row.note && (
                                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.note}</p>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteInterview(row.id)}
                                          className="btn-soft text-xs text-red-600"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {showForm && (
                                  <form
                                    onSubmit={(e) => handleCreateInterview(e, record.id)}
                                    className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4"
                                  >
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                      <h5 className="text-sm font-semibold text-slate-800">Add interview info</h5>
                                      <button
                                        type="button"
                                        onClick={() => setInterviewFormFor(null)}
                                        className="btn-soft text-xs"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
                                        <input
                                          type="date"
                                          value={interviewForm.interview_date}
                                          onChange={(e) =>
                                            setInterviewForm((p) => ({ ...p, interview_date: e.target.value }))
                                          }
                                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                                          required
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Call type</label>
                                        <select
                                          value={interviewForm.call_type}
                                          onChange={(e) =>
                                            setInterviewForm((p) => ({
                                              ...p,
                                              call_type: e.target.value as InterviewCallType | "",
                                            }))
                                          }
                                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                                        >
                                          <option value="">Select type</option>
                                          {INTERVIEW_CALL_TYPES.map((type) => (
                                            <option key={type} value={type}>
                                              {type.replace(/_/g, " ")}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Caller</label>
                                        <input
                                          type="text"
                                          value={interviewForm.caller}
                                          onChange={(e) =>
                                            setInterviewForm((p) => ({ ...p, caller: e.target.value }))
                                          }
                                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                                          placeholder="Who placed or took the call"
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Interviewer</label>
                                        <input
                                          type="text"
                                          value={interviewForm.interviewer}
                                          onChange={(e) =>
                                            setInterviewForm((p) => ({ ...p, interviewer: e.target.value }))
                                          }
                                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Video / recording name</label>
                                        <input
                                          type="text"
                                          value={interviewForm.video_name}
                                          onChange={(e) =>
                                            setInterviewForm((p) => ({ ...p, video_name: e.target.value }))
                                          }
                                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                                          placeholder="e.g. zoom-recording-2026-06-10.mp4"
                                        />
                                      </div>
                                      <div className="sm:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                                        <textarea
                                          value={interviewForm.note}
                                          onChange={(e) =>
                                            setInterviewForm((p) => ({ ...p, note: e.target.value }))
                                          }
                                          rows={3}
                                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                                        />
                                      </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                      <button type="submit" disabled={savingInterview} className="btn-primary px-4 py-2 text-sm">
                                        {savingInterview ? "Saving…" : "Save interview info"}
                                      </button>
                                    </div>
                                  </form>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
                )}

                {filteredRecords.length > 0 && totalPages > 1 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {totalPages <= 7 ? (
                        Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setPage(pageNum)}
                            className={`min-w-8 rounded-lg px-2 py-1 text-xs ${
                              pageNum === page
                                ? "bg-blue-600 font-semibold text-white"
                                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {pageNum}
                          </button>
                        ))
                      ) : (
                        <span className="px-2 text-xs text-slate-600">
                          Page {page} of {totalPages}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
