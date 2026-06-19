import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai-provider";
import type { AIMessage } from "@/lib/ai-provider";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";

export async function POST(request: NextRequest) {
  try {
    await requireAuthClient(request);

    const { resume, jd, apiProvider = "openai" } = await request.json();

    if (!resume || typeof resume !== "object") {
      return NextResponse.json(
        { error: "Resume data is required" },
        { status: 400 }
      );
    }

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

    const resumeJson = JSON.stringify(resume, null, 2);
    const jobDesc = typeof jd === "string" && jd.trim() ? jd.trim() : "this role";
    const candidateName = (resume.name && String(resume.name).trim()) || "Candidate";

    const coverLetterInstructions = `You are writing a short cover letter for a job application. Given the candidate's resume (JSON) and the job context, write a cover letter.

STRICT FORMAT REQUIREMENTS:
1. The letter MUST start with exactly: "Dear Hiring Team,"
2. After that, write 3 to 4 sentences in the body. Be professional and concise. Use only information from the resume.
3. The letter MUST end with exactly (on separate lines):
   "Best Regards."
   (blank line)
   the candidate's name from the resume

Return ONLY the full cover letter text with the greeting and sign-off as specified. No JSON, no labels.`;

    const userPrompt = `Resume (JSON):
${resumeJson}

Job context:
${jobDesc}

Candidate name for sign-off: ${candidateName}`;

    let coverLetter = "";

    // Use the centralized adapter
    try {
      const messages: AIMessage[] = [
        { role: "system", content: coverLetterInstructions },
        { role: "user", content: userPrompt },
      ];
      const selectedModel =
        apiProvider === "openai"
          ? process.env.OPENAI_MODEL
          : apiProvider === "deepseek"
          ? process.env.DEEPSEEK_MODEL
          : process.env.ANTHROPIC_MODEL;

      const aiResp = await callAI({
        provider: apiProvider as any,
        model: selectedModel,
        messages,
        temperature: 0.4,
        max_tokens: 320,
        tryParseJson: false,
      });

      coverLetter = aiResp.text || "";
    } catch (err) {
      throw err;
    }

    if (!coverLetter) {
      throw new Error("Cover letter response was empty");
    }

    if (!coverLetter.startsWith("Dear Hiring Team")) {
      coverLetter = "Dear Hiring Team,\n\n" + coverLetter;
    }
    if (!coverLetter.includes("Best Regards")) {
      coverLetter = coverLetter + "\n\nBest Regards.\n\n" + candidateName;
    }

    return NextResponse.json({ coverLetter });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error generating cover letter:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate cover letter",
      },
      { status: 500 }
    );
  }
}
