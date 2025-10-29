# @better-auth/creem

Creem integration plugin for Better Auth. Accept payments and manage subscriptions with Creem.

## Installation

```bash
npm install @better-auth/creem
```

## Usage

### Server Configuration

```typescript
import { betterAuth } from "better-auth";
import { creem } from "@better-auth/creem";

export const auth = betterAuth({
  // ... other options
  plugins: [
    creem({
      apiKey: process.env.CREEM_API_KEY!,
      webhookSecret: process.env.CREEM_WEBHOOK_SECRET,
      checkout: {
        requireEmailVerification: false,
        async onCheckoutComplete({ order, subscription, product }) {
          console.log("Checkout completed:", order, product);
          if (subscription) {
            console.log("Subscription created:", subscription);
          }
        },
        async onSubscriptionUpdate({ subscription }) {
          console.log("Subscription updated:", subscription);
        },
        async onSubscriptionCancel({ subscription }) {
          console.log("Subscription canceled:", subscription);
        },
      },
    }),
  ],
});
```

### Client Configuration

```typescript
import { createAuthClient } from "better-auth/client";
import { creemClient } from "@better-auth/creem/client";

export const authClient = createAuthClient({
  // ... other options
  plugins: [creemClient()],
});
```

### Creating a Checkout Session

Creem uses products directly - no need to configure plans! Simply create your products in the [Creem Dashboard](https://creem.io/dashboard/products) and use the product ID:

```typescript
// Client-side
const result = await authClient.checkout.create({
  productId: "prod_xxx", // Your Creem product ID
  successUrl: "/success",
  cancelUrl: "/pricing",
});

if (result.data?.redirect && result.data.checkout_url) {
  window.location.href = result.data.checkout_url;
}
```

### Listing Active Subscriptions

```typescript
const subscriptions = await authClient.subscription.list();
console.log(subscriptions);
```

### Canceling a Subscription

```typescript
await authClient.subscription.cancel({
  subscriptionId: "sub_xxx",
});
```

### Creating a Billing Portal Session

```typescript
const result = await authClient.subscription.billingPortal({
  returnUrl: "/settings",
});

if (result.data?.redirect && result.data.url) {
  window.location.href = result.data.url;
}
```

## Webhook Configuration

Set up a webhook in your Creem dashboard pointing to:

```
https://yourdomain.com/api/auth/creem/webhook
```

The plugin automatically handles the following webhook events (ref: [Creem Webhook Event Types](https://docs.creem.io/learn/webhooks/event-types)):

- `checkout.completed` - When a checkout session is completed
- `subscription.active` - When a new subscription is created and payment was successful
- `subscription.paid` - When a subscription transaction is paid
- `subscription.update` - When a subscription object is updated
- `subscription.canceled` - When a subscription is canceled
- `subscription.expired` - When a subscription expires
- `subscription.trialing` - When a subscription starts a trial period
- `subscription.paused` - When a subscription is paused
- `refund.created` - When a refund is created (not yet handled)
- `dispute.created` - When a dispute is created (not yet handled)

## Products: One-Time vs Recurring

Creem products can be either:
- **One-time payments** - Single purchase (e.g., eBooks, courses, lifetime access)
- **Recurring subscriptions** - Monthly/yearly billing (e.g., SaaS subscriptions)

The plugin handles both types automatically. The `subscription` table is used for tracking both types of purchases.

## Database Schema

The plugin automatically adds the following fields to your database:

### User Table

- `creemCustomerId` (string, optional) - Creem customer ID (automatically set after first checkout)

### Subscription Table

- `id` (string) - Primary key
- `productId` (string) - Creem product ID
- `referenceId` (string) - Reference ID (usually user ID)
- `creemCustomerId` (string, optional) - Creem customer ID
- `creemSubscriptionId` (string, optional) - Creem subscription ID (only for recurring products)
- `creemOrderId` (string, optional) - Creem order ID
- `status` (string) - Status (active, canceled, past_due, paused, trialing, expired, pending)
- `periodStart` (date, optional) - Billing period start (only for recurring products)
- `periodEnd` (date, optional) - Billing period end (only for recurring products)
- `cancelAtPeriodEnd` (boolean, optional) - Cancel at period end flag (only for recurring products)

## API Reference

### Plugin Options

#### `apiKey` (required)

Your Creem API key.

#### `webhookSecret` (optional)

Your Creem webhook secret for signature verification.

#### `apiBaseUrl` (optional)

Creem API base URL. Defaults to `https://api.creem.io`.

#### `createCustomerOnSignUp` (optional)

**Note:** This option is not supported by Creem. Creem automatically creates customers when they complete a checkout session with their email address. This option will be ignored.

#### `checkout` (optional)

Checkout configuration object.

##### `requireEmailVerification` (optional)

Require email verification before allowing checkouts. Defaults to `false`.

##### `onCheckoutComplete` (optional)

Callback function called when a checkout is completed. Receives `order`, `product`, and optional `subscription` (for recurring products).

##### `onSubscriptionUpdate` (optional)

Callback function called when a subscription is updated (only for recurring products).

##### `onSubscriptionCancel` (optional)

Callback function called when a subscription is canceled (only for recurring products).

##### `onSubscriptionDeleted` (optional)

Callback function called when a subscription is deleted (only for recurring products).

##### `authorizeReference` (optional)

Function to authorize reference IDs for multi-tenant applications.

##### `getCheckoutParams` (optional)

Function to customize checkout parameters.

## How It Works

1. **Create Products in Creem Dashboard** - Create your products (one-time or recurring) at https://creem.io/dashboard/products
2. **Copy Product ID** - Get the product ID from your Creem dashboard
3. **Create Checkout** - Use `authClient.checkout.create({ productId: "prod_xxx" })` to create a checkout session
4. **Redirect User** - Redirect the user to the checkout URL
5. **Handle Webhook** - The plugin automatically handles webhooks and updates your database
6. **Access Subscriptions** - Use `authClient.subscription.list()` to see active subscriptions

## License

MIT
