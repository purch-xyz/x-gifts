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
		name: "x-gifts API",
		version: "1.0.0",
		description:
			"x402-enabled gift recommendation API that analyzes social media profiles to suggest personalized gifts",
		protocol: "x402",
		documentation: `${c.req.url}docs`,
		endpoints: [
			{
				path: "POST /gifts/suggest",
				description:
					"Get personalized gift recommendations from a social media profile",
				payment: {
					required: true,
					protocol: "x402",
					price: "$0.10",
					network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
					token: "USDC",
				},
				requestBody: {
					profileUrl: "string (required, URL)",
					platform: "string (required, 'instagram' | 'x' | 'tiktok')",
				},
				response: {
					success: "boolean",
					username: "string",
					profilePicUrl: "string (optional, URL)",
					gifts: "array of gift objects with title, price, image, reason, asin, productUrl, x402CheckoutUrl",
					interests: "array of strings",
					themes: "array of strings",
					cached: "boolean (optional)",
				},
			},
			{
				path: "GET /gifts/trending",
				description: "Get trending gifts and popular interests from recent searches",
				payment: {
					required: true,
					protocol: "x402",
					price: "$0.02",
					network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
					token: "USDC",
				},
				response: {
					success: "boolean",
					trending: {
						gifts: "array of trending gift objects",
						interests: "array of popular interests",
						period: "string (e.g., '7_days')",
						sampleSize: "number",
					},
				},
			},
			{
				path: "GET /health",
				description: "Health check endpoint",
				payment: {
					required: false,
				},
			},
			{
				path: "GET /docs",
				description: "OpenAPI specification",
				payment: {
					required: false,
				},
			},
		],
		links: {
			x402Protocol: "https://x402.org",
			purch: "https://purch.xyz",
			xPurch: "https://x402.purch.xyz",
		},
	});
});

// Health check endpoint
app.get("/health", (c) => {
	return c.json({
		status: "ok",
		service: "x-gifts",
	});
});

