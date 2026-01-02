/**
 * Session Storage - PostgreSQL with Prisma 5
 * Production-ready session storage with encrypted tokens and billing tracking
 */

import { PrismaClient } from '@prisma/client';
import { Session } from '@shopify/shopify-api';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Initialize Prisma Client with connection pooling
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Encryption helpers
const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'));
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  try {
    const parts = text.split(':');
    if (parts.length < 2) return text; // Not encrypted
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encrypted = parts.join(':');
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'));
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[SessionStorage] Decryption failed:', error);
    return text; // Return as-is if decryption fails (legacy data)
  }
}

// Extended session data interface
export interface StoredSession {
  id: string;
  shop: string;
  accessToken: string;
  scope: string | null;
  apiKey: string;
  createdAt: string;
  isOnline: boolean;
  state?: string | null;
  plan: 'free' | 'starter' | 'pro';
  usageCount: number;
  usageResetDate: string;
  subscriptionId?: string | null;
}

// Usage limits per plan
const USAGE_LIMITS = {
  free: 70,
  starter: 500,
  pro: -1, // Unlimited
} as const;

type PlanType = keyof typeof USAGE_LIMITS;

// Helper to calculate next billing reset date (30 days from now)
function getNextBillingDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
}

export class PostgresSessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    try {
      // Check if this shop already has a session (preserve API key)
      const existingByShop = await this.findSessionByShop(session.shop);
      const apiKey = existingByShop?.apiKey || `sk_live_${uuidv4()}`;
      
      await prisma.session.upsert({
        where: { shop: session.shop },
        update: {
          accessToken: encrypt(session.accessToken || ''),
          scope: session.scope || null,
          isOnline: session.isOnline || false,
          state: session.state || null,
        },
        create: {
          id: session.id,
          shop: session.shop,
          accessToken: encrypt(session.accessToken || ''),
          scope: session.scope || null,
          apiKey: apiKey,
          isOnline: session.isOnline || false,
          state: session.state || null,
          plan: 'free',
          usageCount: 0,
          usageResetDate: getNextBillingDate(),
        }
      });
      
