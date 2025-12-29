import { createFacilitatorConfig } from "@coinbase/x402";
import { zValidator } from "@hono/zod-validator";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/hono";
import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { Hono, type MiddlewareHandler } from "hono";
import { env } from "./env";
import {
	getGiftSuggestionsHandler,
	getTrendingGiftsHandler,
} from "./gifts/handlers";
import { giftSuggestRequestSchema } from "./gifts/schemas";

// Initialize x402 facilitator config
console.log("[x402] Initializing facilitator config", {
	keyId: env.X402_CDP_API_KEY_ID.slice(0, 8) + "...",
	wallet: env.X402_SOLANA_WALLET_ADDRESS,
});

const facilitatorConfig = createFacilitatorConfig(
	env.X402_CDP_API_KEY_ID,
	env.X402_CDP_API_KEY_SECRET,
);

// Create facilitator client and register Solana scheme
const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);
const resourceServer = new x402ResourceServer(facilitatorClient).register(
	SOLANA_MAINNET_CAIP2,
	new ExactSvmScheme(),
);

const createPayerLoggingMiddleware = (
	paymentMethod: string,
): MiddlewareHandler => {
	return async (c, next) => {
		const paymentHeader = c.req.header("X-PAYMENT");

		if (paymentHeader) {
			console.log("[x402] Payment received", {
				paymentMethod,
				path: `${c.req.method.toUpperCase()} ${c.req.path}`,
				hasPaymentHeader: true,
			});
		}

		await next();
	};
};

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

// Error logging middleware for x402
app.use("/gifts/suggest", async (c, next) => {
	try {
		await next();
	} catch (error) {
		console.error("[x402] Middleware error:", {
			path: c.req.path,
			method: c.req.method,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		throw error;
	}
});

// Payer logging and x402 payment middleware for gift suggestions endpoint
app.use("/gifts/suggest", createPayerLoggingMiddleware("solana"));

console.log("[x402] Setting up payment middleware for /gifts/suggest");

app.use(
	"/gifts/suggest",
	paymentMiddleware(
		{
			"POST /gifts/suggest": {
				accepts: [
					{
						scheme: "exact",
						price: "$0.10",
						network: SOLANA_MAINNET_CAIP2,
						payTo: env.X402_SOLANA_WALLET_ADDRESS,
					},
				],
				description:
					"Get personalized gift recommendations based on social media profile analysis. Analyzes Instagram, X, or TikTok profiles to suggest 3 perfect gifts.",
				mimeType: "application/json",
				maxTimeoutSeconds: 300,
				extensions: {
					bazaar: {
						discoverable: true,
						category: "ai",
						tags: ["gifts", "recommendations", "social-media", "ai"],
						inputSchema: {
							type: "object",
							required: ["profileUrl", "platform"],
							properties: {
								profileUrl: {
									type: "string",
									format: "uri",
									description:
										"Social media profile URL (Instagram, X, or TikTok)",
								},
								platform: {
									type: "string",
									enum: ["instagram", "x", "tiktok"],
									description: "Social media platform",
								},
							},
						},
						outputSchema: {
							type: "object",
							properties: {
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
											productUrl: { type: "string", format: "uri" },
											x402CheckoutUrl: { type: "string", format: "uri" },
										},
									},
								},
								interests: { type: "array", items: { type: "string" } },
								themes: { type: "array", items: { type: "string" } },
							},
						},
					},
				},
			},
		},
		resourceServer,
	),
);

// Gift suggestions endpoint
app.post(
	"/gifts/suggest",
	zValidator("json", giftSuggestRequestSchema),
	async (c) => {
		const body = c.req.valid("json");
		return getGiftSuggestionsHandler(c, body);
	},
);

// Payer logging and x402 payment middleware for trending endpoint
app.use("/gifts/trending", createPayerLoggingMiddleware("solana"));

app.use(
	"/gifts/trending",
	paymentMiddleware(
		{
			"GET /gifts/trending": {
				accepts: [
					{
						scheme: "exact",
						price: "$0.02",
						network: SOLANA_MAINNET_CAIP2,
						payTo: env.X402_SOLANA_WALLET_ADDRESS,
					},
				],
				description:
					"Get trending gifts and popular interests from recent searches",
				mimeType: "application/json",
				maxTimeoutSeconds: 30,
				extensions: {
					bazaar: {
						discoverable: true,
						category: "ai",
						tags: ["gifts", "trending", "recommendations"],
						outputSchema: {
							type: "object",
							properties: {
								success: { type: "boolean" },
								trending: {
									type: "object",
									properties: {
										gifts: {
											type: "array",
											items: { type: "object" },
											description: "Most frequently recommended gifts",
										},
										interests: {
											type: "array",
											items: { type: "string" },
											description: "Most common interests",
										},
										period: { type: "string" },
										sampleSize: { type: "number" },
									},
								},
							},
						},
					},
				},
			},
		},
		resourceServer,
	),
);

// Trending gifts endpoint
app.get("/gifts/trending", getTrendingGiftsHandler);

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
				description: "Get trending gifts from recent searches",
			},
		],
	});
});

// Export for Bun to serve
const port = Number(process.env.PORT) || 3000;
console.log(`🎁 x-gifts server starting on port ${port}`);

export default {
	port,
	fetch: app.fetch,
};