// OpenAPI documentation endpoint
app.get("/docs", (c) => {
	const baseUrl = new URL(c.req.url).origin;

	return c.json({
		openapi: "3.0.0",
		info: {
			title: "x-gifts API",
			version: "1.0.0",
			description:
				"x402-enabled gift recommendation API that analyzes social media profiles (Instagram, X, TikTok) to suggest personalized gifts. Payments are processed using the x402 protocol with USDC on Solana.",
			contact: {
				name: "Purch",
				url: "https://github.com/orgs/purch-xyz/repositories",
			},
			license: {
				name: "MIT",
			},
		},
		servers: [
			{
				url: baseUrl,
				description: "API Server",
			},
		],
		tags: [
			{
				name: "gifts",
				description: "Gift recommendation endpoints",
			},
			{
				name: "health",
				description: "Health check endpoints",
			},
		],
		paths: {
			"/": {
				get: {
					summary: "API Information",
					description: "Get API metadata and available endpoints",
					tags: ["health"],
					responses: {
						"200": {
							description: "API information",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											name: { type: "string" },
											version: { type: "string" },
											description: { type: "string" },
											protocol: { type: "string" },
											documentation: { type: "string" },
											endpoints: { type: "array" },
										},
									},
								},
							},
						},
					},
				},
			},
			"/health": {
				get: {
					summary: "Health Check",
					description: "Check API health status",
					tags: ["health"],
					responses: {
						"200": {
							description: "Service is healthy",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											status: { type: "string", example: "ok" },
											service: { type: "string", example: "x-gifts" },
										},
									},
								},
							},
						},
					},
				},
			},
			"/gifts/suggest": {
				post: {
					summary: "Get Gift Suggestions",
					description:
						"Analyze a social media profile and return 3 personalized gift recommendations. Supports Instagram, X (Twitter), and TikTok profiles. Results are cached for 24 hours. Requires x402 payment of $0.10 USDC.",
					tags: ["gifts"],
					"x-x402": {
						price: "$0.10",
						network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
						token: "USDC",
						required: true,
					},
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["profileUrl", "platform"],
									properties: {
										profileUrl: {
											type: "string",
											format: "uri",
											description:
												"Social media profile URL to analyze",
											example: "https://instagram.com/username",
										},
										platform: {
											type: "string",
											enum: ["instagram", "x", "tiktok"],
											description: "Social media platform",
											example: "instagram",
										},
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Gift recommendations returned successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: {
												type: "boolean",
												example: true,
											},
											username: {
												type: "string",
												description: "Extracted username from profile",
												example: "techie_traveler",
											},
											profilePicUrl: {
												type: "string",
												format: "uri",
												description: "Profile picture URL (if available)",
											},
											gifts: {
												type: "array",
												description: "3 personalized gift recommendations",
												items: {
													type: "object",
													properties: {
														title: {
															type: "string",
															description: "Product name",
															example: "Portable Power Bank 20000mAh",
														},
														price: {
															type: "number",
															description: "Price in USD",
															example: 45.99,
														},
														image: {
															type: "string",
															format: "uri",
															description: "Product image URL",
														},
														reason: {
															type: "string",
															description:
																"Why this gift matches the profile",
															example:
																"Perfect for their frequent travels and tech interests",
														},
														asin: {
															type: "string",
															description:
																"Amazon Standard Identification Number",
															example: "B0BSHV8MRZ",
														},
														productUrl: {
															type: "string",
															format: "uri",
															description: "Direct Amazon product URL",
															example:
																"https://www.amazon.com/dp/B0BSHV8MRZ",
														},
														x402CheckoutUrl: {
															type: "string",
															format: "uri",
															description:
																"x-purch checkout URL for purchasing",
														},
													},
												},
											},
											interests: {
												type: "array",
												items: { type: "string" },
												description: "Extracted interests from profile",
												example: ["travel", "photography", "tech"],
											},
											themes: {
												type: "array",
												items: { type: "string" },
												description: "Visual/lifestyle themes detected",
												example: ["adventure", "minimalist"],
											},
											cached: {
												type: "boolean",
												description:
													"Whether result was returned from 24-hour cache",
											},
										},
									},
								},
							},
						},
						"402": {
							description: "Payment Required (x402)",
							headers: {
								"X-PAYMENT": {
									schema: { type: "string" },
									description: "x402 payment challenge",
								},
							},
						},
						"400": {
							description: "Invalid request body",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: { type: "boolean", example: false },
											error: { type: "string" },
										},
									},
								},
							},
						},
						"500": {
							description: "Internal server error",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: { type: "boolean", example: false },
											error: { type: "string" },
										},
									},
								},
							},
						},
					},
				},
			},
			"/gifts/trending": {
				get: {
					summary: "Get Trending Gifts",
					description:
						"Get trending gifts and popular interests aggregated from recent gift searches over the past 7 days. Requires x402 payment of $0.02 USDC.",
					tags: ["gifts"],
					"x-x402": {
						price: "$0.02",
						network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
						token: "USDC",
						required: true,
					},
					responses: {
						"200": {
							description: "Trending gifts returned successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: {
												type: "boolean",
												example: true,
											},
											trending: {
												type: "object",
												properties: {
													gifts: {
														type: "array",
														description:
															"Top 10 most recommended gifts",
														items: {
															type: "object",
															properties: {
																title: { type: "string" },
																price: { type: "number" },
																image: {
																	type: "string",
																	format: "uri",
																},
																reason: { type: "string" },
																asin: { type: "string" },
																productUrl: {
																	type: "string",
																	format: "uri",
																},
																x402CheckoutUrl: {
																	type: "string",
																	format: "uri",
																},
																trendingScore: {
																	type: "number",
																	description: "Frequency count",
																},
															},
														},
													},
													interests: {
														type: "array",
														items: { type: "string" },
														description: "Top 10 most common interests",
													},
													period: {
														type: "string",
														example: "7_days",
														description: "Time window for analysis",
													},
													sampleSize: {
														type: "number",
														description:
															"Number of searches analyzed",
													},
												},
											},
										},
									},
								},
							},
						},
						"402": {
							description: "Payment Required (x402)",
							headers: {
								"X-PAYMENT": {
									schema: { type: "string" },
									description: "x402 payment challenge",
								},
							},
						},
						"500": {
							description: "Internal server error",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: { type: "boolean", example: false },
											error: { type: "string" },
										},
									},
								},
							},
						},
					},
				},
			},
		},
		externalDocs: {
			description: "x402 Protocol Documentation",
			url: "https://docs.cdp.coinbase.com/x402",
		},
	});
});

// Export for Bun to serve
const port = Number(process.env.PORT) || 3000;
console.log(`🎁 x-gifts server starting on port ${port}`);

export default {
	port,
	fetch: app.fetch,
};
