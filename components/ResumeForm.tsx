"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { UpdatedResume, ResumeExperience } from "@/app/page";

interface ResumeFormProps {
  onSubmit: (
    jd: string,
    resumeContent: string,
    template?: string,
    profileData?: any,
    jobRole?: string,
    companyName?: string
  ) => void;
  loading: boolean;
}

export default function ResumeForm({
  onSubmit,
  loading,
}: ResumeFormProps) {
  const [jobRole, setJobRole] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jd, setJd] = useState("");
  const [resumeContent, setResumeContent] = useState("");
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoadingPrefs(false);
        return;
      }

      const response = await fetch("/api/preferences", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const { preferences } = await response.json();
        setProfileData(preferences); // Store profile data

        // Build resume content from stored preferences
        if (
          preferences.default_resume ||
          preferences.company_1 ||
          preferences.company_2 ||
          preferences.company_3 ||
          preferences.company_4 ||
          preferences.company_5
        ) {
          const defaultResume: UpdatedResume = preferences.default_resume || {};
          const companies: (ResumeExperience | null)[] = [
            preferences.company_1,
            preferences.company_2,
            preferences.company_3,
            preferences.company_4,
            preferences.company_5,
          ].filter(Boolean);

          // Build a text representation of the resume
          let content = "";

          if (defaultResume.name) content += `Name: ${defaultResume.name}\n`;
          if (defaultResume.email) content += `Email: ${defaultResume.email}\n`;
          if (defaultResume.phone) content += `Phone: ${defaultResume.phone}\n`;
          if (defaultResume.location)
            content += `Location: ${defaultResume.location}\n`;
          if (defaultResume.linkedin)
            content += `LinkedIn: ${defaultResume.linkedin}\n`;
          if (defaultResume.summary)
            content += `\nSummary:\n${defaultResume.summary}\n`;

          if (companies.length > 0) {
            content += `\nExperience:\n`;
            companies.forEach((company) => {
              if (company) {
                content += `\n${company.title} at ${company.company} (${company.startDate} - ${company.endDate})\n`;
                if (company.description) {
                  content += `Description: ${company.description}\n`;
                }
                if (company.achievements) {
                  company.achievements.forEach((ach) => {
                    content += `- ${ach}\n`;
                  });
                }
              }
            });
          }

          if (defaultResume.education && defaultResume.education.length > 0) {
            content += `\nEducation:\n`;
            defaultResume.education.forEach((edu) => {
              content += `${edu.degree} from ${edu.school} (${edu.graduationDate})`;
              if (edu.gpa) content += ` - GPA: ${edu.gpa}`;
              content += `\n`;
            });
          }

          if (defaultResume.skills) {
            content += `\nSkills:\n`;
            Object.entries(defaultResume.skills).forEach(
              ([category, skills]) => {
                if (Array.isArray(skills)) {
                  content += `${category}: ${skills.join(", ")}\n`;
                }
              }
            );
          }

          if (
            defaultResume.certifications &&
            defaultResume.certifications.length > 0
          ) {
            content += `\nCertifications:\n`;
            defaultResume.certifications.forEach((cert) => {
              content += `- ${cert}\n`;
            });
          }

          if (defaultResume.projects && defaultResume.projects.length > 0) {
            content += `\nProjects:\n`;
            defaultResume.projects.forEach((project) => {
              content += `${project.name}`;
              if (project.description) content += `: ${project.description}`;
              if (project.technologies) {
                content += ` (${project.technologies.join(", ")})`;
              }
              content += `\n`;
            });
          }

          setResumeContent(content.trim());
        }
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoadingPrefs(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jd.trim() && resumeContent.trim()) {
      onSubmit(
        jd,
        resumeContent,
        "standard",
        profileData,
        jobRole.trim() || undefined,
        companyName.trim() || undefined
      );
    }
  };

  const hasResume = !loadingPrefs && resumeContent.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-4">
      <div className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs ${
        loadingPrefs ? "bg-slate-100 text-slate-500" :
        hasResume ? "bg-emerald-50 text-emerald-700" :
        "bg-amber-50 text-amber-700"
      }`}>
        {loadingPrefs ? "Loading your profile…" : hasResume ? "Profile resume loaded ✓" : "No profile resume — go to Profile first."}
      </div>

      <div className="flex-shrink-0 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="jobRole" className="mb-1 block text-xs font-medium text-slate-600">Job Title</label>
          <input id="jobRole" type="text" value={jobRole} onChange={(e) => setJobRole(e.target.value)} placeholder="e.g. Senior Engineer" className="input-shell" />
        </div>
        <div>
          <label htmlFor="companyName" className="mb-1 block text-xs font-medium text-slate-600">Company</label>
          <input id="companyName" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Corp" className="input-shell" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <label htmlFor="jd" className="mb-1 flex-shrink-0 block text-xs font-medium text-slate-600">Job Description</label>
        <textarea
          id="jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the full job description here…"
          className="input-shell flex-1 resize-none"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading || !jd.trim() || !resumeContent.trim()}
        className="btn-primary flex-shrink-0 w-full"
      >
        {loading ? "Generating…" : "Generate Resume"}
      </button>
    </form>
  );
}
