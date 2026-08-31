import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function createLovableGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is missing");
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

function createOpenAIProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

/**
 * Returns a chat model. If an admin has saved an OpenAI API key in
 * app_settings, use OpenAI (gpt-4o-mini). Otherwise fall back to
 * Lovable AI Gateway with the provided fallback model.
 */
export async function getChatModel(fallbackLovableModel: string) {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "openai_api_key")
      .maybeSingle();
    const openaiKey = data?.value?.trim();
    if (openaiKey) {
      const provider = createOpenAIProvider(openaiKey);
      return provider("gpt-4o-mini");
    }
  } catch (e) {
    console.error("[getChatModel] settings lookup failed:", e);
  }
  const gateway = createLovableGateway();
  return gateway(fallbackLovableModel);
}
