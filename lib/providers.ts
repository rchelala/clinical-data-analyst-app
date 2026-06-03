export type AIProvider = "claude" | "gemini";

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude: "Claude (default)",
  gemini: "Gemini 2.5 Flash Lite (free)",
};

export const PROVIDER_STORAGE_KEY = "ai_provider_preference";

export function loadProvider(): AIProvider {
  if (typeof window === "undefined") return "claude";
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return stored === "gemini" ? "gemini" : "claude";
}

export function saveProvider(provider: AIProvider): void {
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
}
