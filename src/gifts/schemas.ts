import { z } from "zod";

export const platformSchema = z.enum(["instagram", "x", "tiktok"]);
export type Platform = z.infer<typeof platformSchema>;

export const giftSuggestRequestSchema = z.object({
  profileUrl: z.string().url().describe("Social media profile URL"),
  platform: platformSchema.describe("Social media platform"),
});

export const giftItemSchema = z.object({
  title: z.string(),
  price: z.number().positive(),
  image: z.string().url(),
  reason: z.string(),
  asin: z.string().describe("Amazon Standard Identification Number"),
  productUrl: z.string().url().describe("Direct Amazon product URL"),
  x402CheckoutUrl: z.string().url().describe("x-purch checkout URL for this product"),
  confidence: z.number().min(0).max(1).describe("Confidence score for this recommendation"),
  category: z.string(),
});

export const giftResponseSchema = z.object({
  success: z.literal(true),
  username: z.string(),
  profilePicUrl: z.string().url().optional(),
  gifts: z.array(giftItemSchema),
  interests: z.array(z.string()),
  themes: z.array(z.string()),
  cached: z.boolean().optional(),
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});