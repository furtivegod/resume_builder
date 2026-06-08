import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { pdfBase64, jobRole, companyName, fileName, jobDescription, downloadPath } =
      await request.json();

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return NextResponse.json(
        { error: "PDF data is required" },
        { status: 400 }
      );
    }

    if (!jobRole?.trim() || !companyName?.trim()) {
      return NextResponse.json(
        { error: "Job role and company name are required to save the PDF" },
        { status: 400 }
      );
    }

    // Sanitize folder name: jobRole_companyName (replace invalid path chars)
    const sanitize = (s: string) =>
      s
        .replace(/[/\\:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .trim();
    const folderName = `${sanitize(jobRole)}_${sanitize(companyName)}`;
    if (!folderName || folderName === "_") {
      return NextResponse.json(
        { error: "Invalid job role or company name" },
        { status: 400 }
      );
    }

    const safeFileName =
      fileName && typeof fileName === "string"
        ? fileName.replace(/[/\\:*?"<>|]/g, "_")
        : "resume.pdf";

    let resumeDir: string;
    if (downloadPath && typeof downloadPath === "string" && downloadPath.trim()) {
      const customBase = path.normalize(downloadPath.trim());
      resumeDir = path.isAbsolute(customBase)
        ? path.join(customBase, folderName)
        : path.join(process.cwd(), customBase, folderName);
    } else {
      resumeDir = path.join(os.homedir(), "Downloads", "resume", folderName);
    }
    await fs.mkdir(resumeDir, { recursive: true });

    let base64Data = pdfBase64.trim();
    if (base64Data.includes(",")) {
      base64Data = base64Data.split(",")[1] ?? base64Data;
    }
    const buffer = Buffer.from(base64Data, "base64");
    const filePath = path.join(resumeDir, safeFileName);
    await fs.writeFile(filePath, buffer);

    // Save job description in the same folder
    const jdText =
      typeof jobDescription === "string" ? jobDescription.trim() : "";
    if (jdText) {
      const jdPath = path.join(resumeDir, "job_description.txt");
      await fs.writeFile(jdPath, jdText, "utf8");
    }

    return NextResponse.json({
      success: true,
      path: `resume/${folderName}/${safeFileName}`,
    });
  } catch (error) {
    console.error("Error saving resume PDF:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save PDF",
      },
      { status: 500 }
    );
  }
}
