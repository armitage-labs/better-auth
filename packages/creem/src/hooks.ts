import { type GenericEndpointContext, logger } from "better-auth";
import type {
	CreemOptions,
	CreemWebhookEvent,
	InputSubscription,
	Subscription,
} from "./types";

/**
 * Handle checkout.completed webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#checkout-completed
 */
export async function onCheckoutCompleted(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const checkoutData = event.object;
		const order = checkoutData.order;
		const subscription = checkoutData.subscription;
		const product = checkoutData.product;

		if (!order || !product) {
			logger.warn("Order or product data missing from checkout.completed event");
			return;
		}

		// Get product ID - can be from product object or order
		const productId = typeof product === "object" ? product.id : order.product;
		const customerId = typeof checkoutData.customer === "object" 
			? checkoutData.customer.id 
			: order.customer;

		// Get metadata from checkout
		const referenceId = checkoutData.metadata?.referenceId;
		const subscriptionId = checkoutData.metadata?.subscriptionId;

		if (referenceId && subscriptionId) {
			let dbSubscription =
				await ctx.context.adapter.update<InputSubscription>({
					model: "subscription",
					update: {
						productId,
						status: subscription ? "active" : "pending",
						updatedAt: new Date(),
						creemOrderId: order.id,
						creemSubscriptionId: subscription?.id,
						creemCustomerId: customerId,
						...(subscription && {
							periodStart: subscription.current_period_start_date 
								? new Date(subscription.current_period_start_date)
								: undefined,
							periodEnd: subscription.current_period_end_date
								? new Date(subscription.current_period_end_date)
								: undefined,
						}),
					},
					where: [
						{
							field: "id",
							value: subscriptionId,
						},
					],
				});

			if (!dbSubscription) {
				dbSubscription = await ctx.context.adapter.findOne<Subscription>({
					model: "subscription",
					where: [
						{
							field: "id",
							value: subscriptionId,
						},
					],
				});
			}

			await options.checkout?.onCheckoutComplete?.(
				{
					event,
					order,
					subscription: dbSubscription as Subscription,
					product: typeof product === "object" ? product : { id: productId } as any,
				},
				ctx,
			);
		}
	} catch (e: any) {
		logger.error(`Creem webhook failed. Error: ${e.message}`);
	}
}

/**
 * Handle subscription.active webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-active
 */
export async function onSubscriptionActive(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.active event");
			return;
		}

		const productId = typeof creemSubscription.product === "object"
			? creemSubscription.product.id
			: creemSubscription.product;

		if (!productId) {
			logger.warn("Product ID missing from subscription.active event");
			return;
		}

		// Find subscription by Creem subscription ID
		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "creemSubscriptionId",
					value: creemSubscription.id,
				},
			],
		});

		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				update: {
					status: "active",
					updatedAt: new Date(),
					productId,
					...(creemSubscription.current_period_start_date && {
						periodStart: new Date(creemSubscription.current_period_start_date),
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
	} catch (error: any) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}

/**
 * Handle subscription.paid webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-paid
 */
export async function onSubscriptionPaid(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.paid event");
			return;
		}

		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "creemSubscriptionId",
					value: creemSubscription.id,
				},
			],
		});

		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				update: {
					status: "active",
					updatedAt: new Date(),
					...(creemSubscription.current_period_start_date && {
						periodStart: new Date(creemSubscription.current_period_start_date),
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
	} catch (error: any) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}

/**
 * Handle subscription.update webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-update
 */
export async function onSubscriptionUpdate(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.update event");
			return;
		}

		const productId = typeof creemSubscription.product === "object"
			? creemSubscription.product.id
			: creemSubscription.product;

		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "creemSubscriptionId",
					value: creemSubscription.id,
				},
			],
		});

		if (!subscription) {
			logger.warn(
				`Subscription not found for Creem subscription ID: ${creemSubscription.id}`,
			);
			return;
		}

		await ctx.context.adapter.update({
			model: "subscription",
			update: {
				updatedAt: new Date(),
				status: creemSubscription.status || subscription.status,
				...(productId && { productId }),
				...(creemSubscription.current_period_start_date && {
					periodStart: new Date(creemSubscription.current_period_start_date),
				}),
				...(creemSubscription.current_period_end_date && {
					periodEnd: new Date(creemSubscription.current_period_end_date),
				}),
				...(creemSubscription.canceled_at !== undefined && {
					cancelAtPeriodEnd: !!creemSubscription.canceled_at,
				}),
			},
			where: [
				{
					field: "id",
					value: subscription.id,
				},
			],
		});

		await options.checkout?.onSubscriptionUpdate?.({
			event,
			subscription,
		});
	} catch (error: any) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}

/**
 * Handle subscription.canceled webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-canceled
 */
export async function onSubscriptionCanceled(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.canceled event");
			return;
		}

		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "creemSubscriptionId",
					value: creemSubscription.id,
				},
			],
		});

		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscription.id,
					},
				],
				update: {
					status: "canceled",
					updatedAt: new Date(),
				},
			});

			await options.checkout?.onSubscriptionCancel?.({
				event,
				subscription,
			});
		} else {
			logger.warn(
				`Subscription not found for Creem subscription ID: ${creemSubscription.id}`,
			);
		}
	} catch (error: any) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}

/**
 * Handle subscription.expired webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-expired
 */
export async function onSubscriptionExpired(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.expired event");
			return;
		}

		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "creemSubscriptionId",
					value: creemSubscription.id,
				},
			],
		});

		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscription.id,
					},
				],
				update: {
					status: "canceled", // Mark as canceled when expired
					updatedAt: new Date(),
				},
			});

			await options.checkout?.onSubscriptionDeleted?.({
				event,
				subscription,
			});
		}
	} catch (error: any) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}

/**
 * Handle subscription.trialing webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-trialing
 */
export async function onSubscriptionTrialing(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.trialing event");
			return;
		}

		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "creemSubscriptionId",
					value: creemSubscription.id,
				},
			],
		});

		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscription.id,
					},
				],
				update: {
					status: "active", // Keep as active during trial
					updatedAt: new Date(),
				},
			});
		}
	} catch (error: any) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}

/**
 * Handle subscription.paused webhook
 * Ref: https://docs.creem.io/learn/webhooks/event-types#subscription-paused
 */
export async function onSubscriptionPaused(
	ctx: GenericEndpointContext,
	options: CreemOptions,
	event: CreemWebhookEvent,
) {
	try {
		const creemSubscription = event.object;
		if (!creemSubscription || !creemSubscription.id) {
			logger.warn("Subscription data missing from subscription.paused event");
			return;
		}

		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "creemSubscriptionId",
					value: creemSubscription.id,
				},
			],
		});

		if (subscription) {
			await ctx.context.adapter.update({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscription.id,
					},
				],
				update: {
					status: "paused",
					updatedAt: new Date(),
				},
			});
		}
	} catch (error: any) {
		logger.error(`Creem webhook failed. Error: ${error.message}`);
	}
}
