import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Database
    SUPABASE_DATABASE_URL: z.string().url(),

    // x402 Configuration
    X402_SOLANA_WALLET_ADDRESS: z.string().min(32).max(44),
    X402_CDP_API_KEY_ID: z.string().min(1),
    X402_CDP_API_KEY_SECRET: z.string().min(1),

    // Purch Backend Integration
    PURCH_API_URL: z.string().url().default("https://api.purch.xyz/api/gifts"),
    PURCH_INTERNAL_API_KEY: z.string().min(32),

    // Environment
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});