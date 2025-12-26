# x-gifts

Gift recommendation API that uses social media profiles to suggest personalized gifts. Built for the [x402 Hackathon](https://www.x402hackathon.com/).

## What it does

Takes a social media profile URL (Instagram, X, or TikTok) and returns 3 personalized gift recommendations using AI analysis. Each request costs $0.10 USDC via x402 micropayments on Solana.

## Key Features

- Analyzes social profiles to extract interests and themes
- Returns Amazon ASINs for direct purchasing
- Integrates with [x-purch](https://github.com/purch-xyz/x-purch) for checkout
- Caches results for 24 hours to reduce costs
- Built for AI agents with structured JSON outputs

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env

# Start server
bun run dev
```

## Example Request

```bash
POST /gifts/suggest

{
  "profileUrl": "https://instagram.com/username",
  "platform": "instagram"
}
```

Example Response:
```json
{
  "success": true,
  "username": "username",
  "profilePicUrl": "https://...",
  "gifts": [
    {
      "title": "Echo Dot (5th Gen)",
      "price": 49.99,
      "image": "https://...",
      "reason": "Perfect for their smart home interests",
      "asin": "B08N5WRWNW",
      "productUrl": "https://www.amazon.com/dp/B08N5WRWNW",
      "x402CheckoutUrl": "https://x-purch-741433844771.us-east1.run.app/orders/solana"
    }
  ],
  "interests": ["photography", "travel", "tech"],
  "themes": ["minimalist", "outdoor"]
}
```


## Required Environment Variables

```
SUPABASE_DATABASE_URL       # PostgreSQL for caching results
X402_SOLANA_WALLET_ADDRESS  # Your wallet for receiving payments
X402_CDP_API_KEY_ID         # Coinbase CDP credentials
X402_CDP_API_KEY_SECRET
```

## Why Database?

We use Supabase/PostgreSQL to cache results for 24 hours. This reduces costs since scraping and AI analysis are expensive operations. If someone requests the same profile within 24 hours, we return cached results instantly.

## How it Works

1. User provides social media profile URL
2. x-gifts checks cache for instant results
3. If not cached, calls Purch backend API (~2 minutes):
   - Purch scrapes profile with Apify and analyzes interests
   - Finds real Amazon products
4. Results are cached for 24 hours
5. Returns products with ASINs for [x-purch](https://github.com/purch-xyz/x-purch) checkout

## Architecture

```
x-gifts (this service)          Purch Backend
    │                                │
    ├─ x402 payments ───────────────►│
    ├─ Cache layer                   ├─ Apify scraping
    └─ Purch integration ────────────├─ AI analysis
                                     └─ Product search
```

## License

MIT - See [LICENSE](LICENSE) file

## Links

- [Purch](https://purch.xyz)
- [x402 Hackathon](https://www.x402hackathon.com/)
- [x402 Documentation](https://docs.cdp.coinbase.com/x402/)

---

Built for the x402 Hackathon