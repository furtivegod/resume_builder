import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai-provider";
import type { AIMessage } from "@/lib/ai-provider";
import fs from "fs/promises";
import path from "path";
import Mustache from "mustache";
import { RESUME_ANALYZE_STATIC_PROMPT } from "@/lib/prompts/resume-analyze-static";
import {
  buildBulletGuidanceFromProfile,
  getBulletCountForTenure,
  getTenureYears,
} from "@/lib/resume-bullets";

// centralized provider used below

export async function POST(request: NextRequest) {
  // Declare resumeData outside try block so it's accessible in catch block
  let resumeData: any = undefined;

  try {
    const {
      account,
      jd,
      resumeContent,
      template: requestedTemplate,
      profileData,
      apiProvider = "openai", // Default to OpenAI if not specified
    } = await request.json();

    if (!jd || !resumeContent) {
      return NextResponse.json(
        { error: "Job description and resume content are required" },
        { status: 400 }
      );
    }

    // Check API key based on selected provider
    if (apiProvider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }
    if (apiProvider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key is not configured" },
        { status: 500 }
      );
    }
    if (apiProvider === "deepseek" && !process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: "Deepseek API key is not configured" },
        { status: 500 }
      );
    }

    const bulletGuidance = profileData
      ? buildBulletGuidanceFromProfile(profileData)
      : "";

    const userPrompt = `Job Description:
${jd}

Existing Resume Content (USE AS REFERENCE ONLY - DO NOT COPY VERBATIM):
${resumeContent}${bulletGuidance}`;

    // Handle API provider selection
    let jsonText: string;
    let analysisResult: any;
    let providerUsed: "openai" | "anthropic" | "deepseek" = apiProvider;
    let modelUsed = "";
    const selectedModel =
      apiProvider === "openai"
        ? process.env.OPENAI_MODEL
        : apiProvider === "deepseek"
        ? process.env.DEEPSEEK_MODEL
        : process.env.ANTHROPIC_MODEL;

    // Deepseek responses can be cut for long resumes; allow a larger completion budget.
    const generationMaxTokens = apiProvider === "deepseek" ? 8192 : 4096;

    const parseJsonSafely = (input: string) => {
      let cleanedJsonText = String(input || "").trim();
      if (cleanedJsonText.startsWith("```json")) {
        cleanedJsonText = cleanedJsonText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "");
      } else if (cleanedJsonText.startsWith("```")) {
        cleanedJsonText = cleanedJsonText.replace(/```\n?/g, "");
      }
      return JSON.parse(cleanedJsonText);
    };

    const sanitizeJobTitle = (rawTitle: unknown): string => {
      const original = String(rawTitle || "").trim().replace(/\s+/g, " ");
      if (!original) return "";

      let cleaned = original;
      // Remove noisy repeated separators often seen in scraped JDs (e.g., "|||", "///", "\\\\").
      cleaned = cleaned.replace(/\s*[|/\\]{2,}\s*/g, " ");
      // Remove trailing punctuation/separator noise.
      cleaned = cleaned.replace(/[|/\\,:;\-]+$/g, "");
      cleaned = cleaned.replace(/\s+/g, " ").trim();

      // Keep original if cleanup would erase too much.
      return cleaned || original;
    };

    // Use centralized callAI helper which normalizes providers and provides text/json/raw
    try {
      const messages: AIMessage[] = [
        { role: "system", content: RESUME_ANALYZE_STATIC_PROMPT },
        { role: "user", content: userPrompt },
      ];

      const aiResp = await callAI({
        provider: apiProvider as any,
        model: selectedModel,
        messages,
        temperature: 0.7,
        max_tokens: generationMaxTokens,
        tryParseJson: true,
      });

      providerUsed = aiResp.providerUsed;
      modelUsed = aiResp.modelUsed;
      console.log(`Analyze request used provider=${providerUsed}, model=${modelUsed}`);

      // prefer parsed json when available, otherwise use text
      if (aiResp.json) {
        jsonText = typeof aiResp.json === "string" ? aiResp.json : JSON.stringify(aiResp.json);
      } else {
        jsonText = aiResp.text || "";
      }
    } catch (err: any) {
      // Re-throw so outer catch handles it and responds accordingly
      throw err;
    }

    // Parse the JSON response (works for both APIs)
    try {
      analysisResult = parseJsonSafely(jsonText);
    } catch (parseError) {
      // Retry once by asking the same provider to repair malformed/truncated JSON.
      console.warn("Initial JSON parse failed. Attempting JSON repair pass.");
      try {
        const repairSystemPrompt =
          "You are a strict JSON repair assistant. Return ONLY valid JSON with no markdown. " +
          "Repair malformed/truncated JSON while preserving the original structure and intent.";
        const repairUserPrompt =
          `The following model output should be valid resume JSON but is malformed/truncated.\n` +
          `Fix it into valid JSON only.\n\n` +
          `Malformed output:\n${jsonText}`;

        const repairMessages: AIMessage[] = [
          { role: "system", content: repairSystemPrompt },
          { role: "user", content: repairUserPrompt },
        ];

        const repairedResp = await callAI({
          provider: apiProvider as any,
          model: selectedModel,
          messages: repairMessages,
          temperature: 0,
          max_tokens: 4096,
          tryParseJson: true,
        });

        providerUsed = repairedResp.providerUsed;
        modelUsed = repairedResp.modelUsed;
        const repairedText =
          repairedResp.json && typeof repairedResp.json !== "string"
            ? JSON.stringify(repairedResp.json)
            : repairedResp.text;

        analysisResult = parseJsonSafely(repairedText || "");
      } catch (repairError) {
        console.error("Failed to parse JSON response after repair attempt:", jsonText);
        return NextResponse.json(
          {
            error: "Failed to parse AI response",
            rawResponse: jsonText,
          },
          { status: 500 }
        );
      }
    }

    // Return only the resume JSON (remove any analysis fields if present)
    resumeData = analysisResult.updatedResume || analysisResult;

    // Merge profile data (company details, skills, education, etc.) to ensure they're always included
    if (profileData) {
      // Merge company details into experience
      if (
        profileData.company_1 ||
        profileData.company_2 ||
        profileData.company_3 ||
        profileData.company_4 ||
        profileData.company_5
      ) {
        const profileCompanies = [
          profileData.company_1,
          profileData.company_2,
          profileData.company_3,
          profileData.company_4,
          profileData.company_5,
        ].filter(Boolean);

        if (profileCompanies.length > 0) {
          // Merge profile companies with AI-generated experience
          const existingExperience = resumeData.experience || [];
          const profileExperience = profileCompanies.map((comp: any) => ({
            title: sanitizeJobTitle(comp.title || ""),
            company: comp.company || "",
            startDate: comp.startDate || "",
            endDate: comp.endDate || "",
            achievements: comp.achievements || [],
          }));

          // Combine and deduplicate - AI-generated experience takes priority (it's optimized for JD)
          // SIMPLE RULE: First occurrence wins, all others with same company+dates are skipped
          // AI-generated experience comes first, so it takes priority over profile experience
          const combined = [...existingExperience, ...profileExperience];
          const finalMerged: any[] = [];
          const seenCompanyDates = new Set<string>();

          for (const exp of combined) {
            // Key: company + dates (same company, same dates = duplicate, even if title differs)
            const companyDateKey = `${exp.company || ""}|${
              exp.startDate || ""
            }|${exp.endDate || ""}`
              .toLowerCase()
              .trim();

            // Simple check: if we've seen this company+date combo, skip it entirely
            // Since AI-generated experience comes first, it takes priority over profile experience
            if (!seenCompanyDates.has(companyDateKey)) {
              seenCompanyDates.add(companyDateKey);
              finalMerged.push(exp);
            } else {
              // Duplicate - skip it (AI-generated experience already in array takes priority)
              console.log(
                `Merge phase: Skipping duplicate experience (AI-generated takes priority):`,
                exp.title,
                exp.company,
                exp.startDate,
                exp.endDate
              );
            }
          }

          resumeData.experience = finalMerged;
        }
      }

      // Merge hardSkills from profile
      if (profileData.default_resume?.hardSkills) {
        resumeData.hardSkills = {
          ...profileData.default_resume.hardSkills,
          ...(resumeData.hardSkills || {}),
        };
      } else if (profileData.default_resume?.skills) {
        // Backward compatibility: if profile has old "skills" format, convert to hardSkills
        resumeData.hardSkills = {
          ...profileData.default_resume.skills,
          ...(resumeData.hardSkills || {}),
        };
      }
      // Merge softSkills from profile
      if (profileData.default_resume?.softSkills) {
        const profileSoftSkills = profileData.default_resume.softSkills;
        const existingSoftSkills = resumeData.softSkills || [];
        const combined = [...profileSoftSkills, ...existingSoftSkills];
        resumeData.softSkills = Array.from(
          new Set(combined.map((s: string) => s.trim().toLowerCase()))
        ).map((skill) => {
          const original = [...profileSoftSkills, ...existingSoftSkills].find(
            (s) => s.trim().toLowerCase() === skill
          );
          return original || skill;
        });
      }

      // Education: always use profile data exclusively.
      // The AI receives education as plain text and may reformat school names or dates,
      // causing string-based deduplication to fail and producing duplicates in the PDF.
      // Profile data is the authoritative source — no merging needed.
      if (
        profileData.default_resume?.education &&
        profileData.default_resume.education.length > 0
      ) {
        resumeData.education = profileData.default_resume.education;
      }

      // Merge certifications from profile
      if (
        profileData.default_resume?.certifications &&
        profileData.default_resume.certifications.length > 0
      ) {
        const profileCerts = profileData.default_resume.certifications;
        const existingCerts = resumeData.certifications || [];
        const combined = [...profileCerts, ...existingCerts];
        resumeData.certifications = Array.from(
          new Set(
            combined.map((c: any) => {
              // Handle both string and object formats
              const certStr =
                typeof c === "string" ? c : c.name || c.title || String(c);
              return certStr.trim().toLowerCase();
            })
          )
        ).map((certLower) => {
          const original = [...profileCerts, ...existingCerts].find(
            (c: any) => {
              const certStr =
                typeof c === "string" ? c : c.name || c.title || String(c);
              return certStr.trim().toLowerCase() === certLower;
            }
          );
          // Return string format for templates
          return typeof original === "string"
            ? original
            : original?.name || original?.title || String(original || "");
        });
      }

      // Merge projects from profile
      if (
        profileData.default_resume?.projects &&
        profileData.default_resume.projects.length > 0
      ) {
        const profileProjects = profileData.default_resume.projects;
        const existingProjects = resumeData.projects || [];
        const combined = [...profileProjects, ...existingProjects];
        const seen = new Set<string>();
        resumeData.projects = combined.filter((proj: any) => {
          const key = (proj.name || "").toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // Ensure contact info from profile is preserved (profile data takes priority)
      if (profileData.default_resume) {
        // Preserve contact info - profile data takes priority, then AI-generated, then fallback
        resumeData.name = profileData.default_resume.name || resumeData.name;
        resumeData.email = profileData.default_resume.email || resumeData.email;
        resumeData.phone = profileData.default_resume.phone || resumeData.phone;
        resumeData.location =
          profileData.default_resume.location || resumeData.location;
        // Only use AI-generated linkedin if profile explicitly has one set.
        // If profile has no linkedin, clear any hallucinated value from the AI.
        resumeData.linkedin = profileData.default_resume.linkedin || "";
      }
    }

    // Remove location and description from experience if present, deduplicate, and ensure correct order
    if (resumeData.experience && Array.isArray(resumeData.experience)) {
      resumeData.experience = resumeData.experience.map((exp: any) => {
        const { location, description, ...rest } = exp;
        return {
          ...rest,
          title: sanitizeJobTitle(rest?.title || ""),
        };
      });

      // Final aggressive deduplication: same company + same dates = duplicate (regardless of title)
      // SIMPLE RULE: First occurrence wins, all others with same company+dates are skipped
      const finalExperience: any[] = [];
      const seenCompanyDates = new Set<string>();

      for (const exp of resumeData.experience) {
        // Key: company + dates ONLY (same company, same dates = duplicate, even if title differs)
        const companyDateKey = `${exp.company || ""}|${exp.startDate || ""}|${
          exp.endDate || ""
        }`
          .toLowerCase()
          .trim();

        // Simple check: if we've seen this company+date combo, skip it entirely
        if (!seenCompanyDates.has(companyDateKey)) {
          // First time seeing this company+date combination
          seenCompanyDates.add(companyDateKey);
          finalExperience.push(exp);
        } else {
          // Duplicate found - skip it (first occurrence already in array)
          console.log(
            `Skipping duplicate experience:`,
            exp.title,
            exp.company,
            exp.startDate,
            exp.endDate
          );
        }
      }

      resumeData.experience = finalExperience.filter((exp: any) => {
        const company = String(exp.company || "").trim();
        const title = String(exp.title || "").trim();
        return company.length > 0 || title.length > 0;
      });

      // Sort experience from latest (most recent) to oldest first
      resumeData.experience.sort((a: any, b: any) => {
        // Parse dates (MM/YYYY format)
        const parseDate = (dateStr: string) => {
          if (dateStr === "Present" || dateStr === "present") {
            return new Date(9999, 11, 31); // Far future date for "Present"
          }
          const [month, year] = dateStr.split("/");
          return new Date(parseInt(year), parseInt(month) - 1);
        };

        // Compare by endDate first (most recent endDate comes first)
        const aEndDate = parseDate(a.endDate || a.startDate);
        const bEndDate = parseDate(b.endDate || b.startDate);

        if (aEndDate.getTime() !== bEndDate.getTime()) {
          return bEndDate.getTime() - aEndDate.getTime(); // Descending order
        }

        // If endDates are equal, sort by startDate (more recent startDate comes first)
        const aStartDate = parseDate(a.startDate);
        const bStartDate = parseDate(b.startDate);
        return bStartDate.getTime() - aStartDate.getTime(); // Descending order
      });

      // Limit to 5 most recent positions; cap bullets by tenure (not fixed slot order)
      if (resumeData.experience.length > 5) {
        resumeData.experience = resumeData.experience.slice(0, 5);
      }
      resumeData.experience = resumeData.experience.map((exp: any) => {
        if (exp.achievements && Array.isArray(exp.achievements)) {
          const seenAchievements = new Set<string>();
          const uniqueAchievements = exp.achievements
            .map((ach: string) => String(ach || "").trim())
            .filter(Boolean)
            .filter((ach: string) => {
              const normalized = ach.toLowerCase();
              if (seenAchievements.has(normalized)) return false;
              seenAchievements.add(normalized);
              return true;
            });
          const tenureYears = getTenureYears(exp.startDate || "", exp.endDate || "Present");
          const maxBullets = getBulletCountForTenure(tenureYears);
          exp.achievements = uniqueAchievements.slice(0, maxBullets);
        }
        return exp;
      });
    }

    // Template is provided in the request; default to 'standard' if missing
    const template = requestedTemplate || "standard";

    // Generate a PDF from the resume JSON using the chosen template with PDFShift
    // This function is wrapped in error handling to prevent PDF failures from breaking the entire request
    const generatePdfBase64 = async (
      resume: any,
      tmpl: string
    ): Promise<string | null> => {
      try {
        // Read template file
        const tplPath = path.join(process.cwd(), "templates", `${tmpl}.html`);
        let tpl = "";
        try {
          tpl = await fs.readFile(tplPath, "utf8");
        } catch (e) {
          // fallback to standard template if missing
          const fallback = path.join(
            process.cwd(),
            "templates",
            "standard.html"
          );
          tpl = await fs.readFile(fallback, "utf8");
        }

        // Prepare view for Mustache
        // Create a clean view object explicitly to avoid any duplication issues
        // Contact info is already merged from profileData earlier, so use resume directly
        const view: any = {
          name: resume.name || "",
          email: resume.email || "",
          phone: resume.phone || "",
          location: resume.location || "", // Already merged from profileData if available
          linkedin: resume.linkedin || "",
          summary: resume.summary || "",
        };

        // Add boolean flag for summary to prevent repetition
        view.hasSummary = !!(
          resume.summary && resume.summary.trim().length > 0
        );

        // Handle hardSkills (categorized skills) - add boolean flag for existence check
        if (
          resume.hardSkills &&
          typeof resume.hardSkills === "object" &&
          Object.keys(resume.hardSkills).length > 0
        ) {
          view.hasHardSkills = true;
          view.hardSkills = Object.entries(resume.hardSkills).map(([k, v]) => {
            const skillsArray = Array.isArray(v) ? v : [String(v)];
            return {
              key: k,
              value: skillsArray, // Array for templates that iterate
              valueString: skillsArray.join(", "), // String for templates that display directly
            };
          });
        } else {
          view.hasHardSkills = false;
          view.hardSkills = [];
        }

        // Handle softSkills (array of skills) - add boolean flag and comma-separated string
        if (Array.isArray(resume.softSkills) && resume.softSkills.length > 0) {
          view.hasSoftSkills = true;
          view.softSkills = resume.softSkills;
          view.softSkillsString = resume.softSkills.join(", ");
        } else {
          view.hasSoftSkills = false;
          view.softSkills = [];
          view.softSkillsString = "";
        }
        view.hasSkills = !!(view.hasHardSkills || view.hasSoftSkills);

        // Backward compatibility: also provide skills if templates still use it
        if (resume.hardSkills && typeof resume.hardSkills === "object") {
          view.skills = Object.entries(resume.hardSkills).map(([k, v]) => {
            const skillsArray = Array.isArray(v) ? v : [String(v)];
            return {
              key: k,
              value: skillsArray,
              valueString: skillsArray.join(", "),
            };
          });
        } else {
          view.skills = [];
        }

        // Experience - add boolean flag for existence check, keep array for iteration
        // Final deduplication pass before rendering - same company + dates = duplicate
        // SIMPLE RULE: First occurrence wins, all others with same company+dates are skipped
        if (Array.isArray(resume.experience) && resume.experience.length > 0) {
          // Final aggressive deduplication: same company + same dates = duplicate
          const seenCompanyDates = new Set<string>();
          const uniqueExperience: any[] = [];

          console.log(
            `[DEDUP] Starting final pass with ${resume.experience.length} experience entries`
          );

          for (let i = 0; i < resume.experience.length; i++) {
            const exp = resume.experience[i];
            // Key: company + dates ONLY (same company, same dates = duplicate)
            // Normalize: trim and lowercase all parts
            const company = (exp.company || "").trim().toLowerCase();
            const startDate = (exp.startDate || "").trim().toLowerCase();
            const endDate = (exp.endDate || "").trim().toLowerCase();
            const companyDateKey = `${company}|${startDate}|${endDate}`;

            // Simple check: if we've seen this company+date combo, skip it entirely
            if (!seenCompanyDates.has(companyDateKey)) {
              seenCompanyDates.add(companyDateKey);
              uniqueExperience.push(exp);
              console.log(
                `[DEDUP] Added experience ${i + 1}: ${exp.title} at ${
                  exp.company
                } (${startDate} - ${endDate})`
              );
            } else {
              // Duplicate - skip it (first occurrence already in array)
              console.log(
                `[DEDUP] SKIPPING duplicate experience ${i + 1}: ${
                  exp.title
                } at ${
                  exp.company
                } (${startDate} - ${endDate}) - key: ${companyDateKey}`
              );
            }
          }

          console.log(
            `[DEDUP] Final pass complete: ${uniqueExperience.length} unique entries out of ${resume.experience.length} total`
          );

          const renderableExperience = uniqueExperience.filter((exp: any) => {
            const company = String(exp.company || "").trim();
            const title = String(exp.title || "").trim();
            return company.length > 0 || title.length > 0;
          });

          view.hasExperience = renderableExperience.length > 0;
          view.experience = renderableExperience.map((exp: any) => {
            const start = String(exp.startDate || "").trim();
            const end = String(exp.endDate || "").trim();
            const dateRange =
              start && end ? `${start} – ${end}` : start || end || "";

            const achievements = Array.isArray(exp.achievements)
              ? exp.achievements
                  .map((ach: string) => String(ach || "").trim())
                  .filter(Boolean)
                  .map((s: string) => (s.endsWith(".") ? s : `${s}.`))
              : [];

            return {
              ...exp,
              company: String(exp.company || "").trim(),
              title: String(exp.title || "").trim(),
              dateRange,
              achievements,
              hasAchievements: achievements.length > 0,
            };
          });
        } else {
          view.hasExperience = false;
          view.experience = [];
        }

        // Education - add boolean flag for existence check, final deduplication
        if (Array.isArray(resume.education) && resume.education.length > 0) {
          // Final deduplication: same school + date = duplicate
          const seenSchoolDate = new Set<string>();
          const uniqueEducation = resume.education.filter((edu: any) => {
            const key = `${edu.school || ""}|${edu.graduationDate || ""}`
              .toLowerCase()
              .trim();
            if (seenSchoolDate.has(key)) {
              console.log(
                `Final pass: Removing duplicate education:`,
                edu.school,
                edu.graduationDate
              );
              return false;
            }
            seenSchoolDate.add(key);
            return true;
          });

          view.hasEducation = uniqueEducation.length > 0;
          view.education = uniqueEducation;
        } else {
          view.hasEducation = false;
          view.education = [];
        }

        // Certifications - ensure strings, not objects, add boolean flag
        if (
          Array.isArray(resume.certifications) &&
          resume.certifications.length > 0
        ) {
          view.hasCertifications = true;
          view.certifications = resume.certifications.map((c: any) => {
            return typeof c === "string" ? c : c.name || c.title || String(c);
          });
        } else {
          view.hasCertifications = false;
          view.certifications = [];
        }

        // Projects - add boolean flag for existence check, keep array for iteration
        if (Array.isArray(resume.projects) && resume.projects.length > 0) {
          view.hasProjects = true;
          // Pre-process projects to create comma-separated technology strings
          view.projects = resume.projects.map((proj: any) => {
            if (proj.technologies && Array.isArray(proj.technologies)) {
              return {
                ...proj,
                technologiesString: proj.technologies.join(", "),
                technologies: proj.technologies, // Keep array for backward compatibility
              };
            }
            return proj;
          });
        } else {
          view.hasProjects = false;
          view.projects = [];
        }

        // Mustache render
        const html = Mustache.render(tpl, view);

        // Generate PDF locally with Puppeteer (headless Chrome)
        console.log("Starting local PDF generation...");
        console.log(
          `Template: ${tmpl}, HTML length: ${html.length} characters`
        );

        const puppeteer = await import("puppeteer");
        const browser = await puppeteer.default.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        try {
          const page = await browser.newPage();
          await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          const pdfBuffer = await page.pdf({
            format: "A4",
            margin: {
              top: "10mm",
              right: "10mm",
              bottom: "10mm",
              left: "10mm",
            },
            printBackground: true,
          });
          const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");
          console.log(
            "PDF generated successfully, size:",
            pdfBuffer.length,
            "bytes"
          );
          return pdfBase64;
        } finally {
          await browser.close();
        }
      } catch (err) {
        // Re-throw to be caught by the outer try-catch in the main handler
        throw err;
      }
    };

    let pdfBase64: string | undefined = undefined;
    let pdfError: string | undefined = undefined;
    try {
      console.log("Attempting PDF generation...");
      const pdfResult = await generatePdfBase64(resumeData, template);
      pdfBase64 = pdfResult ?? undefined;
      if (pdfBase64) {
        console.log("PDF generation successful");
      } else {
        console.log("PDF generation returned null (likely API key missing)");
      }
    } catch (pdfErr: any) {
      console.error("PDF generation failed - caught in outer handler", pdfErr);
      // Extract error message more carefully
      try {
        if (pdfErr instanceof Error) {
          pdfError = pdfErr.message;
        } else if (typeof pdfErr === "string") {
          pdfError = pdfErr;
        } else if (pdfErr?.message) {
          pdfError = pdfErr.message;
        } else if (pdfErr?.error?.message) {
          // Handle nested error objects (PDFShift format)
          pdfError = pdfErr.error.message;
        } else if (pdfErr?.error?.error?.message) {
          // Handle double-nested error objects
          pdfError = pdfErr.error.error.message;
        } else {
          pdfError =
            "PDF generation failed. Please check your PDFShift API key configuration.";
        }
        console.log("PDF error message extracted:", pdfError);
      } catch (parseErr) {
        // If we can't parse the error, use a generic message
        console.error("Error parsing PDF error:", parseErr);
        pdfError =
          "PDF generation failed. Ensure Puppeteer/Chromium is installed (e.g. npm install puppeteer).";
      }
      // Don't fail the entire request if PDF generation fails - still return the resume
    }

    // Always return the resume, even if PDF generation failed
    return NextResponse.json({
      resume: resumeData,
      providerUsed,
      modelUsed,
      ...(pdfBase64 && { pdfBase64 }),
      ...(pdfError && { pdfError }),
    });
  } catch (error) {
    console.error("Error analyzing resume:", error);
    // If we have resumeData, still return it even if there was an error
    // This handles cases where the error occurred after resume generation
    if (typeof resumeData !== "undefined") {
      console.warn("Returning resume despite error:", error);
      return NextResponse.json({
        resume: resumeData,
        pdfError: error instanceof Error ? error.message : "An error occurred",
      });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An error occurred while analyzing the resume",
      },
      { status: 500 }
    );
  }
}