      console.log(`[SessionStorage] Stored session for ${session.shop} with API key: ${apiKey.substring(0, 12)}...`);
      return true;
    } catch (error) {
      console.error('[SessionStorage] Error storing session:', error);
      return false;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const stored = await prisma.session.findFirst({
        where: { 
          OR: [
            { id },
            { shop: id }
          ]
        }
      });
      
      if (stored) {
        return new Session({
          id: stored.id,
          shop: stored.shop,
          state: stored.state || '',
          isOnline: stored.isOnline,
          accessToken: decrypt(stored.accessToken),
          scope: stored.scope || undefined,
        });
      }
      return undefined;
    } catch (error) {
      console.error('[SessionStorage] Error loading session:', error);
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await prisma.session.deleteMany({
        where: {
          OR: [
            { id },
            { shop: id }
          ]
        }
      });
      console.log(`[SessionStorage] Deleted session: ${id}`);
      return true;
    } catch (error) {
      console.error('[SessionStorage] Error deleting session:', error);
      return false;
    }
  }

  async deleteSessionByShop(shop: string): Promise<boolean> {
    try {
      const result = await prisma.session.deleteMany({
        where: { shop }
      });
      console.log(`[SessionStorage] Deleted ${result.count} session(s) for shop: ${shop}`);
      return result.count > 0;
    } catch (error) {
      console.error('[SessionStorage] Error deleting session by shop:', error);
      return false;
    }
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const sessions = await prisma.session.findMany({
        where: { shop }
      });
      
      return sessions.map(stored => new Session({
        id: stored.id,
        shop: stored.shop,
        state: stored.state || '',
        isOnline: stored.isOnline,
        accessToken: decrypt(stored.accessToken),
        scope: stored.scope || undefined,
      }));
    } catch (error) {
      console.error('[SessionStorage] Error finding sessions:', error);
      return [];
    }
  }

  async findSessionByShop(shop: string): Promise<StoredSession | null> {
    try {
      const stored = await prisma.session.findUnique({
        where: { shop }
      });
      
      if (!stored) return null;
      
      return {
        id: stored.id,
        shop: stored.shop,
        accessToken: decrypt(stored.accessToken),
        scope: stored.scope,
        apiKey: stored.apiKey,
        createdAt: stored.createdAt.toISOString(),
        isOnline: stored.isOnline,
        state: stored.state,
        plan: stored.plan as PlanType,
        usageCount: stored.usageCount,
        usageResetDate: stored.usageResetDate.toISOString(),
        subscriptionId: stored.subscriptionId,
      };
    } catch (error) {
      console.error('[SessionStorage] Error finding session by shop:', error);
      return null;
    }
  }

  async findSessionByApiKey(apiKey: string): Promise<StoredSession | null> {
    try {
      const stored = await prisma.session.findUnique({
        where: { apiKey }
      });
      
      if (!stored) return null;
      
      return {
        id: stored.id,
        shop: stored.shop,
        accessToken: decrypt(stored.accessToken),
        scope: stored.scope,
        apiKey: stored.apiKey,
        createdAt: stored.createdAt.toISOString(),
        isOnline: stored.isOnline,
        state: stored.state,
        plan: stored.plan as PlanType,
        usageCount: stored.usageCount,
        usageResetDate: stored.usageResetDate.toISOString(),
        subscriptionId: stored.subscriptionId,
      };
    } catch (error) {
      console.error('[SessionStorage] Error finding session by API key:', error);
      return null;
    }
  }

  async incrementUsage(shop: string): Promise<{ allowed: boolean; count: number; limit: number }> {
    try {
      const stored = await prisma.session.findUnique({
        where: { shop }
      });
      
      if (!stored) {
        return { allowed: false, count: 0, limit: 0 };
      }

      const plan = stored.plan as PlanType;
      const limit = USAGE_LIMITS[plan];
      
      // Check if we need to reset the counter (new billing period)
      const now = new Date();
      const resetDate = new Date(stored.usageResetDate);
      
      let newCount = stored.usageCount;
      let newResetDate = stored.usageResetDate;
      
      if (now >= resetDate) {
        // Reset counter for new billing period
        newCount = 0;
        newResetDate = getNextBillingDate();
      }
      
      // Check limit (unlimited = -1)
      if (limit !== -1 && newCount >= limit) {
        return { allowed: false, count: newCount, limit };
      }
      
      // Increment usage
      newCount++;
      
      await prisma.session.update({
        where: { shop },
        data: {
          usageCount: newCount,
          usageResetDate: newResetDate,
        }
      });
      
      return { allowed: true, count: newCount, limit };
    } catch (error) {
      console.error('[SessionStorage] Error incrementing usage:', error);
      return { allowed: true, count: 0, limit: -1 }; // Fail open
    }
  }

  async updatePlan(shop: string, plan: PlanType, subscriptionId?: string): Promise<boolean> {
    try {
      await prisma.session.update({
        where: { shop },
        data: {
          plan,
          subscriptionId: subscriptionId || null,
          usageCount: 0, // Reset usage on plan change
          usageResetDate: getNextBillingDate(),
        }
      });
      
      console.log(`[SessionStorage] Updated plan for ${shop} to ${plan}`);
      return true;
    } catch (error) {
      console.error('[SessionStorage] Error updating plan:', error);
      return false;
    }
  }

  async getUsageStats(shop: string): Promise<{
    plan: PlanType;
    usageCount: number;
    limit: number;
    resetDate: string;
    subscriptionId?: string;
  } | null> {
    try {
      const stored = await prisma.session.findUnique({
        where: { shop }
      });
      
      if (!stored) return null;
      
      const plan = stored.plan as PlanType;
      return {
        plan,
        usageCount: stored.usageCount,
        limit: USAGE_LIMITS[plan],
        resetDate: stored.usageResetDate.toISOString(),
        subscriptionId: stored.subscriptionId || undefined,
      };
    } catch (error) {
      console.error('[SessionStorage] Error getting usage stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const sessionStorage = new PostgresSessionStorage();
