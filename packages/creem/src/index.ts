import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { defineErrorCodes } from "@better-auth/core/utils";
import {
	type BetterAuthPlugin,
	type GenericEndpointContext,
	logger,
} from "better-auth";
import {
	APIError,
	getSessionFromCtx,
	originCheck,
	sessionMiddleware,
} from "better-auth/api";
import * as z from "zod/v4";
import {
	onCheckoutCompleted,
	onSubscriptionActive,
	onSubscriptionPaid,
	onSubscriptionUpdate,
	onSubscriptionCanceled,
	onSubscriptionExpired,
	onSubscriptionTrialing,
	onSubscriptionPaused,
} from "./hooks";
import { getSchema } from "./schema";
import type {
	CreemCheckout,
	CreemCustomer,
	CreemOptions,
	CreemWebhookEvent,
	InputSubscription,
	Subscription,
	CheckoutOptions,
} from "./types";
import { creemApiRequest } from "./utils";

const CREEM_ERROR_CODES = defineErrorCodes({
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	ALREADY_SUBSCRIBED_PRODUCT: "You're already subscribed to this product",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can create a checkout",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
});

const getUrl = (ctx: GenericEndpointContext, url: string) => {
	if (url.startsWith("http")) {
		return url;
	}
	return `${ctx.context.options.baseURL}${
		url.startsWith("/") ? url : `/${url}`
	}`;
};

