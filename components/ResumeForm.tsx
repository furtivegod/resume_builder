"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { loadProfileForApp } from "@/lib/supabase/load-profile-for-app";
import { ToastContainer, useToast } from "@/components/Toast";
import {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATES,
  resolveResumeTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-templates";
import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";

interface ResumeFormProps {
  jobLink: string;
  jobRole: string;
  companyName: string;
  jd: string;
  userEmail?: string | null;
  userId?: string;
  onJobLinkChange: (value: string) => void;
  onJobRoleChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onJdChange: (value: string) => void;
  onSubmit: (
    jd: string,
    resumeContent: string,
    template?: string,
    profileData?: LegacyAnalyzeProfile,
    jobRole?: string,
    companyName?: string
  ) => void;
  loading: boolean;
}

export default function ResumeForm({
  jobLink,
  jobRole,
  companyName,
  jd,
  userEmail,
  userId,
  onJobLinkChange,
  onJobRoleChange,
  onCompanyNameChange,
  onJdChange,
  onSubmit,
  loading,
}: ResumeFormProps) {
  const [resumeContent, setResumeContent] = useState("");
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [profileData, setProfileData] = useState<LegacyAnalyzeProfile | null>(null);
  const [resumeTemplate, setResumeTemplate] =
    useState<ResumeTemplateId>(DEFAULT_RESUME_TEMPLATE);
  const { toasts, showToast, dismissToast } = useToast();
  const profileNotificationShown = useRef(false);

  useEffect(() => {
    profileNotificationShown.current = false;
    loadProfile();
  }, [userEmail, userId]);

  useEffect(() => {
    if (loadingPrefs || profileNotificationShown.current) return;
    profileNotificationShown.current = true;

    if (resumeContent.trim()) {
      const templateLabel =
        RESUME_TEMPLATES.find((t) => t.id === resumeTemplate)?.label ?? "Standard";
      showToast("success", `Profile loaded ✓ · ${templateLabel} template`);
    } else {
      showToast("warning", "No profile resume — go to Profile first.");
    }
  }, [loadingPrefs, resumeContent, resumeTemplate, showToast]);

  const loadProfile = async () => {
    setLoadingPrefs(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoadingPrefs(false);
        return;
      }

      const loaded = await loadProfileForApp(supabase, {
        email: userEmail ?? session.user.email,
        userId: userId ?? session.user.id,
      });
      setProfileData(loaded.legacyAnalyzeProfile);
      setResumeTemplate(
        resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
      );
      setResumeContent(loaded.resumeText);
    } catch (error) {
      console.warn("Error loading profile:", error);
    } finally {
      setLoadingPrefs(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jd.trim() && resumeContent.trim() && profileData) {
      onSubmit(
        jd,
        resumeContent,
        resumeTemplate,
        profileData,
        jobRole.trim() || undefined,
        companyName.trim() || undefined
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex-shrink-0">
        <label htmlFor="jobLink" className="mb-1 block text-xs font-medium text-slate-600">Job Link</label>
        <input
          id="jobLink"
          type="text"
          value={jobLink}
          onChange={(e) => onJobLinkChange(e.target.value)}
          placeholder="https://www.linkedin.com/jobs/view/..."
          className="input-shell"
        />
      </div>

      <div className="grid flex-shrink-0 grid-cols-2 gap-3">
        <div>
          <label htmlFor="jobRole" className="mb-1 block text-xs font-medium text-slate-600">Job Title</label>
          <input id="jobRole" type="text" value={jobRole} onChange={(e) => onJobRoleChange(e.target.value)} placeholder="e.g. Senior Engineer" className="input-shell" />
        </div>
        <div>
          <label htmlFor="companyName" className="mb-1 block text-xs font-medium text-slate-600">Company</label>
          <input id="companyName" type="text" value={companyName} onChange={(e) => onCompanyNameChange(e.target.value)} placeholder="e.g. Acme Corp" className="input-shell" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <label htmlFor="jd" className="mb-1 block flex-shrink-0 text-xs font-medium text-slate-600">Job Description</label>
        <textarea
          id="jd"
          value={jd}
          onChange={(e) => onJdChange(e.target.value)}
          placeholder="Paste the full job description here…"
          className="input-shell flex-1 resize-none"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading || loadingPrefs || !jd.trim() || !resumeContent.trim()}
        className="btn-primary w-full flex-shrink-0"
      >
        {loading ? "Generating…" : "Generate Resume"}
      </button>
    </form>
  );
}
