import { callAI, type AIMessage } from "@/lib/ai-provider";

export const MAX_EXPERIENCE_ROLES = 5;
export const EXPERIENCE_BULLET_LIMITS = [9, 7, 6, 5, 5] as const;

export function getProfileCompanies(profileData: unknown): any[] {
  if (!profileData || typeof profileData !== "object") return [];
  const data = profileData as Record<string, unknown>;
  return [1, 2, 3, 4, 5]
    .map((i) => data[`company_${i}`])
    .filter(Boolean);
}

function normalizeKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function dedupeBullets(bullets: unknown[]): string[] {
  const seen = new Set<string>();
  return bullets
    .map((bullet) => String(bullet || "").trim())
    .filter((bullet) => {
      if (!bullet) return false;
      const key = bullet.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function matchProfileCompany(exp: any, profileCompanies: any[]): any | undefined {
  return profileCompanies.find((company) => {
    if (normalizeKey(company.company) !== normalizeKey(exp.company)) return false;
    const expStart = normalizeKey(exp.startDate);
    const companyStart = normalizeKey(company.startDate);
    return !expStart || !companyStart || expStart === companyStart;
  });
}

function padBulletsFromProfile(
  bullets: string[],
  target: number,
  profileCompany: any | undefined
): string[] {
  const pool = [
    ...(Array.isArray(profileCompany?.achievements) ? profileCompany.achievements : []),
    ...(profileCompany?.description ? [String(profileCompany.description)] : []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const result = [...bullets];
  const seen = new Set(result.map((bullet) => bullet.toLowerCase()));

  for (const candidate of pool) {
    if (result.length >= target) break;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export function normalizeExperienceBullets(
  experience: any[],
  profileData?: unknown
): any[] {
  const profileCompanies = getProfileCompanies(profileData);

  return experience.slice(0, MAX_EXPERIENCE_ROLES).map((exp, index) => {
    const target = EXPERIENCE_BULLET_LIMITS[index] ?? 5;
    let bullets = dedupeBullets(Array.isArray(exp.achievements) ? exp.achievements : []);
    const profileMatch = matchProfileCompany(exp, profileCompanies);

    if (bullets.length < target) {
      bullets = padBulletsFromProfile(bullets, target, profileMatch);
    }

    return {
      ...exp,
      achievements: bullets.slice(0, target),
    };
  });
}

export function experienceNeedsBulletExpansion(experience: any[]): boolean {
  return experience.some((exp, index) => {
    const target = EXPERIENCE_BULLET_LIMITS[index] ?? 5;
    const count = Array.isArray(exp.achievements) ? exp.achievements.length : 0;
    return count < target;
  });
}

export async function expandExperienceBulletsWithAI(
  experience: any[],
  jd: string,
  provider: "anthropic" | "openai" | "deepseek",
  model?: string
): Promise<any[]> {
  const rolesNeedingBullets = experience
    .map((exp, index) => {
      const target = EXPERIENCE_BULLET_LIMITS[index] ?? 5;
      const current = dedupeBullets(Array.isArray(exp.achievements) ? exp.achievements : []);
      const needed = target - current.length;
      return needed > 0
        ? {
            index,
            title: exp.title || "",
            company: exp.company || "",
            startDate: exp.startDate || "",
            endDate: exp.endDate || "",
            target,
            current,
            needed,
          }
        : null;
    })
    .filter(Boolean) as Array<{
    index: number;
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    target: number;
    current: string[];
    needed: number;
  }>;

  if (rolesNeedingBullets.length === 0) {
    return experience;
  }

  const roleSummary = rolesNeedingBullets
    .map(
      (role) =>
        `Role ${role.index + 1}: ${role.title} at ${role.company} (${role.startDate} - ${role.endDate})\n` +
        `Need exactly ${role.needed} more bullets (final total must be ${role.target}).\n` +
        `Existing bullets:\n${role.current.map((bullet) => `- ${bullet}`).join("\n") || "- none"}`
    )
    .join("\n\n");

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You write senior-level resume achievement bullets. Return ONLY valid JSON. " +
        "Each bullet must start with a strong action verb, include one metric, align with the job description, " +
        "and must not duplicate existing bullets.",
    },
    {
      role: "user",
      content:
        `Job description:\n${jd}\n\n` +
        `Generate additional achievement bullets for these roles:\n\n${roleSummary}\n\n` +
        `Return JSON in this exact shape:\n` +
        `{"additions":[{"index":0,"bullets":["bullet 1","bullet 2"]}]}\n` +
        `Use the same index values provided above. Each additions entry must contain exactly the requested number of new bullets.`,
    },
  ];

  const aiResp = await callAI({
    provider,
    model,
    messages,
    temperature: 0.4,
    max_tokens: 2048,
    tryParseJson: true,
  });

  const parsed =
    aiResp.json && typeof aiResp.json === "object"
      ? aiResp.json
      : JSON.parse(String(aiResp.text || "{}"));

  const additions = Array.isArray(parsed.additions) ? parsed.additions : [];
  const updated = experience.map((exp) => ({
    ...exp,
    achievements: dedupeBullets(Array.isArray(exp.achievements) ? exp.achievements : []),
  }));

  for (const entry of additions) {
    const roleIndex = Number(entry?.index);
    if (!Number.isInteger(roleIndex) || roleIndex < 0 || roleIndex >= updated.length) continue;

    const extra = dedupeBullets(Array.isArray(entry?.bullets) ? entry.bullets : []);
    const target = EXPERIENCE_BULLET_LIMITS[roleIndex] ?? 5;
    const merged = dedupeBullets([...(updated[roleIndex].achievements || []), ...extra]);
    updated[roleIndex] = {
      ...updated[roleIndex],
      achievements: merged.slice(0, target),
    };
  }

  return updated;
}
