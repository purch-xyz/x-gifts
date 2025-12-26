import type { Platform } from "../gifts/schemas";

const PURCH_API_URL = "https://api.purch.xyz/api/gifts";
const X_PURCH_CHECKOUT = "https://x-purch-741433844771.us-east1.run.app/orders/solana";

/**
 * Purch Backend Integration
 *
 * This service calls the Purch gift hunter API which:
 * 1. Scrapes social media profiles using Apify (30-60s)
 * 2. Analyzes with AI agents to extract interests (10-20s)
 * 3. Searches for real Amazon products (30-60s)
 * 4. Returns actual products with ASINs
 *
 * Total time: 2-3 minutes (x402 supports up to 5 minutes)
 */

export interface PurchGift {
  title: string;
  price: number;
  image: string;
  reason?: string;
  purchLink: string;
  productLink?: string;
}

export interface PurchGiftResponse {
  success: boolean;
  username: string;
  profilePicUrl?: string;
  profileData?: {
    bio?: string;
    interests?: string[];
    themes?: string[];
  };
  gifts: PurchGift[];
}

/**
 * Call Purch backend to get real gift suggestions
 *
 * INPUT:
 * - profileUrl: Social media profile URL (e.g., "https://instagram.com/username")
 * - platform: Platform type ("instagram" | "x" | "tiktok")
 *
 * OUTPUT:
 * - username: Extracted username
 * - gifts: Array of 3 real Amazon products with ASINs
 * - profileData: Analyzed interests and themes
 *
 * NOTE: This is a long-running operation (2-3 minutes)
 */
export async function getPurchGiftSuggestions(
  profileUrl: string,
  platform: Platform
): Promise<PurchGiftResponse> {
  console.log(`[Purch Integration] Calling Purch backend for ${platform} profile`);
  console.log("[Purch Integration] This may take 2-3 minutes due to scraping and AI analysis...");

  // Set a 4-minute timeout (x402 allows up to 5 minutes)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240000); // 4 minutes

  try {
    const response = await fetch(PURCH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Note: Purch backend has its own authentication
      },
      body: JSON.stringify({
        profileUrl,
        platform,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Purch backend returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Purch Integration] Received ${data.gifts?.length || 0} gift suggestions`);

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timeout after 4 minutes. The profile may have too much content to analyze.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Transform Purch gift data to x-gifts format
 * Adds x402 checkout URLs and confidence scores
 */
export function transformPurchGifts(purchGifts: PurchGift[]): any[] {
  return purchGifts.map(gift => {
    // Extract ASIN from Purch link or product link
    const asinMatch =
      gift.purchLink?.match(/\/product\/([A-Z0-9]{10})/) ||
      gift.productLink?.match(/\/dp\/([A-Z0-9]{10})/);
    const asin = asinMatch ? asinMatch[1] : "UNKNOWN";

    return {
      title: gift.title,
      price: gift.price,
      image: gift.image,
      reason: gift.reason || "Based on profile interests",
      asin,
      productUrl: gift.productLink || `https://www.amazon.com/dp/${asin}`,
      x402CheckoutUrl: X_PURCH_CHECKOUT,
    };
  });
}