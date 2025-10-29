import type {
	GenericEndpointContext,
	InferOptionSchema,
	Session,
	User,
} from "better-auth";
import type { subscriptions, user } from "./schema";

export interface Subscription {
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

export type CheckoutOptions = {
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
	onCheckoutComplete?:
		| ((
				data: {
					event: CreemWebhookEvent;
					order: CreemOrder;
					subscription?: Subscription;
					product: CreemProduct;
				},
				ctx: GenericEndpointContext,
		  ) => Promise<void>)
		| undefined;
	/**
	 * A callback to run after a subscription is updated (only for recurring products)
	 * @returns
	 */
	onSubscriptionUpdate?:
		| ((data: {
				event: CreemWebhookEvent;
				subscription: Subscription;
		  }) => Promise<void>)
		| undefined;
	/**
	 * A callback to run after a subscription is canceled (only for recurring products)
	 * @returns
	 */
	onSubscriptionCancel?:
		| ((data: {
				event?: CreemWebhookEvent;
				subscription: Subscription;
		  }) => Promise<void>)
		| undefined;
	/**
	 * A function to check if the reference id is valid
	 * and belongs to the user
	 *
	 * @param data - data containing user, session and referenceId
	 * @param ctx - the context object
	 * @returns
	 */
	authorizeReference?:
		| ((
				data: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
					referenceId: string;
					action:
						| "create-checkout"
						| "list-subscription"
						| "cancel-subscription"
						| "billing-portal";
				},
				ctx: GenericEndpointContext,
		  ) => Promise<boolean>)
		| undefined;
	/**
	 * A callback to run after a subscription has been deleted (only for recurring products)
	 * @returns
	 */
	onSubscriptionDeleted?:
		| ((data: {
				event: CreemWebhookEvent;
				subscription: Subscription;
		  }) => Promise<void>)
		| undefined;
	/**
	 * parameters for checkout create params
	 *
	 * @param data - data containing user, session and product
	 * @param req - the request object
	 * @param ctx - the context object
	 */
	getCheckoutParams?:
		| ((
				data: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
					productId: string;
					subscription?: Subscription;
				},
				req: GenericEndpointContext["request"],
				ctx: GenericEndpointContext,
		  ) =>
				| Promise<{
						params?: Record<string, any>;
				  }>
				| {
						params?: Record<string, any>;
				  })
		| undefined;
};

export interface CreemOptions {
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
	onCustomerCreate?:
		| ((
				data: {
					creemCustomer: CreemCustomer;
					user: User & { creemCustomerId: string };
				},
				ctx: GenericEndpointContext,
		  ) => Promise<void>)
		| undefined;
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

export interface InputSubscription extends Omit<Subscription, "id"> {}

// Creem API Types based on https://docs.creem.io/api-reference/introduction
export interface CreemCustomer {
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

export interface CreemProduct {
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

// Response from POST /v1/checkouts - Create Checkout Session
export interface CreemCheckout {
	id: string;
	checkout_url: string;
	product_id: string;
	customer_email?: string;
	status?: "pending" | "completed" | "expired";
	metadata?: Record<string, any>;
	success_url?: string;
	cancel_url?: string;
	request_id?: string; // Returned in response and webhooks
}

export interface CreemOrder {
	id: string;
	customer: string; // Customer ID
	product: string; // Product ID
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

// Creem Subscription response from GET /v1/subscriptions and webhooks
export interface CreemSubscription {
	id: string;
	object?: "subscription";
	product?: string | CreemProduct; // Can be ID string or full product object in webhooks
	customer?: string | CreemCustomer; // Can be ID string or full customer object in webhooks
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

// Webhook events based on https://docs.creem.io/learn/webhooks/event-types
export interface CreemWebhookEvent {
	id: string;
	eventType:
		| "checkout.completed"
		| "subscription.active"
		| "subscription.paid"
		| "subscription.canceled"
		| "subscription.expired"
		| "refund.created"
		| "dispute.created"
		| "subscription.update"
		| "subscription.trialing"
		| "subscription.paused";
	created_at: number; // Unix timestamp in milliseconds
	object: {
		// For checkout.completed
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
		// Allow for additional fields
		[key: string]: any;
	};
	mode?: string;
}

