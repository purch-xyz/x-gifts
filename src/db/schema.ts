import { pgTable, uuid, varchar, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const giftSearches = pgTable("gift_searches", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: varchar("platform", { length: 50 }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  profileUrl: text("profile_url").notNull(),
  profileData: jsonb("profile_data").notNull(), // Bio, interests, themes
  gifts: jsonb("gifts").notNull(), // Array of gift recommendations
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // 24 hours from creation
});

// For tracking trending gifts (optional, for trending endpoint)
export const giftTrends = pgTable("gift_trends", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: varchar("category", { length: 100 }).notNull(),
  giftTitle: text("gift_title").notNull(),
  asin: varchar("asin", { length: 50 }).notNull(),
  searchCount: jsonb("search_count").default(1).notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
});