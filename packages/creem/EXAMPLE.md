# Creem Plugin Examples

## Basic Setup

### Server Setup

```typescript
// auth.ts
import { betterAuth } from "better-auth";
import { creem } from "@better-auth/creem";

export const auth = betterAuth({
  database: {
    // your database config
  },
  plugins: [
    creem({
      apiKey: process.env.CREEM_API_KEY!,
      webhookSecret: process.env.CREEM_WEBHOOK_SECRET,
      checkout: {
        requireEmailVerification: false,
        async onCheckoutComplete({ order, product, subscription }) {
          console.log("Checkout completed!");
          console.log("Product:", product.name);
          console.log("Order:", order.id);
          
          if (subscription) {
            console.log("Subscription created:", subscription.id);
            // Send welcome email, grant access, etc.
            await sendWelcomeEmail(subscription.referenceId);
          } else {
            // One-time purchase
            console.log("One-time purchase completed");
            await grantLifetimeAccess(order.customer);
          }
        },
        async onSubscriptionUpdate({ subscription }) {
          console.log("Subscription updated:", subscription.status);
        },
        async onSubscriptionCancel({ subscription }) {
          console.log("Subscription canceled!");
          await sendCancellationEmail(subscription.referenceId);
        },
      },
    }),
  ],
});
```

### Client Setup

```typescript
// auth-client.ts
import { createAuthClient } from "better-auth/client";
import { creemClient } from "@better-auth/creem/client";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [creemClient()],
});
```

## Getting Your Product IDs

