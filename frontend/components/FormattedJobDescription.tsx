"use client";

import type { JobWorkType } from "@/lib/prompts/job-page-extract";
import { formatJobWorkTypeLabel } from "@/lib/prompts/job-page-extract";
import { parseJobDescriptionBlocks } from "@/lib/format-job-description";
import { jobWorkTypeBadgeClass } from "@/lib/job-work-type";

interface FormattedJobDescriptionProps {
  jobDescription: string;
  jobTitle?: string;
  companyName?: string;
  salary?: string;
  postedDate?: string;
  jobTypes?: JobWorkType[];
  requiresTravel?: boolean;
  className?: string;
}

function JobMetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {children}
    </span>
  );
}

export default function FormattedJobDescription({
  jobDescription,
  jobTitle,
  companyName,
  salary,
  postedDate,
  jobTypes = [],
  requiresTravel = false,
  className = "",
}: FormattedJobDescriptionProps) {
  const blocks = parseJobDescriptionBlocks(jobDescription);
  const visibleTypes = jobTypes.filter((type) => type !== "unknown");

  return (
    <article className={`space-y-5 ${className}`.trim()}>
      {(jobTitle || companyName || salary || postedDate || visibleTypes.length > 0 || requiresTravel) && (
        <header className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-slate-600/50 dark:from-slate-800/80 dark:to-slate-900/40">
          {jobTitle ? (
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {jobTitle}
            </h3>
          ) : null}
          {companyName ? (
            <p className="mt-0.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              {companyName}
            </p>
          ) : null}
          {(salary || postedDate || visibleTypes.length > 0 || requiresTravel) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {salary ? <JobMetaPill>{salary}</JobMetaPill> : null}
              {postedDate ? <JobMetaPill>Posted {postedDate}</JobMetaPill> : null}
              {visibleTypes.map((type) => (
                <span
                  key={type}
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${jobWorkTypeBadgeClass(type)}`}
                >
                  {formatJobWorkTypeLabel(type)}
                </span>
              ))}
              {requiresTravel ? (
                <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                  Travel required
                </span>
              ) : null}
            </div>
          )}
        </header>
      )}

      <div className="space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        {blocks.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No job description available.</p>
        ) : (
          blocks.map((block, index) => {
            if (block.type === "heading") {
              return (
                <h4
                  key={`h-${index}`}
                  className="border-b border-slate-200/80 pb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-900 dark:border-slate-600/50 dark:text-slate-100"
                >
                  {block.text}
                </h4>
              );
            }

            if (block.type === "bullets") {
              return (
                <ul
                  key={`ul-${index}`}
                  className="list-disc space-y-2 pl-5 marker:text-blue-500 dark:marker:text-blue-400"
                >
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="pl-0.5">
                      {item}
                    </li>
                  ))}
                </ul>
              );
            }

            return (
              <p key={`p-${index}`} className="text-[15px] leading-7 text-slate-700 dark:text-slate-200">
                {block.text}
              </p>
            );
          })
        )}
      </div>
    </article>
  );
}
