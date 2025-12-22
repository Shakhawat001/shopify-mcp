/**
 * Shopify Billing Module
 * Handles subscription management using Shopify GraphQL Billing API
 */

// Pricing configuration
export const PRICING = {
  FREE: {
    name: 'free',
    displayName: 'Free',
    price: 0,
    usageLimit: 200, // tool calls per month
  },
  PRO: {
    name: 'pro',
    displayName: 'Pro',
    price: 9.99,
    usageLimit: -1, // unlimited
    trialDays: 0,
    // Launch discount: 30% off for first 3 months
    launchDiscount: {
      percentage: 0.30,
      durationInIntervals: 3,
    }
  }
} as const;

export type PlanType = 'free' | 'pro';

/**
 * Create a Pro subscription using Shopify GraphQL
 */
export async function createProSubscription(
  shopDomain: string,
  accessToken: string,
  returnUrl: string
): Promise<{ confirmationUrl: string; subscriptionId: string } | null> {
  const mutation = `
    mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        test: ${process.env.NODE_ENV !== 'production'}
      ) {
        appSubscription {
          id
          status
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    name: "Shopify MCP Pro",
    returnUrl,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: PRICING.PRO.price, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
            // Apply launch discount
            discount: {
              value: { percentage: PRICING.PRO.launchDiscount.percentage },
              durationLimitInIntervals: PRICING.PRO.launchDiscount.durationInIntervals
            }
          }
        }
      }
    ]
  };

  try {
    const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const data = await response.json();
    
    if (data.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      console.error('[Billing] Subscription error:', data.data.appSubscriptionCreate.userErrors);
      return null;
    }

    const result = data.data?.appSubscriptionCreate;
    if (result?.confirmationUrl && result?.appSubscription?.id) {
      return {
        confirmationUrl: result.confirmationUrl,
        subscriptionId: result.appSubscription.id,
      };
    }

    return null;
  } catch (error) {
    console.error('[Billing] Failed to create subscription:', error);
    return null;
  }
}

/**
 * Get current subscription status
 */
export async function getCurrentSubscription(
  shopDomain: string,
  accessToken: string
): Promise<{ id: string; status: string; name: string } | null> {
  const query = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          status
          name
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
    
    // Return first active subscription (should only be one)
    return subscriptions.length > 0 ? subscriptions[0] : null;
  } catch (error) {
    console.error('[Billing] Failed to get subscription:', error);
    return null;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  shopDomain: string,
  accessToken: string,
  subscriptionId: string
): Promise<boolean> {
  const mutation = `
    mutation AppSubscriptionCancel($id: ID!) {
      appSubscriptionCancel(id: $id) {
        appSubscription {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ 
        query: mutation, 
        variables: { id: subscriptionId } 
      }),
    });

    const data = await response.json();
    
    if (data.data?.appSubscriptionCancel?.userErrors?.length > 0) {
      console.error('[Billing] Cancel error:', data.data.appSubscriptionCancel.userErrors);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Billing] Failed to cancel subscription:', error);
    return false;
  }
}

/**
 * Check if usage limit is exceeded for free plan
 */
export function isUsageLimitExceeded(plan: PlanType, usageCount: number): boolean {
  if (plan === 'pro') return false; // Pro is unlimited
  return usageCount >= PRICING.FREE.usageLimit;
}

/**
 * Get usage limit for a plan
 */
export function getUsageLimit(plan: PlanType): number {
  return plan === 'pro' ? -1 : PRICING.FREE.usageLimit;
}

/**
 * Format price for display
 */
export function formatPrice(plan: PlanType): string {
  if (plan === 'free') return 'Free';
  
  // Show discounted price during launch
  const originalPrice = PRICING.PRO.price;
  const discountedPrice = originalPrice * (1 - PRICING.PRO.launchDiscount.percentage);
  
  return `$${discountedPrice.toFixed(2)}/mo (30% off launch special!)`;
}
