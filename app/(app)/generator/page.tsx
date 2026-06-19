"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import ResumeForm from "@/components/ResumeForm";
import ResultDisplay, { QuestionAnswer } from "@/components/ResultDisplay";
import {
  DEFAULT_JOBSITE,
  JOBSITES,
  type JobsiteId,
} from "@/lib/jobsites";
import type { UpdatedResume, AnalysisResult } from "@/lib/types/resume";
import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";

export type {
  WorkType,
  ResumeExperience,
  ResumeEducation,
  ResumeProject,
  UpdatedResume,
  AnalysisResult,
} from "@/lib/types/resume";

interface AnalysisResponse {
  resume: UpdatedResume;
  pdfBase64?: string;
  pdfError?: string;
  providerUsed?: "anthropic" | "openai" | "deepseek";
  modelUsed?: string;
}

interface ResumeTabState {
  id: string;
  label: string;
  result: AnalysisResult | null;
  pdfBase64?: string;
  pdfError?: string;
  loading: boolean;
  error: string | null;
  resumeId?: string;
  currentJobRole: string;
  currentCompanyName: string;
  currentJobLink: string;
  currentApiProvider: "anthropic" | "openai" | "deepseek";
  lastProviderUsed?: "anthropic" | "openai" | "deepseek";
  lastModelUsed?: string;
  questionsText: string;
  lastJd: string;
  draftJobRole: string;
  draftCompanyName: string;
  draftJobLink: string;
  draftJd: string;
  jobsite: JobsiteId;
  coverLetter: string;
  answers: QuestionAnswer[];
}

function createTab(
  index: number,
  provider: "anthropic" | "openai" | "deepseek" = "openai",
  jobsite: JobsiteId = DEFAULT_JOBSITE
): ResumeTabState {
  return {
    id: `tab-${index}`,
    label: `Resume ${index}`,
    result: null,
    pdfBase64: undefined,
    pdfError: undefined,
    loading: false,
    error: null,
    resumeId: undefined,
    currentJobRole: "",
    currentCompanyName: "",
    currentJobLink: "",
    currentApiProvider: provider,
    lastProviderUsed: undefined,
    lastModelUsed: undefined,
    questionsText: "",
    lastJd: "",
    draftJobRole: "",
    draftCompanyName: "",
    draftJobLink: "",
    draftJd: "",
    jobsite,
    coverLetter: "",
    answers: [],
  };
}

