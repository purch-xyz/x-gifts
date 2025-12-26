import { createFacilitatorConfig } from "@coinbase/x402";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paymentMiddleware, type SolanaAddress } from "x402-hono";
import { env } from "./env";
import {
  getGiftSuggestionsHandler,
  getTrendingGiftsHandler
} from "./gifts/handlers";
import { giftSuggestRequestSchema } from "./gifts/schemas";

// Initialize x402 facilitator config
const facilitatorConfig = createFacilitatorConfig(
  env.X402_CDP_API_KEY_ID,
  env.X402_CDP_API_KEY_SECRET,
);

const app = new Hono();

app.use("*", async (c, next) => {
  const proto = c.req.header("X-Forwarded-Proto");
  const host = c.req.header("X-Forwarded-Host") || c.req.header("Host");

  if (proto === "https" && host) {
    const originalUrl = new URL(c.req.url);
    const httpsUrl = `https://${host}${originalUrl.pathname}${originalUrl.search}`;

    const newRequest = new Request(httpsUrl, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
    });

    Object.defineProperty(c.req, "raw", {
      value: newRequest,
      writable: false,
      configurable: true,
    });

    Object.defineProperty(c.req, "url", {
      value: httpsUrl,
      writable: false,
      configurable: true,
    });
  }

  await next();
});

// x402 payment middleware for gift suggestions endpoint
app.use(
  "/gifts/suggest",
  paymentMiddleware(
    env.X402_SOLANA_WALLET_ADDRESS as SolanaAddress,
    {
      "POST /gifts/suggest": {
        price: "$0.10", // $0.10 per request
        network: "solana",
        config: {
          resource: "https://x-gifts.purch.xyz/gifts/suggest",
          maxTimeoutSeconds: 300,
          mimeType: "application/json",
          description: "Get personalized gift recommendations based on social media profile analysis. Analyzes Instagram, X, or TikTok profiles to suggest 3 perfect gifts.",
          discoverable: true,
          inputSchema: {
            bodyFields: {
              profileUrl: {
                type: "string",
                format: "uri",
                description: "Social media profile URL (Instagram, X, or TikTok)",
                required: true,
              },
              platform: {
                type: "string",
                enum: ["instagram", "x", "tiktok"],
                description: "Social media platform",
                required: true,
              },
            },
          },
          outputSchema: {
            success: { type: "boolean" },
            username: { type: "string" },
            profilePicUrl: { type: "string", format: "uri" },
            gifts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  price: { type: "number" },
                  image: { type: "string", format: "uri" },
                  reason: { type: "string" },
                  asin: { type: "string", description: "Amazon ASIN" },
                  productUrl: { type: "string", format: "uri", description: "Amazon product URL" },
                  x402CheckoutUrl: { type: "string", format: "uri", description: "x-purch checkout URL" },
                },
              },
            },
            interests: { type: "array", items: { type: "string" } },
            themes: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    facilitatorConfig,
  ),
);

// Gift suggestions endpoint
app.post(
  "/gifts/suggest",
  zValidator("json", giftSuggestRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    return getGiftSuggestionsHandler(c, body);
  }
);

// Trending gifts endpoint (lower price for cached data)
app.get(
  "/gifts/trending",
  // TODO: Add x402 middleware with $0.02 pricing
  getTrendingGiftsHandler
);

// Root endpoint - API information
app.get("/", (c) => {
  return c.json({
    name: "x-gifts",
    description: "Gift recommendation API for x402 hackathon",
    endpoints: [
      {
        path: "POST /gifts/suggest",
        price: "$0.10 USDC",
        description: "Get gift recommendations from social profile",
      },
      {
        path: "GET /gifts/trending",
        price: "$0.02 USDC",
        status: "coming_soon",
      },
    ],
  });
});

// Start server
const port = process.env.PORT || 3000;
console.log(`🎁 x-gifts server starting on port ${port}`);

export default app;