"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import Auth from "@/components/Auth";
import ResumeForm from "@/components/ResumeForm";
import ResultDisplay, { QuestionAnswer } from "@/components/ResultDisplay";

export interface ResumeExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  description?: string;
  achievements?: string[];
}

export interface ResumeEducation {
  degree: string;
  school: string;
  location?: string;
  graduationDate: string;
  gpa?: string;
}

export interface ResumeProject {
  name: string;
  description?: string;
  technologies?: string[];
}

export interface UpdatedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  summary?: string;
  experience?: ResumeExperience[];
  skills?: Record<string, string[]>;
  education?: ResumeEducation[];
  certifications?: string[];
  projects?: ResumeProject[];
}

export type AnalysisResult = UpdatedResume;

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
  currentJobRole: string;
  currentCompanyName: string;
  currentApiProvider: "anthropic" | "openai" | "deepseek";
  lastProviderUsed?: "anthropic" | "openai" | "deepseek";
  lastModelUsed?: string;
  questionsText: string;
  lastJd: string;
  coverLetter: string;
  answers: QuestionAnswer[];
}

function createTab(
  index: number,
  provider: "anthropic" | "openai" | "deepseek" = "openai"
): ResumeTabState {
  return {
    id: `tab-${index}`,
    label: `Resume ${index}`,
    result: null,
    pdfBase64: undefined,
    pdfError: undefined,
    loading: false,
    error: null,
    currentJobRole: "",
    currentCompanyName: "",
    currentApiProvider: provider,
    lastProviderUsed: undefined,
    lastModelUsed: undefined,
    questionsText: "",
    lastJd: "",
    coverLetter: "",
    answers: [],
  };
}

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [lastSelectedApiProvider, setLastSelectedApiProvider] = useState<
    "anthropic" | "openai" | "deepseek"
  >("openai");
  const [tabs, setTabs] = useState<ResumeTabState[]>([createTab(1, "openai")]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");
  const [nextTabIndex, setNextTabIndex] = useState<number>(2);
  const [downloadPath, setDownloadPath] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch("/api/preferences", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.json())
        .then(({ preferences }) => setDownloadPath((preferences?.default_resume as any)?.download_path || ""))
        .catch(() => {});
    });
  }, [user]);

  const patchTab = useCallback((tabId: string, patch: Partial<ResumeTabState>) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab))
    );
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  const handleCreateNextResumeTab = useCallback(() => {
    const newTab = createTab(nextTabIndex, lastSelectedApiProvider);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setNextTabIndex((prev) => prev + 1);
  }, [nextTabIndex, lastSelectedApiProvider]);

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
      profileData?: any,
      apiProvider?: "anthropic" | "openai" | "deepseek",
      jobRole?: string,
      companyName?: string
    ) => {
      const cleanRole = jobRole?.trim() ?? "";
      const cleanCompany = companyName?.trim() ?? "";
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
                currentJobRole: cleanRole,
                currentCompanyName: cleanCompany,
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
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
            errorMessage = errorData.error || errorMessage;
          } catch {
            try {
              const errorText = await response.text();
              errorMessage = errorText || errorMessage;
            } catch {
              errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
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

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl">
        <h1 className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-xl font-semibold text-transparent" style={{ fontFamily: "var(--font-display)" }}>
          Resume Tailor
        </h1>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">{user.email}</span>
          <Link href="/profile" className="btn-soft px-3 py-1.5 text-xs">Profile</Link>
          <button onClick={signOut} className="btn-primary px-3 py-1.5 text-xs">Sign Out</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[13%] min-w-[160px] flex-shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white/70 backdrop-blur">
          <div className="flex-1 overflow-y-auto p-3 pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sessions</p>
            <div className="space-y-1">
              {tabs.map((tab) => (
                <div key={tab.id} className={`flex items-center rounded-lg border transition-colors ${activeTabId === tab.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  <button type="button" onClick={() => setActiveTabId(tab.id)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{tab.label}</span>
                      {tab.loading && <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-300" />}
                    </span>
                  </button>
                  {tabs.length > 1 && (
                    <button type="button" onClick={() => handleCloseTab(tab.id)} className={`flex-shrink-0 px-1.5 py-1.5 text-xs ${activeTabId === tab.id ? "hover:bg-blue-700" : "hover:bg-slate-100"}`} aria-label={`Close ${tab.label}`}>×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 border-t border-slate-200 p-3">
            <button type="button" onClick={handleCreateNextResumeTab} className="btn-primary w-full py-1.5 text-xs">+ New Session</button>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_60px_-30px_rgba(17,24,39,0.3)] backdrop-blur-xl">
            <p className="mb-3 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">Generate Resume</p>
            <div className="mb-4 flex-shrink-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI Model</p>
              <div className="flex gap-1.5">
                {(["openai", "anthropic", "deepseek"] as const).map((p) => {
                  const labels = { openai: "OpenAI", anthropic: "Claude", deepseek: "Deepseek" };
                  const sessionProvider = activeTab.lastProviderUsed ?? activeTab.currentApiProvider;
                  const modelLocked = !!activeTab.result;
                  const active = (modelLocked ? sessionProvider : activeTab.currentApiProvider) === p;
                  const activeColor = { openai: "bg-emerald-600 text-white", anthropic: "bg-amber-600 text-white", deepseek: "bg-blue-600 text-white" }[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={activeTab.loading || modelLocked}
                      onClick={() => { patchTab(activeTab.id, { currentApiProvider: p }); setLastSelectedApiProvider(p); }}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? activeColor : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {labels[p]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">
                {activeTab.result
                  ? "Model locked for this session. Start a new session to use a different model."
                  : "Choose before generating — applies to resume, cover letter, and answers."}
              </p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ResumeForm
                onSubmit={(jd, resumeContent, template, profileData, jobRole, companyName) =>
                  handleSubmit(activeTab.id, jd, resumeContent, template, profileData, activeTab.currentApiProvider, jobRole, companyName)
                }
                loading={activeTab.loading}
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_60px_-30px_rgba(17,24,39,0.3)] backdrop-blur-xl">
            <p className="mb-3 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {activeTab.currentJobRole && activeTab.currentCompanyName
                ? `${activeTab.currentJobRole} — ${activeTab.currentCompanyName}`
                : "Your Resume"}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {activeTab.error && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{activeTab.error}</div>
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
                  providerUsed={activeTab.lastProviderUsed}
                  modelUsed={activeTab.lastModelUsed}
                  lastJd={activeTab.lastJd}
                  downloadPath={downloadPath}
                  questionsText={activeTab.questionsText}
                  setQuestionsText={(value) => patchTab(activeTab.id, { questionsText: value })}
                  coverLetter={activeTab.coverLetter}
                  setCoverLetter={(value) => patchTab(activeTab.id, { coverLetter: value })}
                  answers={activeTab.answers}
                  setAnswers={(value) => patchTab(activeTab.id, { answers: value })}
                />
              )}
              {!activeTab.result && !activeTab.loading && !activeTab.error && (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                    <svg className="h-7 w-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500">Paste a job description and click Generate.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
