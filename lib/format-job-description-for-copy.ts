import { formatJobWorkTypeLabel } from "@/lib/prompts/job-page-extract";
import type { JobWorkType } from "@/lib/prompts/job-page-extract";
import { prepareJobDescriptionForDisplay } from "@/lib/normalize-job-description";

export interface JobDescriptionCopyHeader {
  jobTitle?: string | null;
  companyName?: string | null;
  salary?: string | null;
  postedDate?: string | null;
  jobTypes?: JobWorkType[] | null;
  requiresTravel?: boolean | null;
}

export function formatJobDescriptionForCopy(
  jobDescription: string,
  header?: JobDescriptionCopyHeader
): string {
  const body = prepareJobDescriptionForDisplay(jobDescription);
  const lines: string[] = [];

  const title = String(header?.jobTitle ?? "").trim();
  const company = String(header?.companyName ?? "").trim();
  const salary = String(header?.salary ?? "").trim();
  const postedDate = String(header?.postedDate ?? "").trim();
  const jobTypes = (header?.jobTypes ?? []).filter((type) => type !== "unknown");
  const requiresTravel = Boolean(header?.requiresTravel);

  if (title) lines.push(title);
  if (company) lines.push(company);

  const meta: string[] = [];
  if (salary) meta.push(`Pay: ${salary}`);
  if (postedDate) meta.push(`Posted: ${postedDate}`);
  if (jobTypes.length > 0) {
    meta.push(`Work type: ${jobTypes.map((type) => formatJobWorkTypeLabel(type)).join(" · ")}`);
  }
  if (requiresTravel) meta.push("Travel required");

  if (meta.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...meta);
  }

  if (lines.length > 0 && body) {
    lines.push("", "—".repeat(40), "");
  }

  if (body) lines.push(body);

  return lines.join("\n").trim();
}
