"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import Auth from "@/components/Auth";
import ResumeForm from "@/components/ResumeForm";
import ResultDisplay from "@/components/ResultDisplay";

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Resume Generator
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                AI-powered resume optimization for your dream job
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/profile"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors shadow-md hover:shadow-lg"
              >
                Profile
              </Link>
              <span className="text-sm text-gray-600 hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className={`mb-4 rounded-xl border p-4 shadow-sm ${
          (() => {
            const p = activeTab?.currentApiProvider;
            if (p === "openai") return "bg-emerald-50 border-emerald-200";
            if (p === "deepseek") return "bg-purple-50 border-purple-200";
            return "bg-amber-50 border-amber-200";
          })()
        }`}>
          <div className="flex flex-wrap items-center gap-3">
            {(() => {
              const p = activeTab?.currentApiProvider;
              let badgeClass = "bg-amber-600 text-white";
              let badgeLabel = "CLAUDE MODE";
              let providerName = "Anthropic Claude";
              let desc = "Higher-cost mode is active. Switch to OpenAI when possible.";
              if (p === "openai") {
                badgeClass = "bg-emerald-600 text-white";
                badgeLabel = "OPENAI MODE";
                providerName = "OpenAI";
                desc = "Cost-optimized mode is active.";
              } else if (p === "deepseek") {
                badgeClass = "bg-purple-600 text-white";
                badgeLabel = "DEEPSEEK MODE";
                providerName = "Deepseek";
                desc = "Deepseek mode is active.";
              }

              return (
                <>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${badgeClass}`}>
                    {badgeLabel}
                  </span>
                  <p className="text-sm font-medium text-gray-800">
                    Current tab provider: {providerName}
                  </p>
                  <p className="text-sm text-gray-700">{desc}</p>
                </>
              );
            })()}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`inline-flex items-center rounded-lg border transition-colors ${
                  activeTabId === tab.id
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
                title={tab.label}
              >
                <button
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className="px-4 py-2 text-sm font-medium"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="max-w-[190px] truncate">{tab.label}</span>
                    {tab.loading && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </span>
                </button>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleCloseTab(tab.id)}
                    className={`px-2 py-2 text-sm border-l ${
                      activeTabId === tab.id
                        ? "border-indigo-400 hover:bg-indigo-700"
                        : "border-gray-300 hover:bg-gray-100"
                    }`}
                    aria-label={`Close ${tab.label}`}
                    title={`Close ${tab.label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleCreateNextResumeTab}
              className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors"
            >
              Next Resume
            </button>
          </div>
        </div>

        {tabs.map((tab) => (
          <div key={tab.id} className={activeTabId === tab.id ? "block" : "hidden"}>
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-xl shadow-xl p-6 lg:p-8 border border-gray-100">
                <div className="mb-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800 mb-2">
                        Generate Your Resume
                      </h2>
                      <p className="text-gray-600">
                        Enter the job description and your resume will be optimized
                        automatically
                      </p>
                    </div>
                    <div className="w-full sm:w-64">
                      <p className="block text-sm font-medium text-gray-700 mb-2">
                        AI Model
                      </p>
                      <div className="inline-flex w-full rounded-lg border border-gray-300 bg-white p-1">
                        <button
                          type="button"
                          onClick={() => {
                            patchTab(tab.id, { currentApiProvider: "openai" });
                            setLastSelectedApiProvider("openai");
                          }}
                          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            tab.currentApiProvider === "openai"
                              ? "bg-emerald-600 text-white"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                          aria-pressed={tab.currentApiProvider === "openai"}
                        >
                          OpenAI
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            patchTab(tab.id, { currentApiProvider: "anthropic" });
                            setLastSelectedApiProvider("anthropic");
                          }}
                          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            tab.currentApiProvider === "anthropic"
                              ? "bg-amber-600 text-white"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                          aria-pressed={tab.currentApiProvider === "anthropic"}
                        >
                          Claude
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            patchTab(tab.id, { currentApiProvider: "deepseek" });
                            setLastSelectedApiProvider("deepseek");
                          }}
                          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            tab.currentApiProvider === "deepseek"
                              ? "bg-purple-600 text-white"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                          aria-pressed={tab.currentApiProvider === "deepseek"}
                        >
                          Deepseek
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <ResumeForm
                  onSubmit={(
                    jd,
                    resumeContent,
                    template,
                    profileData,
                    jobRole,
                    companyName
                  ) =>
                    handleSubmit(
                      tab.id,
                      jd,
                      resumeContent,
                      template,
                      profileData,
                      tab.currentApiProvider,
                      jobRole,
                      companyName
                    )
                  }
                  loading={tab.loading}
                />
              </div>

              <div className="bg-white rounded-xl shadow-xl p-6 lg:p-8 border border-gray-100">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    Your Resume
                  </h2>
                  <p className="text-gray-600">
                    Download your optimized resume once it&apos;s generated
                  </p>
                </div>

                {tab.error && (
                  <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-red-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-red-800 font-medium">{tab.error}</p>
                    </div>
                  </div>
                )}

                {tab.loading && (
                  <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 border-t-indigo-600 mb-4"></div>
                    <p className="text-gray-600 font-medium">
                      Generating your optimized resume...
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      This may take a few moments
                    </p>
                  </div>
                )}

                {tab.result && !tab.loading && (
                  <ResultDisplay
                    result={tab.result}
                    pdfBase64={tab.pdfBase64}
                    pdfError={tab.pdfError}
                    apiProvider={tab.currentApiProvider}
                    jobRole={tab.currentJobRole}
                    companyName={tab.currentCompanyName}
                    providerUsed={tab.lastProviderUsed}
                    modelUsed={tab.lastModelUsed}
                    questionsText={tab.questionsText}
                    setQuestionsText={(value) =>
                      patchTab(tab.id, { questionsText: value })
                    }
                    lastJd={tab.lastJd}
                  />
                )}

                {!tab.result && !tab.loading && !tab.error && (
                  <div className="flex flex-col w-full max-w-2xl space-y-6">
                    <div className="flex flex-col items-center justify-center min-h-[280px] text-center">
                      <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                        <svg
                          className="w-12 h-12 text-indigo-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-800 mb-2">
                        Ready to Generate
                      </h3>
                      <p className="text-gray-600 max-w-sm">
                        Fill out the form on the left and click &quot;Generate Resume&quot;
                        to create your optimized resume
                      </p>
                    </div>
                    <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-lg w-full">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        Questions from job
                      </h3>
                      <p className="text-sm text-gray-500 mb-3">
                        Enter interview questions (one per line). Generate a resume
                        first, then click &quot;Get answers&quot; to see answers based on
                        your resume.
                      </p>
                      <textarea
                        value={tab.questionsText}
                        onChange={(e) =>
                          patchTab(tab.id, { questionsText: e.target.value })
                        }
                        placeholder={
                          "e.g. Tell me about a time you led a project.\nWhat are your strengths?\nWhy do you want to join us?"
                        }
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y min-h-[120px]"
                        rows={5}
                      />
                      <button
                        type="button"
                        disabled
                        className="mt-3 w-full px-4 py-3 bg-gray-300 text-gray-500 rounded-lg font-medium cursor-not-allowed"
                      >
                        Get answers (generate resume first)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
