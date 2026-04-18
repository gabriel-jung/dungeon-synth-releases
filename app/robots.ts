import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "CCBot",
  "anthropic-ai",
  "Claude-Web",
  "ClaudeBot",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Amazonbot",
  "Bytespider",
  "FacebookBot",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "Applebot-Extended",
  "DuckAssistBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "Omgilibot",
  "ImagesiftBot",
  "Timpibot",
  "AI2Bot",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/", crawlDelay: 10 },
      { userAgent: AI_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
