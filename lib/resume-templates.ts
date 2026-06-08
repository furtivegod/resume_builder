export const RESUME_TEMPLATES = [
  {
    id: "standard",
    label: "Standard",
    description: "Centered single column with section rules. Clean ATS-friendly layout.",
  },
  {
    id: "ledger",
    label: "Ledger",
    description: "Left-aligned two-column layout. Skills and education in a narrow sidebar.",
  },
] as const;

export type ResumeTemplateId = (typeof RESUME_TEMPLATES)[number]["id"];

export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateId = "standard";

export function isValidResumeTemplate(id: string): id is ResumeTemplateId {
  return RESUME_TEMPLATES.some((t) => t.id === id);
}
