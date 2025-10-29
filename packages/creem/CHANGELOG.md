# @better-auth/creem

## 1.0.0

### Major Features

- ✅ **Simplified Product-Based Integration** - Works directly with Creem product IDs, no plan configuration needed
- ✅ **One-Time & Recurring Support** - Handles both one-time payments and subscription products automatically
- ✅ **Complete Webhook Integration** - All Creem webhook events properly handled with accurate data structures
- ✅ **Accurate API Implementation** - Uses actual Creem API endpoints and data models
- ✅ **Type-Safe** - Full TypeScript support with accurate types from Creem's API

### Breaking Changes

- Removed "plans" concept - now works directly with Creem product IDs
- Changed endpoint from `/subscription/checkout` to `/checkout/create`
- Changed `onCheckoutComplete` callback signature to include `order` and `product`
- Renamed `subscription` config to `checkout` to reflect support for both product types
- Simplified database schema - removed `plan`, `seats`, `groupId`, `limits` fields

### Features

- Direct product ID integration with Creem
- Automatic customer creation during checkout (no manual API calls needed)
- Support for both one-time and recurring products
- Webhook handlers for all Creem events:
  - `checkout.completed`
  - `subscription.active`
  - `subscription.paid`
  - `subscription.update`
  - `subscription.canceled`
  - `subscription.expired`
  - `subscription.trialing`
  - `subscription.paused`
- Database schema for tracking purchases and subscriptions
- Billing portal integration
- Multi-tenant support via reference IDs
- Comprehensive TypeScript types
- Client-side plugin for easy integration

### Documentation

- Complete README with setup and usage examples
- Extensive EXAMPLE.md with real-world code samples
- CORRECTIONS.md documenting all changes from initial assumptions
- FINAL-CORRECTIONS.md with migration guide