1. Go to [Creem Dashboard > Products](https://creem.io/dashboard/products)
2. Create a product (one-time or recurring)
3. Copy the product ID (e.g., `prod_xxx`)
4. Use it directly in your code - no plan configuration needed!

## Usage Examples

### 1. Create Checkout for One-Time Product

```typescript
// In your React component
import { authClient } from "./auth-client";

async function handlePurchase() {
  try {
    const result = await authClient.checkout.create({
      productId: "prod_lifetime_xxx", // Your one-time product ID
      successUrl: `${window.location.origin}/success`,
      cancelUrl: `${window.location.origin}/pricing`,
    });

    if (result.data?.redirect && result.data.checkout_url) {
      window.location.href = result.data.checkout_url;
    }
  } catch (error) {
    console.error("Failed to create checkout:", error);
  }
}
```

### 2. Create Checkout for Subscription Product

```typescript
import { authClient } from "./auth-client";

async function handleSubscribe() {
  try {
    const result = await authClient.checkout.create({
      productId: "prod_monthly_pro_xxx", // Your recurring product ID
      successUrl: `${window.location.origin}/dashboard`,
      cancelUrl: `${window.location.origin}/pricing`,
    });

    if (result.data?.checkout_url) {
      window.location.href = result.data.checkout_url;
    }
  } catch (error) {
    console.error("Failed to create checkout:", error);
  }
}
```

### 3. List Active Subscriptions

```typescript
import { authClient } from "./auth-client";

async function fetchSubscriptions() {
  try {
    const response = await authClient.subscription.list();
    const subscriptions = response.data;

    subscriptions.forEach((sub) => {
      console.log(`Product: ${sub.productId}, Status: ${sub.status}`);
    });

    return subscriptions;
  } catch (error) {
    console.error("Failed to fetch subscriptions:", error);
  }
}
```

### 4. Cancel Subscription

```typescript
import { authClient } from "./auth-client";

async function cancelSubscription(subscriptionId: string) {
  try {
    const result = await authClient.subscription.cancel({
      subscriptionId,
    });

    if (result.data?.success) {
      console.log("Subscription canceled successfully");
    }
  } catch (error) {
    console.error("Failed to cancel subscription:", error);
  }
}
```

### 5. Open Billing Portal

```typescript
import { authClient } from "./auth-client";

async function openBillingPortal() {
  try {
    const result = await authClient.subscription.billingPortal({
      returnUrl: `${window.location.origin}/settings`,
    });

    if (result.data?.redirect && result.data.url) {
      window.location.href = result.data.url;
    }
  } catch (error) {
    console.error("Failed to open billing portal:", error);
  }
}
```

## React Component Example

```typescript
import React, { useEffect, useState } from "react";
import { authClient } from "./auth-client";

interface Subscription {
  id: string;
  productId: string;
  status: string;
  periodEnd?: Date;
}

export function SubscriptionManager() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  async function loadSubscriptions() {
    try {
      const response = await authClient.subscription.list();
      setSubscriptions(response.data || []);
    } catch (error) {
      console.error("Failed to load subscriptions:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(productId: string) {
    const result = await authClient.checkout.create({
      productId,
      successUrl: `${window.location.origin}/success`,
      cancelUrl: `${window.location.origin}/pricing`,
    });

    if (result.data?.checkout_url) {
      window.location.href = result.data.checkout_url;
    }
  }

  async function handleCancel(subscriptionId: string) {
    if (confirm("Are you sure you want to cancel your subscription?")) {
      await authClient.subscription.cancel({ subscriptionId });
      await loadSubscriptions();
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Your Subscriptions</h2>
      {subscriptions.length === 0 ? (
        <p>No active subscriptions</p>
      ) : (
        <ul>
          {subscriptions.map((sub) => (
            <li key={sub.id}>
              <h3>Product: {sub.productId}</h3>
              <p>Status: {sub.status}</p>
              {sub.periodEnd && (
                <p>Renews: {new Date(sub.periodEnd).toLocaleDateString()}</p>
              )}
              <button onClick={() => handleCancel(sub.id)}>Cancel</button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <h3>Available Products</h3>
        <button onClick={() => handleCheckout("prod_basic_xxx")}>
          Buy Basic Plan
        </button>
        <button onClick={() => handleCheckout("prod_pro_xxx")}>
          Buy Pro Plan
        </button>
        <button onClick={() => handleCheckout("prod_lifetime_xxx")}>
          Buy Lifetime Access
        </button>
      </div>
    </div>
  );
}
```

## Server-Side API Usage

### Server Actions (Next.js App Router)

```typescript
"use server";

import { auth } from "./auth";
import { headers } from "next/headers";

export async function createCheckoutSession(productId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Not authenticated");
  }

  const result = await auth.api.createCheckout({
    body: {
      productId,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    },
    headers: await headers(),
  });

  return result;
}

export async function getActiveSubscriptions() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return [];
  }

  const result = await auth.api.listActiveSubscriptions({
    headers: await headers(),
  });

  return result;
}
```

## Webhook Event Handlers

```typescript
import { betterAuth } from "better-auth";
import { creem } from "@better-auth/creem";

export const auth = betterAuth({
  plugins: [
    creem({
      apiKey: process.env.CREEM_API_KEY!,
      webhookSecret: process.env.CREEM_WEBHOOK_SECRET,
      checkout: {
        async onCheckoutComplete({ order, product, subscription, event }) {
          console.log("Checkout completed!");
          console.log("Product:", product);
          console.log("Order:", order);
          
          if (product.billing_type === "recurring" && subscription) {
            // Recurring subscription
            await sendWelcomeEmail(subscription.referenceId);
            await grantSubscriptionAccess(subscription);
          } else {
            // One-time purchase
            await grantLifetimeAccess(order.customer);
            await sendPurchaseConfirmation(order.customer);
          }
        },
        async onSubscriptionUpdate({ subscription, event }) {
          console.log("Subscription updated!");
          console.log("New status:", subscription.status);
          
          if (subscription.status === "past_due") {
            await sendPaymentFailureEmail(subscription.referenceId);
          }
        },
        async onSubscriptionCancel({ subscription }) {
          console.log("Subscription canceled!");
          await revokeAccess(subscription.referenceId);
          await sendCancellationEmail(subscription.referenceId);
        },
        async onSubscriptionDeleted({ subscription, event }) {
          console.log("Subscription deleted/expired!");
          await cleanupResources(subscription.referenceId);
        },
      },
      // Global event handler for all webhook events
      async onEvent(event) {
        console.log("Creem event received:", event.eventType);
        // Log to analytics, monitoring, etc.
        await logToAnalytics(event);
      },
    }),
  ],
});
```


## Environment Variables

```bash
# .env
CREEM_API_KEY=creem_xxx
CREEM_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Webhook Setup

1. Go to your Creem dashboard
2. Navigate to Developers > Webhooks
3. Add a new webhook endpoint: `https://yourdomain.com/api/auth/creem/webhook`
4. Select the events you want to receive
5. Copy the webhook secret and add it to your `.env` file

## Testing Webhooks Locally

Use a tool like [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3000
```

Then use the ngrok URL in your Creem webhook configuration:

```
https://your-ngrok-url.ngrok.io/api/auth/creem/webhook
```

## Handling Different Product Types

### One-Time Products (e.g., Lifetime Access)

```typescript
// Product in Creem: billing_type = "one_time"

async function buyLifetimeAccess() {
  const result = await authClient.checkout.create({
    productId: "prod_lifetime_access_xxx",
    successUrl: "/dashboard",
    cancelUrl: "/pricing",
  });

  if (result.data?.checkout_url) {
    window.location.href = result.data.checkout_url;
  }
}

// In your webhook handler
checkout: {
  async onCheckoutComplete({ order, product }) {
    if (product.billing_type === "one_time") {
      // Grant lifetime access
      await grantLifetimeAccess(order.customer);
    }
  }
}
```

### Recurring Subscriptions (e.g., Monthly/Yearly)

```typescript
// Product in Creem: billing_type = "recurring", billing_period = "every-month"

async function subscribeMonthly() {
  const result = await authClient.checkout.create({
    productId: "prod_monthly_xxx",
    successUrl: "/dashboard",
    cancelUrl: "/pricing",
  });

  if (result.data?.checkout_url) {
    window.location.href = result.data.checkout_url;
  }
}

// In your webhook handler
checkout: {
  async onCheckoutComplete({ order, product, subscription }) {
    if (product.billing_type === "recurring" && subscription) {
      // Grant subscription access
      await grantSubscriptionAccess(subscription);
      
      // Track billing period
      console.log("Period ends:", subscription.periodEnd);
    }
  }
}
```

## Best Practices

1. **Create Products in Creem Dashboard** - Always create and configure products in your Creem dashboard first
2. **Use Environment Variables** - Store product IDs in environment variables for easy management
3. **Handle Both Product Types** - Design your app to handle both one-time and recurring products
4. **Test Webhooks Thoroughly** - Use ngrok or similar tools to test webhooks locally
5. **Monitor Subscription Status** - Regularly check subscription status and handle edge cases
6. **Graceful Error Handling** - Always handle API errors gracefully with user-friendly messages

## Common Patterns

### Check if User Has Active Subscription

```typescript
async function hasActiveSubscription(productId: string): Promise<boolean> {
  const response = await authClient.subscription.list();
  const subscriptions = response.data || [];
  
  return subscriptions.some(
    sub => sub.productId === productId && sub.status === "active"
  );
}
```

### Get Subscription by Product ID

```typescript
async function getSubscriptionByProduct(productId: string) {
  const response = await authClient.subscription.list();
  const subscriptions = response.data || [];
  
  return subscriptions.find(sub => sub.productId === productId);
}
```

### Handle Multiple Products

```typescript
const PRODUCTS = {
  BASIC: "prod_basic_xxx",
  PRO: "prod_pro_xxx",
  ENTERPRISE: "prod_enterprise_xxx",
  LIFETIME: "prod_lifetime_xxx",
};

async function createCheckout(productKey: keyof typeof PRODUCTS) {
  const productId = PRODUCTS[productKey];
  
  const result = await authClient.checkout.create({
    productId,
    successUrl: "/success",
    cancelUrl: "/pricing",
  });

  if (result.data?.checkout_url) {
    window.location.href = result.data.checkout_url;
  }
}
```