export const creem = <O extends CreemOptions>(options: O) => {
	const checkoutOptions = options.checkout as CheckoutOptions;

	const referenceMiddleware = (
		action:
			| "create-checkout"
			| "list-subscription"
			| "cancel-subscription"
			| "billing-portal",
	) =>
		createAuthMiddleware(async (ctx) => {
			const session = ctx.context.session;
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}
			const referenceId =
				ctx.body?.referenceId || ctx.query?.referenceId || session.user.id;

			if (ctx.body?.referenceId && !checkoutOptions?.authorizeReference) {
				logger.error(
					`Passing referenceId into an action isn't allowed if checkout.authorizeReference isn't defined in your creem plugin config.`,
				);
				throw new APIError("BAD_REQUEST", {
					message:
						"Reference id is not allowed. Read server logs for more details.",
				});
			}

			const sameReference =
				ctx.query?.referenceId === session.user.id ||
				ctx.body?.referenceId === session.user.id;
			const isAuthorized =
				ctx.body?.referenceId || ctx.query?.referenceId
					? (await checkoutOptions?.authorizeReference?.(
							{
								user: session.user,
								session: session.session,
								referenceId,
								action,
							},
							ctx,
						)) || sameReference
					: true;
			if (!isAuthorized) {
				throw new APIError("UNAUTHORIZED", {
					message: "Unauthorized",
				});
			}
		});

	const endpoints = {
		/**
		 * ### Endpoint
		 *
		 * POST `/checkout/create`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.createCheckout`
		 *
		 * **client:**
		 * `authClient.checkout.create`
		 *
		 * Creates a Creem checkout session for a product (one-time or subscription)
		 */
		createCheckout: createAuthEndpoint(
			"/checkout/create",
			{
				method: "POST",
				body: z.object({
					/**
					 * The Creem product ID
					 */
					productId: z.string().meta({
						description: 'The Creem product ID. Eg: "prod_xxx"',
					}),
					/**
					 * Reference id (e.g., for organization subscriptions)
					 */
					referenceId: z
						.string()
						.meta({
							description: 'Reference id. Eg: "org_123"',
						})
						.optional(),
					/**
					 * Subscription id (for updating existing subscriptions)
					 */
					subscriptionId: z
						.string()
						.meta({
							description: 'Existing subscription ID. Eg: "sub_123"',
						})
						.optional(),
					/**
					 * Any additional metadata
					 */
					metadata: z.record(z.string(), z.any()).optional(),
					/**
					 * Success URL
					 */
					successUrl: z
						.string()
						.meta({
							description: 'Success redirect URL. Eg: "https://example.com/success"',
						})
						.default("/"),
					/**
					 * Cancel URL
					 */
					cancelUrl: z
						.string()
						.meta({
							description: 'Cancel redirect URL. Eg: "https://example.com/pricing"',
						})
						.default("/"),
					/**
					 * Disable Redirect
					 */
					disableRedirect: z
						.boolean()
						.meta({
							description: "Disable automatic redirect. Eg: true",
						})
						.default(false),
				}),
				use: [
					sessionMiddleware,
					originCheck((c) => {
						return [c.body.successURL as string, c.body.cancelURL as string];
					}),
					referenceMiddleware("create-checkout"),
				],
			},
			async (ctx) => {
				const { user, session } = ctx.context.session;
				if (!user.emailVerified && checkoutOptions?.requireEmailVerification) {
					throw new APIError("BAD_REQUEST", {
						message: CREEM_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
					});
				}

				const referenceId = ctx.body.referenceId || user.id;
				const productId = ctx.body.productId;

				// Check for existing subscription to this product
				const existingSubscription = ctx.body.subscriptionId
					? await ctx.context.adapter.findOne<Subscription>({
							model: "subscription",
							where: [
								{
									field: "id",
									value: ctx.body.subscriptionId,
								},
							],
						})
					: await ctx.context.adapter.findOne<Subscription>({
							model: "subscription",
							where: [
								{ field: "referenceId", value: referenceId },
								{ field: "productId", value: productId },
							],
						});

				// Note: Creem automatically creates customers when they complete checkout
				// There's no explicit POST /v1/customers endpoint in Creem's API
				const customerId =
					existingSubscription?.creemCustomerId || user.creemCustomerId;

				// Check if already subscribed to this product
				const activeSubscriptions = await ctx.context.adapter.findMany<Subscription>({
					model: "subscription",
					where: [
						{ field: "referenceId", value: referenceId },
						{ field: "productId", value: productId },
						{ field: "status", value: "active" },
					],
				});

				if (activeSubscriptions.length > 0 && !ctx.body.subscriptionId) {
					throw new APIError("BAD_REQUEST", {
						message: CREEM_ERROR_CODES.ALREADY_SUBSCRIBED_PRODUCT,
					});
				}

				// Create or find subscription record
				let subscription: Subscription | undefined = existingSubscription;

				if (!subscription) {
					subscription = await ctx.context.adapter.create<
						InputSubscription,
						Subscription
					>({
						model: "subscription",
						data: {
							productId,
							creemCustomerId: customerId,
							status: "pending",
							referenceId,
						},
					});
				}

				if (!subscription) {
					ctx.context.logger.error("Subscription ID not found");
					throw new APIError("INTERNAL_SERVER_ERROR");
				}

				const params = await checkoutOptions?.getCheckoutParams?.(
					{
						user,
						session,
						productId,
						subscription,
					},
					ctx.request,
					ctx,
				);

				// Create checkout session with Creem API
				// Ref: https://docs.creem.io/api-reference/endpoint/create-checkout
				try {
					const checkoutSession: CreemCheckout = await creemApiRequest(
						options.apiKey,
						"/v1/checkouts",
						{
							method: "POST",
							body: {
								product_id: productId,
								customer_email: user.email,
								success_url: getUrl(
									ctx,
									`${
										ctx.context.baseURL
									}/checkout/success?callbackURL=${encodeURIComponent(
										ctx.body.successUrl,
									)}&subscriptionId=${encodeURIComponent(subscription.id)}`,
								),
								cancel_url: getUrl(ctx, ctx.body.cancelUrl),
								metadata: {
									userId: user.id,
									subscriptionId: subscription.id,
									referenceId,
									...params?.params?.metadata,
									...ctx.body.metadata,
								},
								...params?.params,
							},
							apiBaseUrl: options.apiBaseUrl,
						},
					);

					return ctx.json({
						...checkoutSession,
						redirect: !ctx.body.disableRedirect,
					});
				} catch (error: any) {
					ctx.context.logger.error("Error creating checkout session", error);
					throw new APIError("BAD_REQUEST", {
						message: error.message || "Failed to create checkout session",
					});
				}
			},
		),
		/**
		 * ### Endpoint
		 *
		 * POST `/subscription/cancel`
		 *
		 * Cancels a recurring subscription
		 */
		cancelSubscription: createAuthEndpoint(
			"/subscription/cancel",
			{
				method: "POST",
				body: z.object({
					referenceId: z.string().optional(),
					subscriptionId: z.string().optional(),
				}),
				use: [sessionMiddleware, referenceMiddleware("cancel-subscription")],
			},
			async (ctx) => {
				const referenceId =
					ctx.body?.referenceId || ctx.context.session.user.id;
				const subscription = ctx.body.subscriptionId
					? await ctx.context.adapter.findOne<Subscription>({
							model: "subscription",
							where: [
								{
									field: "id",
									value: ctx.body.subscriptionId,
								},
							],
						})
					: await ctx.context.adapter
							.findMany<Subscription>({
								model: "subscription",
								where: [{ field: "referenceId", value: referenceId }],
							})
							.then((subs) => subs.find((sub) => sub.status === "active"));

				if (!subscription || !subscription.creemSubscriptionId) {
					throw ctx.error("BAD_REQUEST", {
						message: CREEM_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
					});
				}

				try {
					// Cancel subscription via Creem API
					await creemApiRequest(
						options.apiKey,
						`/v1/subscriptions/${subscription.creemSubscriptionId}/cancel`,
						{
							method: "POST",
							apiBaseUrl: options.apiBaseUrl,
						},
					);

					// Update local database
					await ctx.context.adapter.update({
						model: "subscription",
						update: {
							cancelAtPeriodEnd: true,
							updatedAt: new Date(),
						},
						where: [
							{
								field: "id",
								value: subscription.id,
							},
						],
					});

					await checkoutOptions?.onSubscriptionCancel?.({
						subscription,
					});

					return ctx.json({ success: true });
				} catch (error: any) {
					ctx.context.logger.error("Error canceling subscription", error);
					throw new APIError("BAD_REQUEST", {
						message: error.message,
					});
				}
			},
		),
		/**
		 * ### Endpoint
		 *
		 * GET `/subscription/list`
		 *
		 * Lists active subscriptions for a reference ID
		 */
		listActiveSubscriptions: createAuthEndpoint(
			"/subscription/list",
			{
				method: "GET",
				query: z.optional(
					z.object({
						referenceId: z.string().optional(),
					}),
				),
				use: [sessionMiddleware, referenceMiddleware("list-subscription")],
			},
			async (ctx) => {
				const subscriptions = await ctx.context.adapter.findMany<Subscription>({
					model: "subscription",
					where: [
						{
							field: "referenceId",
							value: ctx.query?.referenceId || ctx.context.session.user.id,
						},
					],
				});

				const activeSubs = subscriptions.filter(
					(sub) => sub.status === "active",
				);

				return ctx.json(activeSubs);
			},
		),
		checkoutSuccess: createAuthEndpoint(
			"/checkout/success",
			{
				method: "GET",
				query: z.record(z.string(), z.any()).optional(),
				use: [originCheck((ctx) => ctx.query.callbackURL)],
			},
			async (ctx) => {
				if (!ctx.query || !ctx.query.callbackURL || !ctx.query.subscriptionId) {
					throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
				}
				const session = await getSessionFromCtx<{ creemCustomerId: string }>(
					ctx,
				);
				if (!session) {
					throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
				}
				const { user } = session;
				const { callbackURL, subscriptionId } = ctx.query;

				const subscription = await ctx.context.adapter.findOne<Subscription>({
					model: "subscription",
					where: [
						{
							field: "id",
							value: subscriptionId,
						},
					],
				});

				if (subscription?.status === "active") {
					return ctx.redirect(getUrl(ctx, callbackURL));
				}

				// Try to fetch updated subscription status from Creem
				const customerId =
					subscription?.creemCustomerId || user.creemCustomerId;

				if (customerId && subscription?.creemSubscriptionId) {
					try {
						const creemSubscription = await creemApiRequest(
							options.apiKey,
							`/v1/subscriptions/${subscription.creemSubscriptionId}`,
							{
								method: "GET",
								apiBaseUrl: options.apiBaseUrl,
							},
						);

						if (creemSubscription) {
							await ctx.context.adapter.update({
								model: "subscription",
								update: {
									status: creemSubscription.status || "active",
									...(creemSubscription.current_period_start_date && {
										periodStart: new Date(
											creemSubscription.current_period_start_date,
										),
									}),
									...(creemSubscription.current_period_end_date && {
										periodEnd: new Date(creemSubscription.current_period_end_date),
									}),
								},
								where: [
									{
										field: "id",
										value: subscription.id,
									},
								],
							});
						}
					} catch (error) {
						ctx.context.logger.error(
							"Error fetching subscription from Creem",
							error,
						);
					}
				}
				throw ctx.redirect(getUrl(ctx, callbackURL));
			},
		),
		createBillingPortal: createAuthEndpoint(
			"/subscription/billing-portal",
			{
				method: "POST",
				body: z.object({
					referenceId: z.string().optional(),
					returnUrl: z.string().default("/"),
				}),
				use: [
					sessionMiddleware,
					originCheck((ctx) => ctx.body.returnUrl),
					referenceMiddleware("billing-portal"),
				],
			},
			async (ctx) => {
				const { user } = ctx.context.session;
				const referenceId = ctx.body.referenceId || user.id;

				let customerId = user.creemCustomerId;

				if (!customerId) {
					const subscription = await ctx.context.adapter
						.findMany<Subscription>({
							model: "subscription",
							where: [
								{
									field: "referenceId",
									value: referenceId,
								},
							],
						})
						.then((subs) => subs.find((sub) => sub.status === "active"));

					customerId = subscription?.creemCustomerId;
				}

				if (!customerId) {
					throw new APIError("BAD_REQUEST", {
						message: "No Creem customer found for this user",
					});
				}

				try {
					// Create billing portal session
					const billingSession = await creemApiRequest(
						options.apiKey,
						"/v1/customers/billing",
						{
							method: "POST",
							body: {
								customer_id: customerId,
								return_url: getUrl(ctx, ctx.body.returnUrl),
							},
							apiBaseUrl: options.apiBaseUrl,
						},
					);

					return ctx.json({
						url: billingSession.url,
						redirect: true,
					});
				} catch (error: any) {
					ctx.context.logger.error(
						"Error creating billing portal session",
						error,
					);
					throw new APIError("BAD_REQUEST", {
						message: error.message,
					});
				}
			},
		),
	} as const;

	return {
		id: "creem",
		endpoints: {
			creemWebhook: createAuthEndpoint(
				"/creem/webhook",
				{
					method: "POST",
					metadata: {
						isAction: false,
					},
					cloneRequest: true,
					disableBody: true,
				},
				async (ctx) => {
					if (!ctx.request?.body) {
						throw new APIError("INTERNAL_SERVER_ERROR");
					}

					const buf = await ctx.request.text();
					const signature = ctx.request.headers.get("x-creem-signature");

					// Verify webhook signature if secret is provided
					if (options.webhookSecret) {
						if (!signature) {
							throw new APIError("BAD_REQUEST", {
								message: "Missing webhook signature",
							});
						}
						// Note: Implement actual signature verification based on Creem's documentation
					}

					let event: CreemWebhookEvent;
					try {
						event = JSON.parse(buf);
					} catch (err: any) {
						ctx.context.logger.error(`${err.message}`);
						throw new APIError("BAD_REQUEST", {
							message: `Webhook Error: ${err.message}`,
						});
					}

					if (!event) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to parse event",
						});
					}

					try {
						// Creem uses 'eventType' not 'type' - Ref: https://docs.creem.io/learn/webhooks/event-types
						switch (event.eventType) {
							case "checkout.completed":
								await onCheckoutCompleted(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "subscription.active":
								await onSubscriptionActive(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "subscription.paid":
								await onSubscriptionPaid(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "subscription.update":
								await onSubscriptionUpdate(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "subscription.canceled":
								await onSubscriptionCanceled(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "subscription.expired":
								await onSubscriptionExpired(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "subscription.trialing":
								await onSubscriptionTrialing(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "subscription.paused":
								await onSubscriptionPaused(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "refund.created":
							case "dispute.created":
								// These events are not yet handled but can be in the future
								await options.onEvent?.(event);
								break;
							default:
								await options.onEvent?.(event);
								break;
						}
					} catch (e: any) {
						ctx.context.logger.error(
							`Creem webhook failed. Error: ${e.message}`,
						);
						throw new APIError("BAD_REQUEST", {
							message: "Webhook error: See server logs for more information.",
						});
					}

					return ctx.json({ success: true });
				},
			),
			...endpoints,
		},
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async after(user, ctx) {
									// Note: Creem doesn't have a direct customer creation API
									// Customers are automatically created when they complete a checkout
									// with their email address. The createCustomerOnSignUp option is
									// not applicable for Creem and will be ignored.
									if (ctx && options.createCustomerOnSignUp) {
										ctx.context.logger.warn(
											"createCustomerOnSignUp is not supported by Creem. Customers are created automatically during checkout.",
										);
									}
								},
							},
							update: {
								async after(user, ctx) {
									// Note: Creem doesn't have a customer update API endpoint
									// Customer information is managed through Creem's dashboard
									if (!ctx) return;
								},
							},
						},
					},
				},
			};
		},
		schema: getSchema(options),
		$ERROR_CODES: CREEM_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export type CreemPlugin<O extends CreemOptions> = ReturnType<typeof creem<O>>;

export type { Subscription };
