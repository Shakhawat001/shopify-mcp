/**
 * Shopify Billing Module
 * Handles subscription management using Shopify GraphQL Billing API
 */

// Pricing configuration - Competitive 3-tier structure
export const PRICING = {
  FREE: {
    name: 'free',
    displayName: 'Free',
    price: 0,
    usageLimit: 70, // tool calls per month
  },
  STARTER: {
    name: 'starter',
    displayName: 'Starter',
    price: 4.99,
    usageLimit: 500, // tool calls per month
  },
  PRO: {
    name: 'pro',
    displayName: 'Pro',
    price: 29.99,
    usageLimit: -1, // unlimited
    trialDays: 0,
  }
} as const;

export type PlanType = 'free' | 'starter' | 'pro';

// Helper to determine if test mode should be used
// CRITICAL: Must be undefined (not false) in production for live charges
function getTestMode(): boolean | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined; // Shopify requires undefined, not false
  }
  return true; // Test mode for development
}

/**
 * Create a subscription using Shopify GraphQL
 */
export async function createSubscription(
  shopDomain: string,
  accessToken: string,
  returnUrl: string,
  plan: 'starter' | 'pro'
): Promise<{ confirmationUrl: string; subscriptionId: string } | null> {
  const planConfig = plan === 'starter' ? PRICING.STARTER : PRICING.PRO;
  const testMode = getTestMode();
  
  // Build test parameter - only include if not undefined
  const testParam = testMode !== undefined ? `test: ${testMode}` : '';
  
  const mutation = `
    mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        ${testParam}
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
    name: `MCP for Shopify ${planConfig.displayName}`,
    returnUrl,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: planConfig.price, currencyCode: "USD" },
            interval: "EVERY_30_DAYS"
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

// Legacy function name for backward compatibility
export const createProSubscription = (
  shopDomain: string,
  accessToken: string,
  returnUrl: string
) => createSubscription(shopDomain, accessToken, returnUrl, 'pro');

export const createStarterSubscription = (
  shopDomain: string,
  accessToken: string,
  returnUrl: string
) => createSubscription(shopDomain, accessToken, returnUrl, 'starter');

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
 * Check if usage limit is exceeded for a plan
 */
export function isUsageLimitExceeded(plan: PlanType, usageCount: number): boolean {
  if (plan === 'pro') return false; // Pro is unlimited
  if (plan === 'starter') return usageCount >= PRICING.STARTER.usageLimit;
  return usageCount >= PRICING.FREE.usageLimit;
}

/**
 * Get usage limit for a plan
 */
export function getUsageLimit(plan: PlanType): number {
  switch (plan) {
    case 'pro': return -1;
    case 'starter': return PRICING.STARTER.usageLimit;
    default: return PRICING.FREE.usageLimit;
  }
}

/**
 * Format price for display
 */
export function formatPrice(plan: PlanType): string {
  if (plan === 'free') return 'Free';
  
  const pricing = plan === 'starter' ? PRICING.STARTER : PRICING.PRO;
  return `$${pricing.price.toFixed(2)}/mo`;
}

/**
 * Get original price for display
 */
export function getOriginalPrice(plan: PlanType): string {
  if (plan === 'free') return '$0';
  const pricing = plan === 'starter' ? PRICING.STARTER : PRICING.PRO;
  return `$${pricing.price.toFixed(2)}/mo`;
}
