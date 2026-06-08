"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { UpdatedResume, ResumeExperience } from "@/app/page";
import {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATES,
  resolveResumeTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-templates";

const COMPANY_COUNT = 5;

const emptyCompanies = (): (ResumeExperience | null)[] =>
  Array.from({ length: COMPANY_COUNT }, () => null);

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultResume, setDefaultResume] = useState<UpdatedResume>({
    name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    summary: "",
    education: [],
    skills: {},
    certifications: [],
    projects: [],
  });
  const [companies, setCompanies] =
    useState<(ResumeExperience | null)[]>(emptyCompanies);
  const [downloadPath, setDownloadPath] = useState<string>("");
  const [resumeTemplate, setResumeTemplate] =
    useState<ResumeTemplateId>(DEFAULT_RESUME_TEMPLATE);

  useEffect(() => {
    if (!authLoading && user) {
      loadPreferences();
    }
  }, [authLoading, user]);

  const loadPreferences = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/preferences", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const { preferences } = await response.json();
        if (preferences.default_resume) {
          setDefaultResume(preferences.default_resume);
        }
        setCompanies([
          preferences.company_1 || null,
          preferences.company_2 || null,
          preferences.company_3 || null,
          preferences.company_4 || null,
          preferences.company_5 || null,
        ]);
        const savedResume = preferences.default_resume as Record<string, unknown> | undefined;
        setDownloadPath((savedResume?.download_path as string) || "");
        setResumeTemplate(
          resolveResumeTemplate(savedResume?.resume_template as string | undefined)
        );
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          default_resume: {
            ...defaultResume,
            download_path: downloadPath,
            resume_template: resumeTemplate,
          },
          company_1: companies[0],
          company_2: companies[1],
          company_3: companies[2],
          company_4: companies[3],
          company_5: companies[4],
        }),
      });

      if (response.ok) {
        alert("Profile saved successfully!");
        router.push("/");
      } else {
        alert("Failed to save preferences");
      }
    } catch (error) {
      console.error("Error saving preferences:", error);
      alert("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const addEducation = () => {
    setDefaultResume({
      ...defaultResume,
      education: [
        ...(defaultResume.education || []),
        { degree: "", school: "", graduationDate: "", gpa: "" },
      ],
    });
  };

  const updateEducation = (index: number, field: string, value: string) => {
    const updated = [...(defaultResume.education || [])];
    updated[index] = { ...updated[index], [field]: value };
    setDefaultResume({ ...defaultResume, education: updated });
  };

  const removeEducation = (index: number) => {
    const updated = [...(defaultResume.education || [])];
    updated.splice(index, 1);
    setDefaultResume({ ...defaultResume, education: updated });
  };

  const addCertification = () => {
    setDefaultResume({
      ...defaultResume,
      certifications: [...(defaultResume.certifications || []), ""],
    });
  };

  const updateCertification = (index: number, value: string) => {
    const updated = [...(defaultResume.certifications || [])];
    updated[index] = value;
    setDefaultResume({ ...defaultResume, certifications: updated });
  };

  const removeCertification = (index: number) => {
    const updated = [...(defaultResume.certifications || [])];
    updated.splice(index, 1);
    setDefaultResume({ ...defaultResume, certifications: updated });
  };

  const addProject = () => {
    setDefaultResume({
      ...defaultResume,
      projects: [
        ...(defaultResume.projects || []),
        { name: "", description: "", technologies: [] },
      ],
    });
  };

  const updateProject = (
    index: number,
    field: string,
    value: string | string[]
  ) => {
    const updated = [...(defaultResume.projects || [])];
    updated[index] = { ...updated[index], [field]: value };
    setDefaultResume({ ...defaultResume, projects: updated });
  };

  const removeProject = (index: number) => {
    const updated = [...(defaultResume.projects || [])];
    updated.splice(index, 1);
    setDefaultResume({ ...defaultResume, projects: updated });
  };

  const updateCompany = (
    index: number,
    field: string,
    value: string | string[]
  ) => {
    const updated = [...companies];
    updated[index] = {
      ...(updated[index] || {
        title: "",
        company: "",
        startDate: "",
        endDate: "",
        description: "",
        achievements: [],
      }),
      [field]: value,
    };
    setCompanies(updated);
  };

  const clearCompany = (index: number) => {
    const updated = [...companies];
    updated[index] = null;
    setCompanies(updated);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    router.push("/");
    return null;
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="glass-panel overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5">
            <h2 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Profile Settings</h2>
            <button
              onClick={() => router.push("/")}
              className="btn-soft"
            >
              Back to Home
            </button>
          </div>

          <div className="p-6 space-y-6">
            {loading ? (
                <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <>
                {/* Resume output */}
                <section className="border-b pb-6">
                  <h3 className="text-xl font-semibold mb-4 text-gray-700">Resume Output</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">PDF Template</label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {RESUME_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => setResumeTemplate(tpl.id)}
                            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                              resumeTemplate === tpl.id
                                ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span className="block text-sm font-semibold text-slate-900">{tpl.label}</span>
                            <span className="mt-1 block text-xs text-slate-500">{tpl.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Download Path</label>
                      <input
                        type="text"
                        value={downloadPath}
                        onChange={(e) => setDownloadPath(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="e.g. C:\Users\you\Documents\Resumes (empty = Downloads/resume)"
                      />
                      <p className="mt-1 text-xs text-gray-500">Absolute path where PDFs are saved. Leave empty to use your OS Downloads/resume folder.</p>
                    </div>
                  </div>
                </section>

                {/* Default Resume Info */}
                <section className="border-b pb-6">
                  <h3 className="text-xl font-semibold mb-4 text-gray-700">
                    Default Resume Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={defaultResume.name || ""}
                        onChange={(e) =>
                          setDefaultResume({ ...defaultResume, name: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={defaultResume.email || ""}
                        onChange={(e) =>
                          setDefaultResume({ ...defaultResume, email: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="text"
                        value={defaultResume.phone || ""}
                        onChange={(e) =>
                          setDefaultResume({ ...defaultResume, phone: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <input
                        type="text"
                        value={defaultResume.location || ""}
                        onChange={(e) =>
                          setDefaultResume({
                            ...defaultResume,
                            location: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        LinkedIn
                      </label>
                      <input
                        type="url"
                        value={defaultResume.linkedin || ""}
                        onChange={(e) =>
                          setDefaultResume({
                            ...defaultResume,
                            linkedin: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Summary
                      </label>
                      <textarea
                        value={defaultResume.summary || ""}
                        onChange={(e) =>
                          setDefaultResume({
                            ...defaultResume,
                            summary: e.target.value,
                          })
                        }
                        rows={4}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                </section>

                {/* Education */}
                <section className="border-b pb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-700">Education</h3>
                    <button
                      onClick={addEducation}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-sm"
                    >
                      + Add
                    </button>
                  </div>
                  {(defaultResume.education || []).map((edu, idx) => (
                    <div key={idx} className="mb-4 p-4 border rounded-lg">
                      <div className="grid grid-cols-2 gap-4 mb-2">
                        <input
                          placeholder="Degree"
                          value={edu.degree || ""}
                          onChange={(e) =>
                            updateEducation(idx, "degree", e.target.value)
                          }
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="School"
                          value={edu.school || ""}
                          onChange={(e) =>
                            updateEducation(idx, "school", e.target.value)
                          }
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="Graduation Date (MM/YYYY)"
                          value={edu.graduationDate || ""}
                          onChange={(e) =>
                            updateEducation(idx, "graduationDate", e.target.value)
                          }
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="GPA (optional)"
                          value={edu.gpa || ""}
                          onChange={(e) =>
                            updateEducation(idx, "gpa", e.target.value)
                          }
                          className="px-3 py-2 border rounded"
                        />
                      </div>
                      <button
                        onClick={() => removeEducation(idx)}
                        className="text-red-600 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </section>

                {/* Certifications */}
                <section className="border-b pb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-700">
                      Certifications
                    </h3>
                    <button
                      onClick={addCertification}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-sm"
                    >
                      + Add
                    </button>
                  </div>
                  {(defaultResume.certifications || []).map((cert, idx) => (
                    <div key={idx} className="mb-2 flex gap-2">
                      <input
                        placeholder="Certification name"
                        value={cert}
                        onChange={(e) =>
                          updateCertification(idx, e.target.value)
                        }
                        className="flex-1 px-3 py-2 border rounded"
                      />
                      <button
                        onClick={() => removeCertification(idx)}
                        className="text-red-600 px-3"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </section>

                {/* Projects */}
                <section className="border-b pb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-700">Projects</h3>
                    <button
                      onClick={addProject}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-sm"
                    >
                      + Add
                    </button>
                  </div>
                  {(defaultResume.projects || []).map((project, idx) => (
                    <div key={idx} className="mb-4 p-4 border rounded-lg">
                      <input
                        placeholder="Project Name"
                        value={project.name || ""}
                        onChange={(e) =>
                          updateProject(idx, "name", e.target.value)
                        }
                        className="w-full mb-2 px-3 py-2 border rounded"
                      />
                      <textarea
                        placeholder="Description"
                        value={project.description || ""}
                        onChange={(e) =>
                          updateProject(idx, "description", e.target.value)
                        }
                        rows={2}
                        className="w-full mb-2 px-3 py-2 border rounded"
                      />
                      <input
                        placeholder="Technologies (comma-separated)"
                        value={(project.technologies || []).join(", ")}
                        onChange={(e) =>
                          updateProject(
                            idx,
                            "technologies",
                            e.target.value.split(",").map((t) => t.trim())
                          )
                        }
                        className="w-full mb-2 px-3 py-2 border rounded"
                      />
                      <button
                        onClick={() => removeProject(idx)}
                        className="text-red-600 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </section>

                {/* Company Details */}
                {Array.from({ length: COMPANY_COUNT }, (_, index) => {
                  const num = index + 1;
                  const company = companies[index];
                  return (
                    <section key={num} className="border-b pb-6">
                      <h3 className="text-xl font-semibold mb-4 text-gray-700">
                        Company {num} Details
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <input
                          placeholder="Job Title"
                          value={company?.title || ""}
                          onChange={(e) => updateCompany(index, "title", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="Company Name"
                          value={company?.company || ""}
                          onChange={(e) => updateCompany(index, "company", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="Start Date (MM/YYYY)"
                          value={company?.startDate || ""}
                          onChange={(e) => updateCompany(index, "startDate", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="End Date (MM/YYYY or Present)"
                          value={company?.endDate || ""}
                          onChange={(e) => updateCompany(index, "endDate", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Description
                        </label>
                        <textarea
                          value={company?.description || ""}
                          onChange={(e) => updateCompany(index, "description", e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="Enter a brief description about the company and your role"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Achievements (one per line)
                        </label>
                        <textarea
                          value={(company?.achievements || []).join("\n")}
                          onChange={(e) =>
                            updateCompany(
                              index,
                              "achievements",
                              e.target.value.split("\n").filter((l) => l.trim())
                            )
                          }
                          rows={6}
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="Enter achievements, one per line"
                        />
                      </div>
                      <button
                        onClick={() => clearCompany(index)}
                        className="mt-2 text-red-600 text-sm"
                      >
                        Clear Company {num}
                      </button>
                    </section>
                  );
                })}
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200/80 px-6 py-4">
            <button
              onClick={() => router.push("/")}
              className="btn-soft"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-4 py-2.5"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
