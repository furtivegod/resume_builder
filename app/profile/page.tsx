"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { UpdatedResume, ResumeExperience } from "@/app/page";

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
  const [company1, setCompany1] = useState<ResumeExperience | null>(null);
  const [company2, setCompany2] = useState<ResumeExperience | null>(null);
  const [company3, setCompany3] = useState<ResumeExperience | null>(null);

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
        setCompany1(preferences.company_1 || null);
        setCompany2(preferences.company_2 || null);
        setCompany3(preferences.company_3 || null);
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
          default_resume: defaultResume,
          company_1: company1,
          company_2: company2,
          company_3: company3,
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
    num: 1 | 2 | 3,
    field: string,
    value: string | string[]
  ) => {
    const setter = num === 1 ? setCompany1 : num === 2 ? setCompany2 : setCompany3;
    const company = num === 1 ? company1 : num === 2 ? company2 : company3;
    setter({
      ...(company || {
        title: "",
        company: "",
        startDate: "",
        endDate: "",
        description: "",
        achievements: [],
      }),
      [field]: value,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    router.push("/");
    return null;
  }

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl">
          <div className="border-b px-6 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Profile Settings</h2>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              Back to Home
            </button>
          </div>

          <div className="p-6 space-y-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <>
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
                {[1, 2, 3].map((num) => {
                  const company = num === 1 ? company1 : num === 2 ? company2 : company3;
                  const setCompany =
                    num === 1 ? setCompany1 : num === 2 ? setCompany2 : setCompany3;
                  return (
                    <section key={num} className="border-b pb-6">
                      <h3 className="text-xl font-semibold mb-4 text-gray-700">
                        Company {num} Details
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <input
                          placeholder="Job Title"
                          value={company?.title || ""}
                          onChange={(e) => updateCompany(num as 1 | 2 | 3, "title", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="Company Name"
                          value={company?.company || ""}
                          onChange={(e) => updateCompany(num as 1 | 2 | 3, "company", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="Start Date (MM/YYYY)"
                          value={company?.startDate || ""}
                          onChange={(e) => updateCompany(num as 1 | 2 | 3, "startDate", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                        <input
                          placeholder="End Date (MM/YYYY or Present)"
                          value={company?.endDate || ""}
                          onChange={(e) => updateCompany(num as 1 | 2 | 3, "endDate", e.target.value)}
                          className="px-3 py-2 border rounded"
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Description
                        </label>
                        <textarea
                          value={company?.description || ""}
                          onChange={(e) => updateCompany(num as 1 | 2 | 3, "description", e.target.value)}
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
                              num as 1 | 2 | 3,
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
                        onClick={() => setCompany(null)}
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

          <div className="border-t px-6 py-4 flex justify-end gap-3">
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
