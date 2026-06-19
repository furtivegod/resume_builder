"use client";

import React from "react";
import type { AnalysisResult } from "@/lib/types/resume";
import { ToastContainer, useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { uploadCoverLetterJson } from "@/lib/supabase/storage";
import { createResumeWithArtifacts } from "@/lib/supabase/services/resumes";
import { DEFAULT_JOBSITE, type JobsiteId } from "@/lib/jobsites";
import { formatSupabaseConnectionError, isSupabaseNetworkError } from "@/lib/supabase/network";

export interface QuestionAnswer {
  question: string;
  answer: string;
}

interface ResultDisplayProps {
  result: AnalysisResult;
  pdfBase64?: string;
  pdfError?: string;
  sessionApiProvider: "anthropic" | "openai" | "deepseek";
  providerUsed?: "anthropic" | "openai" | "deepseek";
  modelUsed?: string;
  jobRole?: string;
  companyName?: string;
  jobLink?: string;
  jobsite?: JobsiteId;
  resumeId?: string;
  userId?: string;
  onResumeSaved?: (resumeId: string) => void;
  questionsText: string;
  setQuestionsText: (value: string) => void;
  coverLetter: string;
  setCoverLetter: (value: string) => void;
  answers: QuestionAnswer[];
  setAnswers: (value: QuestionAnswer[]) => void;
  lastJd?: string;
}

function downloadPdfFromBase64(
  pdfBase64: string,
  fileName: string
): void {
  const link = document.createElement("a");
  link.href = `data:application/pdf;base64,${pdfBase64}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function ResultDisplay({
  result,
  pdfBase64,
  pdfError,
  sessionApiProvider,
  providerUsed,
  modelUsed,
  jobRole = "",
  companyName = "",
  jobLink = "",
  jobsite = DEFAULT_JOBSITE,
  resumeId,
  userId,
  onResumeSaved,
  questionsText,
  setQuestionsText,
  coverLetter,
  setCoverLetter,
  answers,
  setAnswers,
  lastJd = "",
}: ResultDisplayProps) {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [savedResumeId, setSavedResumeId] = React.useState<string | undefined>(resumeId);
  const [answersLoading, setAnswersLoading] = React.useState(false);
  const [answersError, setAnswersError] = React.useState<string | null>(null);
  const [coverLetterLoading, setCoverLetterLoading] = React.useState(false);
  const [coverLetterSaving, setCoverLetterSaving] = React.useState(false);
  const [coverLetterCopied, setCoverLetterCopied] = React.useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  React.useEffect(() => {
    setSavedResumeId(resumeId);
  }, [resumeId]);

  const effectiveResumeId = savedResumeId ?? resumeId;

  const handleDownloadPDF = React.useCallback(async () => {
    if (!pdfBase64 || isDownloading || !userId) return;

    setIsDownloading(true);
    const safeName = (result.name || "resume").replace(/[^a-z0-9]/gi, "_");
    const role = jobRole?.trim() || "job";
    const company = companyName?.trim() || "company";
    const fileName = `${safeName}_${role}_${company}.pdf`.replace(/_+/g, "_");

    try {
      let newlySaved = false;

      if (!effectiveResumeId) {
        const record = await createResumeWithArtifacts({
          userId,
          jd: lastJd,
          resume: result,
          aiType: providerUsed ?? sessionApiProvider,
          model: modelUsed ?? null,
          jobSite: jobsite,
          jobLink: jobLink.trim() || null,
          jobTitle: jobRole.trim() || null,
          jobCompany: companyName.trim() || null,
        });
        setSavedResumeId(record.id);
        onResumeSaved?.(record.id);
        newlySaved = true;
      }

      downloadPdfFromBase64(pdfBase64, fileName);
      showToast(
        "success",
        newlySaved ? "Saved to history & PDF downloaded" : "PDF downloaded"
      );
    } catch (error) {
      console.error("Failed to save resume history:", error);
      const message = isSupabaseNetworkError(error)
        ? formatSupabaseConnectionError(error)
        : error instanceof Error
          ? error.message
          : "Could not save to history";

      try {
        downloadPdfFromBase64(pdfBase64, fileName);
        showToast("warning", `${message} PDF downloaded locally only.`);
      } catch (downloadError) {
        showToast(
          "error",
          `Failed: ${downloadError instanceof Error ? downloadError.message : "Unknown error"}`
        );
      }
    } finally {
      setIsDownloading(false);
    }
  }, [
    pdfBase64,
    isDownloading,
    userId,
    result,
    jobRole,
    companyName,
    lastJd,
    effectiveResumeId,
    providerUsed,
    sessionApiProvider,
    modelUsed,
    jobsite,
    jobLink,
    onResumeSaved,
    showToast,
  ]);

  const handleCoverLetter = React.useCallback(async () => {
    setCoverLetterLoading(true);
    setCoverLetter("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ resume: result, jd: lastJd, apiProvider: sessionApiProvider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setCoverLetter(data.coverLetter || "");
      showToast("success", "Cover letter ready — copy or save to cloud.");
    } catch (err) {
      showToast("error", `Cover letter failed: ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setCoverLetterLoading(false);
    }
  }, [result, lastJd, sessionApiProvider, setCoverLetter, showToast]);

  const handleSaveCoverLetter = React.useCallback(async () => {
    if (!coverLetter || coverLetterSaving || !effectiveResumeId || !userId) {
      if (!effectiveResumeId) {
        showToast("warning", "Download the PDF first to save this bid to history.");
      }
      return;
    }
    setCoverLetterSaving(true);
    try {
      await uploadCoverLetterJson(userId, effectiveResumeId, {
        text: coverLetter,
        jobTitle: jobRole,
        jobCompany: companyName,
        generatedAt: new Date().toISOString(),
      });
      showToast("success", "Cover letter saved to cloud storage.");
    } catch (err) {
      showToast("error", `Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCoverLetterSaving(false);
    }
  }, [coverLetter, coverLetterSaving, effectiveResumeId, userId, jobRole, companyName, showToast]);

  const handleCopyCoverLetter = React.useCallback(async () => {
    if (!coverLetter) return;
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCoverLetterCopied(true);
      setTimeout(() => setCoverLetterCopied(false), 2000);
    } catch {
      showToast("error", "Copy failed");
    }
  }, [coverLetter, showToast]);

  const handleGetAnswers = React.useCallback(async () => {
    const questions = questionsText
      .split(/\n/)
      .map((q) => q.trim())
      .filter(Boolean);
    if (questions.length === 0) {
      showToast("warning", "Enter at least one question (one per line).");
      return;
    }
    setAnswersLoading(true);
    setAnswersError(null);
    setAnswers([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/answer-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ questions, resume: result, apiProvider: sessionApiProvider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setAnswers(data.answers || []);
    } catch (err) {
      setAnswersError(err instanceof Error ? err.message : "Failed to get answers");
    } finally {
      setAnswersLoading(false);
    }
  }, [questionsText, result, sessionApiProvider, setAnswers, showToast]);

  if (!result) return null;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <svg className="h-5 w-5 flex-shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">Resume generated</p>
          {(providerUsed || modelUsed) && (
            <p className="text-xs text-emerald-700">{(providerUsed || sessionApiProvider || "").toUpperCase()}{modelUsed ? ` · ${modelUsed}` : ""}</p>
          )}
          {effectiveResumeId && (
            <p className="text-xs text-emerald-600">Saved to cloud · <a href="/history" className="underline">View history</a></p>
          )}
        </div>
      </div>

      {pdfError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">PDF issue: {pdfError}</div>
      )}

      <button onClick={handleDownloadPDF} disabled={!pdfBase64 || isDownloading || !userId} className="btn-primary w-full gap-2">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {isDownloading
          ? "Saving…"
          : !pdfBase64
            ? pdfError
              ? "PDF unavailable"
              : "Generating PDF…"
            : effectiveResumeId
              ? "Download PDF"
              : "Save & Download PDF"}
      </button>

      <div className="flex gap-2">
        <button onClick={handleCoverLetter} disabled={coverLetterLoading} className="btn-soft flex-1">
          {coverLetterLoading ? "Generating…" : "Generate Cover Letter"}
        </button>
        {coverLetter.trim() && (
          <>
            <button onClick={handleCopyCoverLetter} className="btn-primary px-5">
              {coverLetterCopied ? "Copied!" : "Copy"}
            </button>
            <button onClick={handleSaveCoverLetter} disabled={coverLetterSaving || !effectiveResumeId} className="btn-primary gap-2 px-4">
              {coverLetterSaving ? "Saving…" : "Save JSON"}
            </button>
          </>
        )}
      </div>

      <section className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-800">Interview questions</h3>
        <p className="mt-1 text-xs text-slate-500">Enter questions from the job posting (one per line). Answers are generated from your resume.</p>
        <textarea
          value={questionsText}
          onChange={(e) => setQuestionsText(e.target.value)}
          placeholder={"e.g. Tell me about a time you led a project.\nWhat are your strengths?\nWhy do you want to join us?"}
          className="input-shell mt-3 min-h-[100px] resize-y"
          rows={4}
        />
        <button
          type="button"
          onClick={handleGetAnswers}
          disabled={answersLoading || !questionsText.trim()}
          className="btn-primary mt-3 w-full"
        >
          {answersLoading ? "Generating answers…" : "Get answers"}
        </button>
        {answersError && <p className="mt-2 text-sm text-red-600">{answersError}</p>}
      </section>

      {answers.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Answers</h3>
          <div className="space-y-4">
            {answers.map((qa, i) => (
              <div key={i} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <p className="mb-1 text-xs font-semibold text-blue-700">Q: {qa.question}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{qa.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
