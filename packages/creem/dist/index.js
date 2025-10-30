import { createAuthEndpoint, createAuthMiddleware } from "@better-auth/core/api";
import { defineErrorCodes } from "@better-auth/core/utils";
import { logger } from "better-auth";
import { APIError, getSessionFromCtx, originCheck, sessionMiddleware } from "better-auth/api";
import * as z from "zod/v4";
import { mergeSchema } from "better-auth/db";

//#region src/hooks.ts
/**
* Handle checkout.completed webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#checkout-completed
*/
async function onCheckoutCompleted(ctx, options, event) {
	try {
		const checkoutData = event.object;
		const order = checkoutData.order;
		const subscription = checkoutData.subscription;
		const product = checkoutData.product;
		if (!order || !product) {
			logger.warn("Order or product data missing from checkout.completed event");
			return;
		}
		const productId = typeof product === "object" ? product.id : order.product;
		const customerId = typeof checkoutData.customer === "object" ? checkoutData.customer.id : order.customer;
		const referenceId = checkoutData.metadata?.referenceId;
		const subscriptionId = checkoutData.metadata?.subscriptionId;
		if (referenceId && subscriptionId) {
			let dbSubscription = await ctx.context.adapter.update({
				model: "subscription",
				update: {
					productId,
					status: subscription ? "active" : "pending",
					updatedAt: /* @__PURE__ */ new Date(),
					creemOrderId: order.id,
					creemSubscriptionId: subscription?.id,
					creemCustomerId: customerId,
					...subscription && {
						periodStart: subscription.current_period_start_date ? new Date(subscription.current_period_start_date) : void 0,
						periodEnd: subscription.current_period_end_date ? new Date(subscription.current_period_end_date) : void 0
					}
				},
				where: [{
					field: "id",
					value: subscriptionId
				}]
			});
			if (!dbSubscription) dbSubscription = await ctx.context.adapter.findOne({
				model: "subscription",
				where: [{
					field: "id",
					value: subscriptionId
				}]
			});
			await options.checkout?.onCheckoutComplete?.({
				event,
				order,
				subscription: dbSubscription,
				product: typeof product === "object" ? product : { id: productId }
			}, ctx);
		}
	} catch (e) {
		logger.error(`Creem webhook failed. Error: ${e.message}`);
	}
}
/**
* Handle subscription.active webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-active
*/
async function onSubscriptionActive(ctx, options, event) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.active event");
			return;
		}
		const productId = typeof creemSubscription.product === "object" ? creemSubscription.product.id : creemSubscription.product;
		if (!productId) {
			logger.warn("Product ID missing from subscription.active event");
			return;
		}
		const subscription = await ctx.context.adapter.findOne({
			model: "subscription",
			where: [{
				field: "creemSubscriptionId",
				value: creemSubscription.id
			}]
		});
		if (subscription) await ctx.context.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				updatedAt: /* @__PURE__ */ new Date(),
				productId,
				...creemSubscription.current_period_start_date && { periodStart: new Date(creemSubscription.current_period_start_date) },
				...creemSubscription.current_period_end_date && { periodEnd: new Date(creemSubscription.current_period_end_date) }
			},
			where: [{
				field: "id",
				value: subscription.id
			}]
		});
	} catch (error) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}
/**
* Handle subscription.paid webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-paid
*/
async function onSubscriptionPaid(ctx, options, event) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.paid event");
			return;
		}
		const subscription = await ctx.context.adapter.findOne({
			model: "subscription",
			where: [{
				field: "creemSubscriptionId",
				value: creemSubscription.id
			}]
		});
		if (subscription) await ctx.context.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				updatedAt: /* @__PURE__ */ new Date(),
				...creemSubscription.current_period_start_date && { periodStart: new Date(creemSubscription.current_period_start_date) },
				...creemSubscription.current_period_end_date && { periodEnd: new Date(creemSubscription.current_period_end_date) }
			},
			where: [{
				field: "id",
				value: subscription.id
			}]
		});
	} catch (error) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}
