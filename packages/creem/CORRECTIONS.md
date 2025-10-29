# Creem Plugin Corrections

This document summarizes the corrections made to ensure the Creem plugin accurately reflects Creem's actual API and capabilities, rather than Stripe-inspired assumptions.

## Key Corrections Made

### 1. Webhook Event Types ✅
**Source:** [https://docs.creem.io/learn/webhooks/event-types](https://docs.creem.io/learn/webhooks/event-types)

**Corrected:**
- Changed from `event.type` to `event.eventType` (Creem's actual webhook structure)
- Updated webhook events to match Creem's actual events:
  - `checkout.completed`
  - `subscription.active`
  - `subscription.paid`
  - `subscription.update`
  - `subscription.canceled`
  - `subscription.expired`
  - `subscription.trialing`
  - `subscription.paused`
  - `refund.created`
  - `dispute.created`

**Removed:** Stripe-specific events that don't exist in Creem:
- ❌ `subscription.created` → Use `subscription.active` instead
- ❌ `subscription.updated` → Use `subscription.update` instead
- ❌ `order.created` / `order.completed`
- ❌ `customer.created` / `customer.updated`

### 2. Customer Management ✅

**Corrected:**
- **Removed** `POST /v1/customers` endpoint (doesn't exist in Creem)
- **Removed** customer creation on signup functionality
- **Removed** customer update API calls

**Explanation:**
Creem automatically creates customers when they complete a checkout session using the `customer_email` parameter. There is no explicit customer creation API.

**Files Updated:**
- `src/index.ts` - Removed customer creation logic
- `src/types.ts` - Updated customer types to match actual Creem response
- Database hooks now log a warning if `createCustomerOnSignUp` is enabled

### 3. API Types and Response Structure ✅
**Source:** [https://docs.creem.io/api-reference/introduction](https://docs.creem.io/api-reference/introduction)

**Corrected:**
- Updated `CreemWebhookEvent` structure to use `eventType` and `object` fields
- Updated `CreemSubscription` to match actual Creem response:
  - `current_period_start_date` (not `current_period_start`)
  - `current_period_end_date` (not `current_period_end`)
  - `canceled_at` (can be null, not boolean)
  - Added `items` array for subscription items
- Updated `CreemOrder` fields:
  - `customer` and `product` are IDs (strings)
  - `type` for recurring vs one_time
- Updated `CreemProduct`:
  - `billing_type` (not `type`)
  - `billing_period` with actual Creem values
  - `tax_mode`, `tax_category`, etc.
- Updated `CreemCustomer` with `country` field

### 4. Subscription Status Values ✅

**Corrected:**
- Removed Stripe-specific status: `incomplete`
- Added Creem statuses: `trialing`, `expired`, `pending`
- Updated default status from `incomplete` to `pending`

**Current valid statuses:**
- `active` - Subscription is active
- `canceled` - Subscription is canceled
- `past_due` - Payment is overdue
- `paused` - Subscription is paused
- `trialing` - Subscription is in trial period
- `expired` - Subscription has expired
- `pending` - Subscription is pending

### 5. Checkout Session API ✅
**Source:** [https://docs.creem.io/api-reference/endpoint/create-checkout](https://docs.creem.io/api-reference/endpoint/create-checkout)

**Verified correct parameters:**
- `product_id` ✅
- `customer_email` ✅
- `success_url` ✅
- `cancel_url` ✅
- `metadata` ✅

**Removed assumptions about:**
- Customer ID requirement (customers are created automatically)
- Subscription management via billing portal (using Creem's actual endpoints)

### 6. Webhook Event Handlers ✅

**Updated `src/hooks.ts`:**
- `onCheckoutCompleted` - Handles `checkout.completed`
- `onSubscriptionActive` - Handles `subscription.active` (new subscription)
- `onSubscriptionPaid` - Handles `subscription.paid` (payment received)
- `onSubscriptionUpdate` - Handles `subscription.update`
- `onSubscriptionCanceled` - Handles `subscription.canceled`
- `onSubscriptionExpired` - Handles `subscription.expired`
- `onSubscriptionTrialing` - Handles `subscription.trialing`
- `onSubscriptionPaused` - Handles `subscription.paused`

**Removed handlers:**
- ❌ `onSubscriptionCreated` (use `onSubscriptionActive`)
- ❌ `onSubscriptionUpdated` (use `onSubscriptionUpdate`)
- ❌ `onOrderCreated` / `onOrderCompleted`
- ❌ `onCustomerCreated` / `onCustomerUpdated`

### 7. Documentation Updates ✅

**Updated files:**
- `README.md` - Corrected webhook events list, added reference to Creem docs
- `README.md` - Added note that `createCustomerOnSignUp` is not supported
- `README.md` - Updated subscription status values

## API Endpoints Actually Used

### Creem API Endpoints (Verified)
1. ✅ `POST /v1/checkouts` - Create checkout session
2. ✅ `POST /v1/subscriptions/{id}/cancel` - Cancel subscription
3. ✅ `GET /v1/subscriptions` - Get subscription (for success callback)
4. ✅ `POST /v1/customers/billing` - Create billing portal session

### Endpoints NOT Used (Don't exist or not needed)
1. ❌ `POST /v1/customers` - Customer creation (automatic via checkout)
2. ❌ `PATCH /v1/customers/{id}` - Customer update (not available)

## Important Notes for Users

1. **Customers are created automatically** - When users complete a checkout with their email, Creem creates the customer. No explicit customer creation is needed.

2. **Use `subscription.active` for new subscriptions** - This is Creem's event for newly created active subscriptions, not `subscription.created`.

3. **Webhook event structure differs** - Creem uses `eventType` field, not `type`.

4. **Product fields** - Use `billing_type` and `billing_period` instead of Stripe's `type` and `interval`.

5. **Subscription items** - Creem subscriptions have an `items` array structure for managing multiple products.

## References

- [Creem API Documentation](https://docs.creem.io/api-reference/introduction)
- [Creem Webhook Events](https://docs.creem.io/learn/webhooks/event-types)
- [Creem Checkout Integration](https://docs.creem.io/checkout-flow)