export default function GeneratorPage() {
  const { user } = useAuth();
  const [lastSelectedApiProvider, setLastSelectedApiProvider] = useState<
    "anthropic" | "openai" | "deepseek"
  >("openai");
  const [lastSelectedJobsite, setLastSelectedJobsite] =
    useState<JobsiteId>(DEFAULT_JOBSITE);
  const [tabs, setTabs] = useState<ResumeTabState[]>([
    createTab(1, "openai", DEFAULT_JOBSITE),
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");
  const [nextTabIndex, setNextTabIndex] = useState<number>(2);

  const patchTab = useCallback((tabId: string, patch: Partial<ResumeTabState>) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab))
    );
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  const handleCreateNextResumeTab = useCallback(() => {
    const newTab = createTab(nextTabIndex, lastSelectedApiProvider, lastSelectedJobsite);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setNextTabIndex((prev) => prev + 1);
  }, [nextTabIndex, lastSelectedApiProvider, lastSelectedJobsite]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (tabs.length <= 1) return;

      let nextActiveId: string | undefined;
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const closingIndex = prev.findIndex((tab) => tab.id === tabId);
        if (closingIndex < 0) return prev;

        const updated = prev.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          nextActiveId = updated[Math.min(closingIndex, updated.length - 1)]?.id;
        }
        return updated;
      });

      if (nextActiveId) {
        setActiveTabId(nextActiveId);
      }
    },
    [tabs.length, activeTabId]
  );

  const handleSubmit = useCallback(
    async (
      tabId: string,
      jd: string,
      resumeContent: string,
      template?: string,
      profileData?: LegacyAnalyzeProfile,
      apiProvider?: "anthropic" | "openai" | "deepseek",
      jobRole?: string,
      companyName?: string,
      jobLink?: string,
      jobsite?: JobsiteId
    ) => {
      const cleanRole = jobRole?.trim() ?? "";
      const cleanCompany = companyName?.trim() ?? "";
      const cleanLink = jobLink?.trim() ?? "";
      const selectedProvider = apiProvider || "openai";
      const derivedLabel =
        cleanRole && cleanCompany
          ? `${cleanRole} - ${cleanCompany}`
          : cleanRole || cleanCompany || undefined;

      setLastSelectedApiProvider(selectedProvider);

      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                loading: true,
                error: null,
                result: null,
                pdfBase64: undefined,
                pdfError: undefined,
                resumeId: undefined,
                currentJobRole: cleanRole,
                currentCompanyName: cleanCompany,
                currentJobLink: cleanLink,
                currentApiProvider: selectedProvider,
                lastProviderUsed: undefined,
                lastModelUsed: undefined,
                lastJd: jd ?? "",
                coverLetter: "",
                answers: [],
                label: derivedLabel || tab.label,
              }
            : tab
        )
      );

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("You must be signed in to generate a resume");
        }

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            jd,
            resumeContent,
            template,
            profileData,
            apiProvider: selectedProvider,
          }),
        });

        if (!response.ok) {
          let errorMessage = "Failed to generate resume";
          try {
            const errorData = await response.json();
            errorMessage =
              typeof errorData.error === "string" && errorData.error.trim()
                ? errorData.error
                : errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data: AnalysisResponse = await response.json();
        const base64Str = data.pdfBase64 ? String(data.pdfBase64).trim() : undefined;

        patchTab(tabId, {
          result: data.resume,
          pdfBase64: base64Str && base64Str.length > 0 ? base64Str : undefined,
          pdfError: data.pdfError,
          lastProviderUsed: data.providerUsed,
          lastModelUsed: data.modelUsed,
          resumeId: undefined,
          error: null,
          loading: false,
        });
      } catch (err) {
        patchTab(tabId, {
          error: err instanceof Error ? err.message : "An error occurred",
          loading: false,
        });
      }
    },
    [patchTab]
  );

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="sidebar-shell">
          <div className="flex-1 overflow-y-auto p-3 pt-5">
            <p className="label-kicker mb-3 px-1">Sessions</p>
            <div className="space-y-1.5">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={activeTabId === tab.id ? "tab-pill tab-pill-active" : "tab-pill"}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs font-medium"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{tab.label}</span>
                      {tab.loading && (
                        <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-300" />
                      )}
                    </span>
                  </button>
                  {tabs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleCloseTab(tab.id)}
                      className={`flex-shrink-0 px-1.5 py-1.5 text-xs ${
                        activeTabId === tab.id ? "hover:bg-white/15" : "hover:bg-slate-100"
                      }`}
                      aria-label={`Close ${tab.label}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 border-t border-slate-200/80 p-3">
            <button type="button" onClick={handleCreateNextResumeTab} className="btn-primary w-full py-2 text-xs">
              + New Session
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:p-5">
          <div className="panel flex flex-1 flex-col overflow-hidden">
            <p className="label-kicker mb-4 flex-shrink-0">Generate Resume</p>
            <div className="mb-4 grid flex-shrink-0 grid-cols-2 gap-3">
              <div>
                <label htmlFor="aiModel" className="label-kicker mb-2 block">
                  AI Model
                </label>
                <select
                  id="aiModel"
                  value={activeTab.lastProviderUsed ?? activeTab.currentApiProvider}
                  disabled={activeTab.loading || !!activeTab.result}
                  onChange={(e) => {
                    const value = e.target.value as "anthropic" | "openai" | "deepseek";
                    patchTab(activeTab.id, { currentApiProvider: value });
                    setLastSelectedApiProvider(value);
                  }}
                  className="input-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Claude</option>
                  <option value="deepseek">Deepseek</option>
                </select>
              </div>
              <div>
                <label htmlFor="jobsite" className="label-kicker mb-2 block">
                  Jobsite
                </label>
                <select
                  id="jobsite"
                  value={activeTab.jobsite}
                  disabled={activeTab.loading}
                  onChange={(e) => {
                    const value = e.target.value as JobsiteId;
                    patchTab(activeTab.id, { jobsite: value });
                    setLastSelectedJobsite(value);
                  }}
                  className="input-shell w-full text-xs"
                >
                  {JOBSITES.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ResumeForm
                jobLink={activeTab.draftJobLink}
                jobRole={activeTab.draftJobRole}
                companyName={activeTab.draftCompanyName}
                jd={activeTab.draftJd}
                userEmail={user.email}
                userId={user.id}
                onJobLinkChange={(value) => patchTab(activeTab.id, { draftJobLink: value })}
                onJobRoleChange={(value) => patchTab(activeTab.id, { draftJobRole: value })}
                onCompanyNameChange={(value) => patchTab(activeTab.id, { draftCompanyName: value })}
                onJdChange={(value) => patchTab(activeTab.id, { draftJd: value })}
                onSubmit={(jd, resumeContent, template, profileData, jobRole, companyName) =>
                  handleSubmit(
                    activeTab.id,
                    jd,
                    resumeContent,
                    template,
                    profileData,
                    activeTab.currentApiProvider,
                    jobRole,
                    companyName,
                    activeTab.draftJobLink,
                    activeTab.jobsite
                  )
                }
                loading={activeTab.loading}
              />
            </div>
          </div>
          <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
            <p className="label-kicker mb-4 flex-shrink-0">
              {activeTab.currentJobRole && activeTab.currentCompanyName
                ? `${activeTab.currentJobRole} — ${activeTab.currentCompanyName}`
                : "Your Resume"}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {activeTab.error && (
                <div className="mb-3 max-h-[70vh] overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-red-800">
                  {activeTab.error}
                </div>
              )}
              {activeTab.loading && (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                  <p className="text-sm text-slate-600">Generating…</p>
                </div>
              )}
              {activeTab.result && !activeTab.loading && (
                <ResultDisplay
                  key={activeTab.id}
                  result={activeTab.result}
                  pdfBase64={activeTab.pdfBase64}
                  pdfError={activeTab.pdfError}
                  sessionApiProvider={activeTab.lastProviderUsed ?? activeTab.currentApiProvider}
                  jobRole={activeTab.currentJobRole}
                  companyName={activeTab.currentCompanyName}
                  jobLink={activeTab.currentJobLink}
                  jobsite={activeTab.jobsite}
                  providerUsed={activeTab.lastProviderUsed}
                  modelUsed={activeTab.lastModelUsed}
                  lastJd={activeTab.lastJd}
                  resumeId={activeTab.resumeId}
                  userId={user.id}
                  onResumeSaved={(id) => patchTab(activeTab.id, { resumeId: id })}
                  questionsText={activeTab.questionsText}
                  setQuestionsText={(value) => patchTab(activeTab.id, { questionsText: value })}
                  coverLetter={activeTab.coverLetter}
                  setCoverLetter={(value) => patchTab(activeTab.id, { coverLetter: value })}
                  answers={activeTab.answers}
                  setAnswers={(value) => patchTab(activeTab.id, { answers: value })}
                />
              )}
              {!activeTab.result && !activeTab.loading && !activeTab.error && (
                <div className="empty-state h-full min-h-[240px] border-0 bg-transparent shadow-none">
                  <div className="empty-state-icon">
                    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-700">Ready when you are</p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    Paste a job description and click Generate to tailor your resume.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
