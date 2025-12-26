import type { Context } from "hono";
import type { z } from "zod";
import { db } from "../db/client";
import { giftSearches } from "../db/schema";
import { getPurchGiftSuggestions, transformPurchGifts } from "../services/purch-integration";
import type { giftSuggestRequestSchema } from "./schemas";
import { eq, and } from "drizzle-orm";

export async function getGiftSuggestionsHandler(
  c: Context,
  body: z.infer<typeof giftSuggestRequestSchema>
) {
  const { profileUrl, platform } = body;

  console.log("[Gifts] Processing request", {
    profileUrl,
    platform,
  });

  try {
    // Check cache first (24 hour TTL)
    const cached = await db
      .select()
      .from(giftSearches)
      .where(
        and(
          eq(giftSearches.profileUrl, profileUrl),
          eq(giftSearches.platform, platform)
        )
      )
      .limit(1);

    if (cached.length > 0 && cached[0].expiresAt > new Date()) {
      console.log("[x-gifts] Returning cached result (instant response)");
      return c.json({
        success: true,
        username: cached[0].username,
        gifts: cached[0].gifts,
        interests: (cached[0].profileData as any).interests || [],
        themes: (cached[0].profileData as any).themes || [],
        cached: true,
      }, 200);
    }

    console.log("[x-gifts] Cache miss, calling Purch backend...");

    // Call Purch backend for real gift suggestions
    // This handles: Apify scraping + AI analysis + Product search
    const purchResponse = await getPurchGiftSuggestions(profileUrl, platform);

    if (!purchResponse.success) {
      return c.json({
        success: false,
        error: "Failed to get gift suggestions from Purch backend",
      }, 500);
    }

    // Transform Purch gifts to x-gifts format
    const transformedGifts = transformPurchGifts(purchResponse.gifts);

    // Extract profile data from Purch response
    const profileData = {
      interests: purchResponse.profileData?.interests || [],
      themes: purchResponse.profileData?.themes || [],
      bio: purchResponse.profileData?.bio || "",
    };

    // Cache results for 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(giftSearches).values({
      platform,
      username: purchResponse.username,
      profileUrl,
      profileData,
      gifts: transformedGifts as any,
      expiresAt,
    });

    console.log("[x-gifts] Successfully processed and cached gift suggestions");

    return c.json({
      success: true,
      username: purchResponse.username,
      profilePicUrl: purchResponse.profilePicUrl,
      gifts: transformedGifts,
      interests: profileData.interests,
      themes: profileData.themes,
      cached: false,
    }, 200);

  } catch (error) {
    console.error("[Gifts] Error processing request:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate gift suggestions",
    }, 500);
  }
}

export async function getTrendingGiftsHandler(c: Context) {
  try {
    // Query database for most frequently appearing gifts in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentSearches = await db
      .select()
      .from(giftSearches)
      .where(
        and(
          giftSearches.createdAt > sevenDaysAgo
        )
      )
      .limit(100);

    // Count gift occurrences
    const giftCounts = new Map<string, { gift: any; count: number }>();

    for (const search of recentSearches) {
      const gifts = search.gifts as any[];
      for (const gift of gifts) {
        const key = gift.asin;
        if (giftCounts.has(key)) {
          giftCounts.get(key)!.count++;
        } else {
          giftCounts.set(key, { gift, count: 1 });
        }
      }
    }

    // Sort by popularity and get top 10
    const trending = Array.from(giftCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        ...item.gift,
        trendingScore: item.count,
      }));

    // Get popular interests
    const interestCounts = new Map<string, number>();
    for (const search of recentSearches) {
      const interests = (search.profileData as any).interests || [];
      for (const interest of interests) {
        interestCounts.set(interest, (interestCounts.get(interest) || 0) + 1);
      }
    }

    const popularInterests = Array.from(interestCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([interest]) => interest);

    return c.json({
      success: true,
      trending: {
        gifts: trending,
        interests: popularInterests,
        period: "7_days",
        sampleSize: recentSearches.length,
      },
      cached: false,
    }, 200);

  } catch (error) {
    console.error("[Trending] Error fetching trending data:", error);
    return c.json({
      success: false,
      error: "Failed to fetch trending data",
    }, 500);
  }
}