import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

function buildCoverLetterHtml(coverLetter: string, candidateName: string): string {
  // Escape HTML entities
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Split the cover letter into lines and separate greeting, body, sign-off
  const lines = coverLetter.split(/\n/);
  let greeting = "";
  let signOff = "";
  let nameLine = "";
  const bodyLines: string[] = [];

  let i = 0;
  // Find greeting (e.g. "Dear Hiring Team,")
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }
    if (trimmed.toLowerCase().startsWith("dear")) {
      greeting = trimmed;
      i++;
      break;
    }
    // If no greeting found, treat everything as body
    break;
  }
  if (!greeting) {
    greeting = "Dear Hiring Team,";
  }

  // Collect everything into a temporary array, then split out sign-off from end
  const remaining: string[] = [];
  for (; i < lines.length; i++) {
    remaining.push(lines[i]);
  }

  // Find sign-off and name from the end
  // Look for "Best Regards" or similar, and the candidate name line
  let endIdx = remaining.length;
  for (let j = remaining.length - 1; j >= 0; j--) {
    const trimmed = remaining[j].trim();
    if (!trimmed) continue;
    // Check if this is the candidate name
    if (!nameLine && trimmed.length < 60 && !trimmed.toLowerCase().includes("regard")) {
      nameLine = trimmed;
      endIdx = j;
      continue;
    }
    // Check if this is "Best Regards" line
    if (!signOff && trimmed.toLowerCase().includes("regard")) {
      signOff = trimmed;
      endIdx = j;
      break;
    }
    break;
  }

  // Everything before sign-off is body
  for (let j = 0; j < endIdx; j++) {
    bodyLines.push(remaining[j]);
  }

  if (!signOff) signOff = "Best Regards.";
  if (!nameLine) nameLine = candidateName;

  // Join body lines into flowing paragraphs
  // Split by blank lines to create paragraphs, then join non-blank lines within each paragraph
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];
  for (const line of bodyLines) {
    if (line.trim() === "") {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
    } else {
      currentParagraph.push(line.trim());
    }
  }
  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  const bodyHtml = paragraphs
    .map((p) => `<p class="body-paragraph">${esc(p)}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000000;
  }
  .page {
    max-width: 210mm;
    margin: 0 auto;
    padding: 0;
  }
  .greeting {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    margin-bottom: 12pt;
  }
  .body-paragraph {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    margin-bottom: 12pt;
    text-align: left;
  }
  .sign-off {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    margin-top: 12pt;
    margin-bottom: 4pt;
  }
  .name {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12pt;
    font-weight: bold;
    margin-top: 20pt;
  }
</style>
</head><body>
<div class="page">
  <p class="greeting">${esc(greeting)}</p>
  ${bodyHtml}
  <p class="sign-off">${esc(signOff)}</p>
  <p class="name">${esc(nameLine)}</p>
</div>
</body></html>`;
}

export async function POST(request: NextRequest) {
  try {
    const { coverLetter, jobRole, companyName, candidateName } =
      await request.json();

    if (!coverLetter || typeof coverLetter !== "string") {
      return NextResponse.json(
        { error: "Cover letter text is required" },
        { status: 400 }
      );
    }

    const sanitize = (s: string) =>
      s
        .replace(/[/\\:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .trim();

    const role = sanitize(jobRole || "job");
    const company = sanitize(companyName || "company");
    const folderName = `${role}_${company}`;
    const safeName = sanitize(candidateName || "cover_letter");

    const html = buildCoverLetterHtml(coverLetter, candidateName || "Candidate");

    // Generate PDF with Puppeteer
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    let pdfBase64: string;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10000 });
      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
        printBackground: true,
      });
      pdfBase64 = Buffer.from(pdfBuffer).toString("base64");
    } finally {
      await browser.close();
    }

    // Save to resume/[jobRole]_[companyName]/
    const resumeDir = path.join(process.cwd(), "resume", folderName);
    await fs.mkdir(resumeDir, { recursive: true });
    const fileName = `${safeName}_cover_letter.pdf`;
    const filePath = path.join(resumeDir, fileName);
    await fs.writeFile(filePath, Buffer.from(pdfBase64, "base64"));

    return NextResponse.json({
      success: true,
      pdfBase64,
      path: `resume/${folderName}/${fileName}`,
    });
  } catch (error) {
    console.error("Error saving cover letter:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save cover letter",
      },
      { status: 500 }
    );
  }
}
