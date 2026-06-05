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
          preferences.company_3
        ) {
          const defaultResume: UpdatedResume = preferences.default_resume || {};
          const companies: (ResumeExperience | null)[] = [
            preferences.company_1,
            preferences.company_2,
            preferences.company_3,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="jobRole"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Job Role
          </label>
          <input
            id="jobRole"
            type="text"
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value)}
            placeholder="e.g. Senior Engineer"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="companyName"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Company Name
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Freshworks"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="jd"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Job Description (JD)
        </label>
        <textarea
          id="jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the job description here..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={10}
          required
        />
      </div>

      <div>
        <label
          htmlFor="resumeContent"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Resume Content{" "}
          {loadingPrefs && (
            <span className="text-xs text-gray-500">
              (Loading saved preferences...)
            </span>
          )}
        </label>
        <textarea
          id="resumeContent"
          value={resumeContent}
          onChange={(e) => setResumeContent(e.target.value)}
          placeholder="Paste your existing resume content here... (or it will be loaded from your saved preferences)"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={10}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading || !jd.trim() || !resumeContent.trim()}
        className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Generating..." : "Generate Resume"}
      </button>
    </form>
  );
}