/**
* Handle subscription.update webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-update
*/
async function onSubscriptionUpdate(ctx, options, event) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.update event");
			return;
		}
		const productId = typeof creemSubscription.product === "object" ? creemSubscription.product.id : creemSubscription.product;
		const subscription = await ctx.context.adapter.findOne({
			model: "subscription",
			where: [{
				field: "creemSubscriptionId",
				value: creemSubscription.id
			}]
		});
		if (!subscription) {
			logger.warn(`Subscription not found for Creem subscription ID: ${creemSubscription.id}`);
			return;
		}
		await ctx.context.adapter.update({
			model: "subscription",
			update: {
				updatedAt: /* @__PURE__ */ new Date(),
				status: creemSubscription.status || subscription.status,
				...productId && { productId },
				...creemSubscription.current_period_start_date && { periodStart: new Date(creemSubscription.current_period_start_date) },
				...creemSubscription.current_period_end_date && { periodEnd: new Date(creemSubscription.current_period_end_date) },
				...creemSubscription.canceled_at !== void 0 && { cancelAtPeriodEnd: !!creemSubscription.canceled_at }
			},
			where: [{
				field: "id",
				value: subscription.id
			}]
		});
		await options.checkout?.onSubscriptionUpdate?.({
			event,
			subscription
		});
	} catch (error) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}
/**
* Handle subscription.canceled webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-canceled
*/
async function onSubscriptionCanceled(ctx, options, event) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.canceled event");
			return;
		}
		const subscription = await ctx.context.adapter.findOne({
			model: "subscription",
			where: [{
				field: "creemSubscriptionId",
				value: creemSubscription.id
			}]
		});
		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				where: [{
					field: "id",
					value: subscription.id
				}],
				update: {
					status: "canceled",
					updatedAt: /* @__PURE__ */ new Date()
				}
			});
			await options.checkout?.onSubscriptionCancel?.({
				event,
				subscription
			});
		} else logger.warn(`Subscription not found for Creem subscription ID: ${creemSubscription.id}`);
	} catch (error) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}
/**
* Handle subscription.expired webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-expired
*/
async function onSubscriptionExpired(ctx, options, event) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.expired event");
			return;
		}
		const subscription = await ctx.context.adapter.findOne({
			model: "subscription",
			where: [{
				field: "creemSubscriptionId",
				value: creemSubscription.id
			}]
		});
		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				where: [{
					field: "id",
					value: subscription.id
				}],
				update: {
					status: "canceled",
					updatedAt: /* @__PURE__ */ new Date()
				}
			});
			await options.checkout?.onSubscriptionDeleted?.({
				event,
				subscription
			});
		}
	} catch (error) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}
/**
* Handle subscription.trialing webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-trialing
*/
async function onSubscriptionTrialing(ctx, options, event) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.trialing event");
			return;
		}
		const subscription = await ctx.context.adapter.findOne({
			model: "subscription",
			where: [{
				field: "creemSubscriptionId",
				value: creemSubscription.id
			}]
		});
		if (subscription) await ctx.context.adapter.update({
			model: "subscription",
			where: [{
				field: "id",
				value: subscription.id
			}],
			update: {
				status: "active",
				updatedAt: /* @__PURE__ */ new Date()
			}
		});
	} catch (error) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}
/**
* Handle subscription.paused webhook
* Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-paused
*/
async function onSubscriptionPaused(ctx, options, event) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.paused event");
			return;
		}
		const subscription = await ctx.context.adapter.findOne({
			model: "subscription",
			where: [{
				field: "creemSubscriptionId",
				value: creemSubscription.id
			}]
		});
		if (subscription) await ctx.context.adapter.update({
			model: "subscription",
			where: [{
				field: "id",
				value: subscription.id
			}],
			update: {
				status: "paused",
				updatedAt: /* @__PURE__ */ new Date()
			}
		});
	} catch (error) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}

//#endregion
//#region src/schema.ts
const subscriptions = { subscription: { fields: {
	productId: {
		type: "string",
		required: true
	},
	referenceId: {
		type: "string",
		required: true
	},
	creemCustomerId: {
		type: "string",
		required: false
	},
	creemSubscriptionId: {
		type: "string",
		required: false
	},
	creemOrderId: {
		type: "string",
		required: false
	},
	status: {
		type: "string",
		defaultValue: "pending"
	},
	periodStart: {
		type: "date",
		required: false
	},
	periodEnd: {
		type: "date",
		required: false
	},
	cancelAtPeriodEnd: {
		type: "boolean",
		required: false,
		defaultValue: false
	}
} } };
const user = { user: { fields: { creemCustomerId: {
	type: "string",
	required: false
} } } };
const getSchema = (options) => {
	return mergeSchema({
		...subscriptions,
		...user
	}, options.schema);
};

