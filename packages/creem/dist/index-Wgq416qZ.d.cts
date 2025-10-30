import * as better_call0 from "better-call";
import * as better_auth0 from "better-auth";
import { GenericEndpointContext, InferOptionSchema, Session, User } from "better-auth";
import * as z from "zod/v4";

//#region src/schema.d.ts
declare const subscriptions: {
  subscription: {
    fields: {
      productId: {
        type: "string";
        required: true;
      };
      referenceId: {
        type: "string";
        required: true;
      };
      creemCustomerId: {
        type: "string";
        required: false;
      };
      creemSubscriptionId: {
        type: "string";
        required: false;
      };
      creemOrderId: {
        type: "string";
        required: false;
      };
      status: {
        type: "string";
        defaultValue: string;
      };
      periodStart: {
        type: "date";
        required: false;
      };
      periodEnd: {
        type: "date";
        required: false;
      };
      cancelAtPeriodEnd: {
        type: "boolean";
        required: false;
        defaultValue: false;
      };
    };
  };
};
declare const user: {
  user: {
    fields: {
      creemCustomerId: {
        type: "string";
        required: false;
      };
    };
  };
};
//#endregion
//#region src/types.d.ts
interface Subscription {
  /**
   * Database identifier
   */
  id: string;
  /**
   * Creem Product ID
   */
  productId: string;
  /**
   * Creem customer id
   */
  creemCustomerId?: string | undefined;
  /**
   * Creem subscription id (only for recurring products)
   */
  creemSubscriptionId?: string | undefined;
  /**
   * Creem order id
   */
  creemOrderId?: string | undefined;
  /**
   * To what reference id the subscription belongs to
   * @example
   * - userId for a user
   * - workspace id for a saas platform
   * - website id for a hosting platform
   *
   * @default - userId
   */
  referenceId: string;
  /**
   * Subscription status
   * Based on Creem's subscription statuses
   */
  status: "active" | "canceled" | "past_due" | "paused" | "trialing" | "expired" | "pending";
  /**
   * The billing cycle start date (only for recurring products)
   */
  periodStart?: Date | undefined;
  /**
   * The billing cycle end date (only for recurring products)
   */
  periodEnd?: Date | undefined;
  /**
   * Cancel at period end (only for recurring products)
   */
  cancelAtPeriodEnd?: boolean | undefined;
}
type CheckoutOptions = {
  /**
   * Require email verification before a user is allowed to create checkouts
   *
   * @default false
   */
  requireEmailVerification?: boolean | undefined;
  /**
   * A callback to run after a checkout is completed
   * @param event - Creem Event
   * @param order - Order Data
   * @param subscription - Subscription Data (only for recurring products)
   * @returns
   */
  onCheckoutComplete?: ((data: {
    event: CreemWebhookEvent;
    order: CreemOrder;
    subscription?: Subscription;
    product: CreemProduct;
  }, ctx: GenericEndpointContext) => Promise<void>) | undefined;
  /**
   * A callback to run after a subscription is updated (only for recurring products)
   * @returns
   */
  onSubscriptionUpdate?: ((data: {
    event: CreemWebhookEvent;
    subscription: Subscription;
  }) => Promise<void>) | undefined;
  /**
   * A callback to run after a subscription is canceled (only for recurring products)
   * @returns
   */
  onSubscriptionCancel?: ((data: {
    event?: CreemWebhookEvent;
    subscription: Subscription;
  }) => Promise<void>) | undefined;
  /**
   * A function to check if the reference id is valid
   * and belongs to the user
   *
   * @param data - data containing user, session and referenceId
   * @param ctx - the context object
   * @returns
   */
  authorizeReference?: ((data: {
    user: User & Record<string, any>;
    session: Session & Record<string, any>;
    referenceId: string;
    action: "create-checkout" | "list-subscription" | "cancel-subscription" | "billing-portal";
  }, ctx: GenericEndpointContext) => Promise<boolean>) | undefined;
  /**
   * A callback to run after a subscription has been deleted (only for recurring products)
   * @returns
   */
  onSubscriptionDeleted?: ((data: {
    event: CreemWebhookEvent;
    subscription: Subscription;
  }) => Promise<void>) | undefined;
  /**
   * parameters for checkout create params
   *
   * @param data - data containing user, session and product
   * @param req - the request object
   * @param ctx - the context object
   */
  getCheckoutParams?: ((data: {
    user: User & Record<string, any>;
    session: Session & Record<string, any>;
    productId: string;
    subscription?: Subscription;
  }, req: GenericEndpointContext["request"], ctx: GenericEndpointContext) => Promise<{
    params?: Record<string, any>;
  }> | {
    params?: Record<string, any>;
  }) | undefined;
};
interface CreemOptions {
  /**
   * Creem API Key
   */
  apiKey: string;
  /**
   * Creem Webhook Secret (for signature verification)
   */
  webhookSecret?: string;
  /**
   * Creem API Base URL
   * @default "https://api.creem.io"
   */
  apiBaseUrl?: string;
  /**
   * Enable customer creation when a user signs up
   */
  createCustomerOnSignUp?: boolean | undefined;
  /**
   * A callback to run after a customer has been created
   * @param customer - Customer Data
   * @param creemCustomer - Creem Customer Data
   * @returns
   */
  onCustomerCreate?: ((data: {
    creemCustomer: CreemCustomer;
    user: User & {
      creemCustomerId: string;
    };
  }, ctx: GenericEndpointContext) => Promise<void>) | undefined;
  /**
   * Checkout configuration (supports both one-time payments and subscriptions)
   */
  checkout?: CheckoutOptions | undefined;
  /**
   * A callback to run after a creem event is received
   * @param event - Creem Event
   * @returns
   */
  onEvent?: ((event: CreemWebhookEvent) => Promise<void>) | undefined;
  /**
   * Schema for the creem plugin
   */
  schema?: InferOptionSchema<typeof subscriptions & typeof user> | undefined;
}
interface CreemCustomer {
  id: string;
  object?: "customer";
  email: string;
  name?: string;
  country?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  mode?: string;
}
interface CreemProduct {
  id: string;
  object?: "product";
  name: string;
  description?: string;
  image_url?: string | null;
  price: number;
  currency: string;
  billing_type: "one_time" | "recurring";
  billing_period?: "every-month" | "every-year" | "every-week" | "every-day";
  status?: "active" | "inactive";
  tax_mode?: "inclusive" | "exclusive";
  tax_category?: string;
  default_success_url?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  mode?: string;
}
interface CreemOrder {
  id: string;
  customer: string;
  product: string;
  subscription?: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "completed" | "refunded" | "canceled";
  type?: "recurring" | "one_time";
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  mode?: string;
}
interface CreemSubscription {
  id: string;
  object?: "subscription";
  product?: string | CreemProduct;
  customer?: string | CreemCustomer;
  collection_method?: "charge_automatically";
  status: "active" | "canceled" | "past_due" | "paused" | "trialing" | "expired";
  current_period_start_date?: string;
  current_period_end_date?: string;
  canceled_at?: string | null;
  items?: Array<{
    object: "subscription_item";
    id: string;
    product_id: string;
    price_id: string;
    units: number;
    created_at: string;
    updated_at: string;
    mode?: string;
  }>;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  mode?: string;
}
interface CreemWebhookEvent {
  id: string;
  eventType: "checkout.completed" | "subscription.active" | "subscription.paid" | "subscription.canceled" | "subscription.expired" | "refund.created" | "dispute.created" | "subscription.update" | "subscription.trialing" | "subscription.paused";
  created_at: number;
  object: {
    id?: string;
    request_id?: string;
    order?: CreemOrder;
    product?: CreemProduct;
    customer?: CreemCustomer;
    subscription?: CreemSubscription;
    custom_fields?: any[];
    status?: string;
    metadata?: Record<string, any>;
    mode?: string;
    [key: string]: any;
  };
  mode?: string;
}
//#endregion
//#region src/index.d.ts
declare const creem: <O extends CreemOptions>(options: O) => {
  id: "creem";
  endpoints: {
    createCheckout: better_call0.StrictEndpoint<"/checkout/create", {
      method: "POST";
      body: z.ZodObject<{
        productId: z.ZodString;
        referenceId: z.ZodOptional<z.ZodString>;
        subscriptionId: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        successUrl: z.ZodDefault<z.ZodString>;
        cancelUrl: z.ZodDefault<z.ZodString>;
        disableRedirect: z.ZodDefault<z.ZodBoolean>;
      }, z.core.$strip>;
      use: (((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<{
        session: {
          session: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            token: string;
            ipAddress?: string | null | undefined;
            userAgent?: string | null | undefined;
          };
          user: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            emailVerified: boolean;
            name: string;
            image?: string | null | undefined;
          };
        };
      }>) | ((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<void>))[];
    } & {
      use: any[];
    }, {
      redirect: boolean;
      id: string;
      checkout_url: string;
      product_id: string;
      customer_email?: string;
      status?: "pending" | "completed" | "expired";
      metadata?: Record<string, any>;
      success_url?: string;
      cancel_url?: string;
      request_id?: string;
    }>;
    cancelSubscription: better_call0.StrictEndpoint<"/subscription/cancel", {
      method: "POST";
      body: z.ZodObject<{
        referenceId: z.ZodOptional<z.ZodString>;
        subscriptionId: z.ZodOptional<z.ZodString>;
      }, z.core.$strip>;
      use: (((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<{
        session: {
          session: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            token: string;
            ipAddress?: string | null | undefined;
            userAgent?: string | null | undefined;
          };
          user: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            emailVerified: boolean;
            name: string;
            image?: string | null | undefined;
          };
        };
      }>) | ((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<void>))[];
    } & {
      use: any[];
    }, {
      success: boolean;
    }>;
    listActiveSubscriptions: better_call0.StrictEndpoint<"/subscription/list", {
      method: "GET";
      query: z.ZodOptional<z.ZodObject<{
        referenceId: z.ZodOptional<z.ZodString>;
      }, z.core.$strip>>;
      use: (((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<{
        session: {
          session: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            token: string;
            ipAddress?: string | null | undefined;
            userAgent?: string | null | undefined;
          };
          user: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            emailVerified: boolean;
            name: string;
            image?: string | null | undefined;
          };
        };
      }>) | ((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<void>))[];
    } & {
      use: any[];
    }, Subscription[]>;
    checkoutSuccess: better_call0.StrictEndpoint<"/checkout/success", {
      method: "GET";
      query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
      use: ((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<void>)[];
    } & {
      use: any[];
    }, {
      status: ("NOT_FOUND" | "FOUND" | "OK" | "CREATED" | "ACCEPTED" | "NO_CONTENT" | "MULTIPLE_CHOICES" | "MOVED_PERMANENTLY" | "SEE_OTHER" | "NOT_MODIFIED" | "TEMPORARY_REDIRECT" | "BAD_REQUEST" | "UNAUTHORIZED" | "PAYMENT_REQUIRED" | "FORBIDDEN" | "METHOD_NOT_ALLOWED" | "NOT_ACCEPTABLE" | "PROXY_AUTHENTICATION_REQUIRED" | "REQUEST_TIMEOUT" | "CONFLICT" | "GONE" | "LENGTH_REQUIRED" | "PRECONDITION_FAILED" | "PAYLOAD_TOO_LARGE" | "URI_TOO_LONG" | "UNSUPPORTED_MEDIA_TYPE" | "RANGE_NOT_SATISFIABLE" | "EXPECTATION_FAILED" | "I'M_A_TEAPOT" | "MISDIRECTED_REQUEST" | "UNPROCESSABLE_ENTITY" | "LOCKED" | "FAILED_DEPENDENCY" | "TOO_EARLY" | "UPGRADE_REQUIRED" | "PRECONDITION_REQUIRED" | "TOO_MANY_REQUESTS" | "REQUEST_HEADER_FIELDS_TOO_LARGE" | "UNAVAILABLE_FOR_LEGAL_REASONS" | "INTERNAL_SERVER_ERROR" | "NOT_IMPLEMENTED" | "BAD_GATEWAY" | "SERVICE_UNAVAILABLE" | "GATEWAY_TIMEOUT" | "HTTP_VERSION_NOT_SUPPORTED" | "VARIANT_ALSO_NEGOTIATES" | "INSUFFICIENT_STORAGE" | "LOOP_DETECTED" | "NOT_EXTENDED" | "NETWORK_AUTHENTICATION_REQUIRED") | better_call0.Status;
      body: ({
        message?
        /**
        * Any additional metadata
        */
        : string;
        code?: string;
        cause?: unknown;
      } & Record<string, any>) | undefined;
      headers: HeadersInit;
      statusCode: number;
      name: string;
      message: string;
      stack?: string;
      cause?: unknown;
    }>;
    createBillingPortal: better_call0.StrictEndpoint<"/subscription/billing-portal", {
      method: "POST";
      body: z.ZodObject<{
        referenceId: z.ZodOptional<z.ZodString>;
        returnUrl: z.ZodDefault<z.ZodString>;
      }, z.core.$strip>;
      use: (((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<{
        session: {
          session: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            token: string;
            ipAddress?: string | null | undefined;
            userAgent?: string | null | undefined;
          };
          user: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            emailVerified: boolean;
            name: string;
            image?: string | null | undefined;
          };
        };
      }>) | ((inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<void>))[];
    } & {
      use: any[];
    }, {
      url: any;
      redirect: boolean;
    }>;
    creemWebhook: better_call0.StrictEndpoint<"/creem/webhook", {
      method: "POST";
      metadata: {
        isAction: boolean;
      };
      cloneRequest: true;
      disableBody: true;
    } & {
      use: any[];
    }, {
      success: boolean;
    }>;
  };
  init(ctx: better_auth0.AuthContext): {
    options: {
      databaseHooks: {
        user: {
          create: {
            after(user: {
              id: string;
              createdAt: Date;
              updatedAt: Date;
              email: string;
              emailVerified: boolean;
              name: string;
              image?: string | null | undefined;
            } & Record<string, unknown>, ctx: GenericEndpointContext | undefined): Promise<void>;
          };
          update: {
            after(user: {
              id: string;
              createdAt: Date;
              updatedAt: Date;
              email: string;
              emailVerified: boolean;
              name: string;
              image?: string | null | undefined;
            } & Record<string, unknown>, ctx: GenericEndpointContext | undefined): Promise<void>;
          };
        };
      };
    };
  };
  schema: {
    user: {
      fields: {
        creemCustomerId: {
          type: "string";
          required: false;
        };
      };
    };
    subscription: {
      fields: {
        productId: {
          type: "string";
          required: true;
        };
        referenceId: {
          type: "string";
          required: true;
        };
        creemCustomerId: {
          type: "string";
          required: false;
        };
        creemSubscriptionId: {
          type: "string";
          required: false;
        };
        creemOrderId: {
          type: "string";
          required: false;
        };
        status: {
          type: "string";
          defaultValue: string;
        };
        periodStart: {
          type: "date";
          required: false;
        };
        periodEnd: {
          type: "date";
          required: false;
        };
        cancelAtPeriodEnd: {
          type: "boolean";
          required: false;
          defaultValue: false;
        };
      };
    };
  };
  $ERROR_CODES: {
    readonly SUBSCRIPTION_NOT_FOUND: "Subscription not found";
    readonly ALREADY_SUBSCRIBED_PRODUCT: "You're already subscribed to this product";
    readonly EMAIL_VERIFICATION_REQUIRED: "Email verification is required before you can create a checkout";
    readonly SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active";
  };
};
type CreemPlugin<O extends CreemOptions> = ReturnType<typeof creem<O>>;
//#endregion
export { creem as n, Subscription as r, CreemPlugin as t };