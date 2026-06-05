"use client";

import React from "react";
import { AnalysisResult } from "@/app/page";

export interface QuestionAnswer {
  question: string;
  answer: string;
}

interface ResultDisplayProps {
  result: AnalysisResult;
  pdfBase64?: string;
  pdfError?: string;
  apiProvider?: "anthropic" | "openai" | "deepseek";
  providerUsed?: "anthropic" | "openai" | "deepseek";
  modelUsed?: string;
  jobRole?: string;
  companyName?: string;
  questionsText: string;
  setQuestionsText: (value: string) => void;
  lastJd?: string;
}

type ToastType = "success" | "error" | "warning";

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

export default function ResultDisplay({
  result,
  pdfBase64,
  pdfError,
  apiProvider = "openai",
  providerUsed,
  modelUsed,
  jobRole = "",
  companyName = "",
  questionsText,
  setQuestionsText,
  lastJd = "",
}: ResultDisplayProps) {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [answersLoading, setAnswersLoading] = React.useState(false);
  const [answers, setAnswers] = React.useState<QuestionAnswer[]>([]);
  const [answersError, setAnswersError] = React.useState<string | null>(null);
  const [coverLetter, setCoverLetter] = React.useState<string>("");
  const [coverLetterLoading, setCoverLetterLoading] = React.useState(false);
  const [coverLetterError, setCoverLetterError] = React.useState<string | null>(null);
  const [coverLetterDownloading, setCoverLetterDownloading] = React.useState(false);
  const [coverLetterCopied, setCoverLetterCopied] = React.useState(false);
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const showToast = React.useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3500);
  }, []);

  const handleDownloadPDF = React.useCallback(async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (!pdfBase64) {
      showToast("warning", "PDF is not available. Please generate the resume again.");
      return;
    }

    if (isDownloading) {
      return; // Prevent multiple simultaneous downloads
    }

    setIsDownloading(true);

    try {
      // Validate base64 string
      if (!pdfBase64 || pdfBase64.trim().length === 0) {
        throw new Error("PDF data is empty");
      }

      // Remove data URL prefix if present
      let base64Data = pdfBase64;
      if (base64Data.includes(",")) {
        base64Data = base64Data.split(",")[1];
      }

      // Validate base64 decodes properly (without triggering browser download)
      try {
        const byteCharacters = atob(base64Data);
        if (byteCharacters.length === 0) {
          throw new Error("PDF data is empty after decoding");
        }
      } catch (decodeError) {
        console.error("Base64 decode error:", decodeError);
        throw new Error("Invalid PDF data format");
      }

      const fileName = `${(result.name || "resume").replace(/[^a-z0-9]/gi, "_")}.pdf`;

      // Save PDF to resume/[jobRole]_[companyName]/ on server only
      if (jobRole?.trim() && companyName?.trim()) {
        try {
          const saveRes = await fetch("/api/save-resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pdfBase64,
              jobRole: jobRole.trim(),
              companyName: companyName.trim(),
              fileName,
              jobDescription: lastJd,
            }),
          });
          if (!saveRes.ok) {
            const errData = await saveRes.json().catch(() => ({}));
            throw new Error(errData.error || saveRes.statusText);
          }
          const saveData = await saveRes.json().catch(() => ({}));
          showToast("success", `PDF saved to: ${saveData.path || "resume folder"}`);
        } catch (saveErr) {
          throw new Error(
            saveErr instanceof Error ? saveErr.message : "Could not save PDF to folder"
          );
        }
      } else {
        throw new Error("Job role and company name are required to save PDF to the resume folder");
      }

      setIsDownloading(false);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      setIsDownloading(false);
      showToast(
        "error",
        `Failed to save PDF: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }, [pdfBase64, result.name, jobRole, companyName, lastJd, isDownloading, showToast]);

  const handleGetAnswers = React.useCallback(async () => {
    const questions = questionsText
      .split(/\n/)
      .map((q) => q.trim())
      .filter(Boolean);
    if (questions.length === 0) {
      showToast("warning", "Please enter at least one question (one per line).");
      return;
    }
    setAnswersLoading(true);
    setAnswersError(null);
    setAnswers([]);
    try {
      const res = await fetch("/api/answer-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, resume: result, apiProvider }),
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
  }, [questionsText, result, apiProvider, showToast]);

  const handleDownloadCoverLetter = React.useCallback(async () => {
    setCoverLetterDownloading(true);
    try {
      const res = await fetch("/api/save-cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coverLetter,
          jobRole: jobRole?.trim() || "job",
          companyName: companyName?.trim() || "company",
          candidateName: result.name || "resume",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || res.statusText);
      }
      showToast("success", `Cover letter saved to: ${data.path || "resume folder"}`);
    } catch (err) {
      console.error("Cover letter download error:", err);
      showToast(
        "error",
        `Failed to save cover letter: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setCoverLetterDownloading(false);
    }
  }, [coverLetter, jobRole, companyName, result, showToast]);

  const handleCopyCoverLetter = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCoverLetterCopied(true);
      setTimeout(() => setCoverLetterCopied(false), 2000);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  }, [coverLetter]);

  const handleCoverLetter = React.useCallback(async () => {
    setCoverLetterLoading(true);
    setCoverLetterError(null);
    setCoverLetter("");
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: result, jd: lastJd, apiProvider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setCoverLetter(data.coverLetter || "");
    } catch (err) {
      setCoverLetterError(err instanceof Error ? err.message : "Failed to generate cover letter");
    } finally {
      setCoverLetterLoading(false);
    }
  }, [result, lastJd, apiProvider]);

  if (!result) {
    return null;
  }

  return (
    <div className="flex flex-col w-full max-w-2xl space-y-6">
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]">
          {toasts.map((toast) => {
            const styleByType: Record<ToastType, string> = {
              success: "bg-emerald-600 border-emerald-700",
              error: "bg-red-600 border-red-700",
              warning: "bg-amber-500 border-amber-600",
            };

            return (
              <div
                key={toast.id}
                className={`${styleByType[toast.type]} text-white border rounded-lg shadow-lg px-4 py-3 transition-all duration-200`}
              >
                <p className="text-sm font-medium leading-snug">{toast.message}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-8 rounded-xl border-2 border-green-200 shadow-lg w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            Resume Generated Successfully!
          </h3>
          <p className="text-gray-600">
            {pdfBase64
              ? "Your optimized resume is ready to download"
              : pdfError
              ? "Resume generated, but PDF creation failed"
              : "Generating PDF..."}
          </p>
        </div>

        {pdfError && (
          <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>PDF Error:</strong> {pdfError}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              The resume data was generated successfully. PDF is built locally
              with Puppeteer—check the server logs for details.
            </p>
          </div>
        )}

        {(providerUsed || modelUsed) && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>AI Used:</strong> {(providerUsed || apiProvider || "unknown").toUpperCase()}
              {modelUsed ? ` | ${modelUsed}` : ""}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={!pdfBase64 || isDownloading}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 text-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg transform hover:scale-105"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {isDownloading
              ? "Saving..."
              : pdfBase64
              ? "Save PDF Resume"
              : pdfError
              ? "PDF Not Available"
              : "Generating PDF..."}
          </button>
          <button
            type="button"
            onClick={handleCoverLetter}
            disabled={coverLetterLoading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {coverLetterLoading ? "Generating…" : "Cover letter"}
          </button>
        </div>

        {coverLetterError && (
          <p className="mt-2 text-sm text-red-600">{coverLetterError}</p>
        )}
        {coverLetter && (
          <>
            <div className="mt-4 p-4 bg-white/80 rounded-lg border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-2">Cover letter</p>
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{coverLetter}</p>
            </div>
            <div className="flex gap-3 mt-3">
              <button
                type="button"
                disabled={coverLetterDownloading}
                onClick={handleDownloadCoverLetter}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                {coverLetterDownloading ? "Saving…" : "Save Cover Letter PDF"}
              </button>
              <button
                type="button"
                onClick={handleCopyCoverLetter}
                className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                {coverLetterCopied ? "Copied!" : "Copy Cover Letter"}
              </button>
            </div>
          </>
        )}

        {(result.name || result.summary) && (
          <div className="text-center text-sm text-gray-500 mt-4 space-y-1">
            {result.name && (
              <p>Generated for: <span className="font-semibold">{result.name}</span></p>
            )}
            {result.summary && (
              <p className="text-gray-600 max-w-md mx-auto line-clamp-2" title={result.summary}>
                {result.summary.slice(0, 120)}{result.summary.length > 120 ? "…" : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Questions from job — one per line */}
      <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-lg w-full">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          Questions from job
        </h3>
        <p className="text-sm text-gray-500 mb-3">
          Enter interview questions (one per line). Answers are generated from your built resume.
        </p>
        <textarea
          value={questionsText}
          onChange={(e) => setQuestionsText(e.target.value)}
          placeholder={"e.g. Tell me about a time you led a project.\nWhat are your strengths?\nWhy do you want to join us?"}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y min-h-[120px]"
          rows={5}
        />
        <button
          type="button"
          onClick={handleGetAnswers}
          disabled={answersLoading || !questionsText.trim()}
          className="mt-3 w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {answersLoading ? "Generating answers…" : "Get answers"}
        </button>
        {answersError && (
          <p className="mt-2 text-sm text-red-600">{answersError}</p>
        )}
      </div>

      {/* Q&A list */}
      {answers.length > 0 && (
        <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-lg w-full">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Answers (from your resume)
          </h3>
          <div className="space-y-4">
            {answers.map((qa, i) => (
              <div key={i} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <p className="text-sm font-semibold text-indigo-700 mb-1">
                  Q: {qa.question}
                </p>
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {qa.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