//#endregion
//#region src/utils.ts
/**
* Helper function to make authenticated requests to Creem API
*/
async function creemApiRequest(apiKey, endpoint, options) {
	const url = `${options?.apiBaseUrl || "https://api.creem.io"}${endpoint}`;
	const response = await fetch(url, {
		method: options?.method || "GET",
		headers: {
			"x-api-key": apiKey,
			"Content-Type": "application/json"
		},
		...options?.body && { body: JSON.stringify(options.body) }
	});
	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Creem API Error: ${response.status} - ${error}`);
	}
	return await response.json();
}

//#endregion
//#region src/index.ts
const CREEM_ERROR_CODES = defineErrorCodes({
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	ALREADY_SUBSCRIBED_PRODUCT: "You're already subscribed to this product",
	EMAIL_VERIFICATION_REQUIRED: "Email verification is required before you can create a checkout",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active"
});
const getUrl = (ctx, url) => {
	if (url.startsWith("http")) return url;
	return `${ctx.context.options.baseURL}${url.startsWith("/") ? url : `/${url}`}`;
};
const creem = (options) => {
	const checkoutOptions = options.checkout;
	const referenceMiddleware = (action) => createAuthMiddleware(async (ctx) => {
		const session = ctx.context.session;
		if (!session) throw new APIError("UNAUTHORIZED");
		const referenceId = ctx.body?.referenceId || ctx.query?.referenceId || session.user.id;
		if (ctx.body?.referenceId && !checkoutOptions?.authorizeReference) {
			logger.error(`Passing referenceId into an action isn't allowed if checkout.authorizeReference isn't defined in your creem plugin config.`);
			throw new APIError("BAD_REQUEST", { message: "Reference id is not allowed. Read server logs for more details." });
		}
		const sameReference = ctx.query?.referenceId === session.user.id || ctx.body?.referenceId === session.user.id;
		if (!(ctx.body?.referenceId || ctx.query?.referenceId ? await checkoutOptions?.authorizeReference?.({
			user: session.user,
			session: session.session,
			referenceId,
			action
		}, ctx) || sameReference : true)) throw new APIError("UNAUTHORIZED", { message: "Unauthorized" });
	});
	const endpoints = {
		createCheckout: createAuthEndpoint("/checkout/create", {
			method: "POST",
			body: z.object({
				productId: z.string().meta({ description: "The Creem product ID. Eg: \"prod_xxx\"" }),
				referenceId: z.string().meta({ description: "Reference id. Eg: \"org_123\"" }).optional(),
				subscriptionId: z.string().meta({ description: "Existing subscription ID. Eg: \"sub_123\"" }).optional(),
				metadata: z.record(z.string(), z.any()).optional(),
				successUrl: z.string().meta({ description: "Success redirect URL. Eg: \"https://example.com/success\"" }).default("/"),
				cancelUrl: z.string().meta({ description: "Cancel redirect URL. Eg: \"https://example.com/pricing\"" }).default("/"),
				disableRedirect: z.boolean().meta({ description: "Disable automatic redirect. Eg: true" }).default(false)
			}),
			use: [
				sessionMiddleware,
				originCheck((c) => {
					return [c.body.successURL, c.body.cancelURL];
				}),
				referenceMiddleware("create-checkout")
			]
		}, async (ctx) => {
			const { user: user$1, session } = ctx.context.session;
			if (!user$1.emailVerified && checkoutOptions?.requireEmailVerification) throw new APIError("BAD_REQUEST", { message: CREEM_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED });
			const referenceId = ctx.body.referenceId || user$1.id;
			const productId = ctx.body.productId;
			const existingSubscription = ctx.body.subscriptionId ? await ctx.context.adapter.findOne({
				model: "subscription",
				where: [{
					field: "id",
					value: ctx.body.subscriptionId
				}]
			}) : await ctx.context.adapter.findOne({
				model: "subscription",
				where: [{
					field: "referenceId",
					value: referenceId
				}, {
					field: "productId",
					value: productId
				}]
			});
			const customerId = existingSubscription?.creemCustomerId || user$1.creemCustomerId;
			if ((await ctx.context.adapter.findMany({
				model: "subscription",
				where: [
					{
						field: "referenceId",
						value: referenceId
					},
					{
						field: "productId",
						value: productId
					},
					{
						field: "status",
						value: "active"
					}
				]
			})).length > 0 && !ctx.body.subscriptionId) throw new APIError("BAD_REQUEST", { message: CREEM_ERROR_CODES.ALREADY_SUBSCRIBED_PRODUCT });
			let subscription = existingSubscription;
			if (!subscription) subscription = await ctx.context.adapter.create({
				model: "subscription",
				data: {
					productId,
					creemCustomerId: customerId,
					status: "pending",
					referenceId
				}
			});
			if (!subscription) {
				ctx.context.logger.error("Subscription ID not found");
				throw new APIError("INTERNAL_SERVER_ERROR");
			}
			const params = await checkoutOptions?.getCheckoutParams?.({
				user: user$1,
				session,
				productId,
				subscription
			}, ctx.request, ctx);
			try {
				const checkoutSession = await creemApiRequest(options.apiKey, "/v1/checkouts", {
					method: "POST",
					body: {
						product_id: productId,
						customer_email: user$1.email,
						success_url: getUrl(ctx, `${ctx.context.baseURL}/checkout/success?callbackURL=${encodeURIComponent(ctx.body.successUrl)}&subscriptionId=${encodeURIComponent(subscription.id)}`),
						cancel_url: getUrl(ctx, ctx.body.cancelUrl),
						metadata: {
							userId: user$1.id,
							subscriptionId: subscription.id,
							referenceId,
							...params?.params?.metadata,
							...ctx.body.metadata
						},
						...params?.params
					},
					apiBaseUrl: options.apiBaseUrl
				});
				return ctx.json({
					...checkoutSession,
					redirect: !ctx.body.disableRedirect
				});
			} catch (error) {
				ctx.context.logger.error("Error creating checkout session", error);
				throw new APIError("BAD_REQUEST", { message: error.message || "Failed to create checkout session" });
			}
		}),
		cancelSubscription: createAuthEndpoint("/subscription/cancel", {
			method: "POST",
			body: z.object({
				referenceId: z.string().optional(),
				subscriptionId: z.string().optional()
			}),
			use: [sessionMiddleware, referenceMiddleware("cancel-subscription")]
		}, async (ctx) => {
			const referenceId = ctx.body?.referenceId || ctx.context.session.user.id;
			const subscription = ctx.body.subscriptionId ? await ctx.context.adapter.findOne({
				model: "subscription",
				where: [{
					field: "id",
					value: ctx.body.subscriptionId
				}]
			}) : await ctx.context.adapter.findMany({
				model: "subscription",
				where: [{
					field: "referenceId",
					value: referenceId
				}]
			}).then((subs) => subs.find((sub) => sub.status === "active"));
			if (!subscription || !subscription.creemSubscriptionId) throw ctx.error("BAD_REQUEST", { message: CREEM_ERROR_CODES.SUBSCRIPTION_NOT_FOUND });
			try {
				await creemApiRequest(options.apiKey, `/v1/subscriptions/${subscription.creemSubscriptionId}/cancel`, {
					method: "POST",
					apiBaseUrl: options.apiBaseUrl
				});
				await ctx.context.adapter.update({
					model: "subscription",
					update: {
						cancelAtPeriodEnd: true,
						updatedAt: /* @__PURE__ */ new Date()
					},
					where: [{
						field: "id",
						value: subscription.id
					}]
				});
				await checkoutOptions?.onSubscriptionCancel?.({ subscription });
				return ctx.json({ success: true });
			} catch (error) {
				ctx.context.logger.error("Error canceling subscription", error);
				throw new APIError("BAD_REQUEST", { message: error.message });
			}
		}),
		listActiveSubscriptions: createAuthEndpoint("/subscription/list", {
			method: "GET",
			query: z.optional(z.object({ referenceId: z.string().optional() })),
			use: [sessionMiddleware, referenceMiddleware("list-subscription")]
		}, async (ctx) => {
			const activeSubs = (await ctx.context.adapter.findMany({
				model: "subscription",
				where: [{
					field: "referenceId",
					value: ctx.query?.referenceId || ctx.context.session.user.id
				}]
			})).filter((sub) => sub.status === "active");
			return ctx.json(activeSubs);
		}),
		checkoutSuccess: createAuthEndpoint("/checkout/success", {
			method: "GET",
			query: z.record(z.string(), z.any()).optional(),
			use: [originCheck((ctx) => ctx.query.callbackURL)]
		}, async (ctx) => {
			if (!ctx.query || !ctx.query.callbackURL || !ctx.query.subscriptionId) throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
			const session = await getSessionFromCtx(ctx);
			if (!session) throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
			const { user: user$1 } = session;
			const { callbackURL, subscriptionId } = ctx.query;
			const subscription = await ctx.context.adapter.findOne({
				model: "subscription",
				where: [{
					field: "id",
					value: subscriptionId
				}]
			});
			if (subscription?.status === "active") return ctx.redirect(getUrl(ctx, callbackURL));
			if ((subscription?.creemCustomerId || user$1.creemCustomerId) && subscription?.creemSubscriptionId) try {
				const creemSubscription = await creemApiRequest(options.apiKey, `/v1/subscriptions/${subscription.creemSubscriptionId}`, {
					method: "GET",
					apiBaseUrl: options.apiBaseUrl
				});
				if (creemSubscription) await ctx.context.adapter.update({
					model: "subscription",
					update: {
						status: creemSubscription.status || "active",
						...creemSubscription.current_period_start_date && { periodStart: new Date(creemSubscription.current_period_start_date) },
						...creemSubscription.current_period_end_date && { periodEnd: new Date(creemSubscription.current_period_end_date) }
					},
					where: [{
						field: "id",
						value: subscription.id
					}]
				});
			} catch (error) {
				ctx.context.logger.error("Error fetching subscription from Creem", error);
			}
			throw ctx.redirect(getUrl(ctx, callbackURL));
		}),
		createBillingPortal: createAuthEndpoint("/subscription/billing-portal", {
			method: "POST",
			body: z.object({
				referenceId: z.string().optional(),
				returnUrl: z.string().default("/")
			}),
			use: [
				sessionMiddleware,
				originCheck((ctx) => ctx.body.returnUrl),
				referenceMiddleware("billing-portal")
			]
		}, async (ctx) => {
			const { user: user$1 } = ctx.context.session;
			const referenceId = ctx.body.referenceId || user$1.id;
			let customerId = user$1.creemCustomerId;
			if (!customerId) customerId = (await ctx.context.adapter.findMany({
				model: "subscription",
				where: [{
					field: "referenceId",
					value: referenceId
				}]
			}).then((subs) => subs.find((sub) => sub.status === "active")))?.creemCustomerId;
			if (!customerId) throw new APIError("BAD_REQUEST", { message: "No Creem customer found for this user" });
			try {
				const billingSession = await creemApiRequest(options.apiKey, "/v1/customers/billing", {
					method: "POST",
					body: {
						customer_id: customerId,
						return_url: getUrl(ctx, ctx.body.returnUrl)
					},
					apiBaseUrl: options.apiBaseUrl
				});
				return ctx.json({
					url: billingSession.url,
					redirect: true
				});
			} catch (error) {
				ctx.context.logger.error("Error creating billing portal session", error);
				throw new APIError("BAD_REQUEST", { message: error.message });
			}
		})
	};
	return {
		id: "creem",
		endpoints: {
			creemWebhook: createAuthEndpoint("/creem/webhook", {
				method: "POST",
				metadata: { isAction: false },
				cloneRequest: true,
				disableBody: true
			}, async (ctx) => {
				if (!ctx.request?.body) throw new APIError("INTERNAL_SERVER_ERROR");
				const buf = await ctx.request.text();
				const signature = ctx.request.headers.get("x-creem-signature");
				if (options.webhookSecret) {
					if (!signature) throw new APIError("BAD_REQUEST", { message: "Missing webhook signature" });
				}
				let event;
				try {
					event = JSON.parse(buf);
				} catch (err) {
					ctx.context.logger.error(`${err.message}`);
					throw new APIError("BAD_REQUEST", { message: `Webhook Error: ${err.message}` });
				}
				if (!event) throw new APIError("BAD_REQUEST", { message: "Failed to parse event" });
				try {
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
							await options.onEvent?.(event);
							break;
						default:
							await options.onEvent?.(event);
							break;
					}
				} catch (e) {
					ctx.context.logger.error(`Creem webhook failed. Error: ${e.message}`);
					throw new APIError("BAD_REQUEST", { message: "Webhook error: See server logs for more information." });
				}
				return ctx.json({ success: true });
			}),
			...endpoints
		},
		init(ctx) {
			return { options: { databaseHooks: { user: {
				create: { async after(user$1, ctx$1) {
					if (ctx$1 && options.createCustomerOnSignUp) ctx$1.context.logger.warn("createCustomerOnSignUp is not supported by Creem. Customers are created automatically during checkout.");
				} },
				update: { async after(user$1, ctx$1) {
					if (!ctx$1) return;
				} }
			} } } };
		},
		schema: getSchema(options),
		$ERROR_CODES: CREEM_ERROR_CODES
	};
};

//#endregion
export { creem };