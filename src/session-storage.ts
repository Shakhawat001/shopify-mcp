/**
 * Session Storage - PostgreSQL with Prisma
 * Production-ready session storage with encrypted tokens and billing tracking
 */

import { PrismaClient, Session as PrismaSession } from '@prisma/client';
import { Session } from '@shopify/shopify-api';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Initialize Prisma Client
const prisma = new PrismaClient();

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

// Helper to calculate next billing reset date (30 days from now)
function getNextBillingDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
}

// Convert Prisma session to StoredSession
function toStoredSession(prismaSession: PrismaSession): StoredSession {
  return {
    id: prismaSession.id,
    shop: prismaSession.shop,
    accessToken: decrypt(prismaSession.accessToken),
    scope: prismaSession.scope,
    apiKey: prismaSession.apiKey,
    createdAt: prismaSession.createdAt.toISOString(),
    isOnline: prismaSession.isOnline,
    state: prismaSession.state,
    plan: prismaSession.plan as 'free' | 'starter' | 'pro',
    usageCount: prismaSession.usageCount,
    usageResetDate: prismaSession.usageResetDate.toISOString(),
    subscriptionId: prismaSession.subscriptionId,
  };
}

export class PostgresSessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    try {
      // Check if this shop already has a session (preserve API key)
      const existing = await prisma.session.findUnique({
        where: { shop: session.shop },
      });

      const apiKey = existing?.apiKey || `sk_live_${uuidv4()}`;
      const encryptedToken = encrypt(session.accessToken || '');

      await prisma.session.upsert({
        where: { shop: session.shop },
        update: {
          id: session.id,
          accessToken: encryptedToken,
          scope: session.scope || null,
          isOnline: session.isOnline || false,
          state: session.state || null,
        },
        create: {
          id: session.id,
          shop: session.shop,
          accessToken: encryptedToken,
          scope: session.scope || null,
          apiKey: apiKey,
          isOnline: session.isOnline || false,
          state: session.state || null,
          plan: 'free',
          usageCount: 0,
          usageResetDate: getNextBillingDate(),
        },
      });

      console.log(`[SessionStorage] Stored session for ${session.shop} with API key: ${apiKey.substring(0, 12)}...`);
      return true;
    } catch (error) {
      console.error('[SessionStorage] Failed to store session:', error);
      return false;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const stored = await prisma.session.findUnique({
        where: { id },
      });

      if (stored) {
        return new Session({
          id: stored.id,
          shop: stored.shop,
          accessToken: decrypt(stored.accessToken),
          scope: stored.scope || '',
          isOnline: stored.isOnline,
          state: stored.state || '',
        });
      }
      return undefined;
    } catch (error) {
      console.error('[SessionStorage] Failed to load session:', error);
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await prisma.session.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      console.error('[SessionStorage] Failed to delete session:', error);
      return false;
    }
  }

  async findSessionByShop(shop: string): Promise<StoredSession | undefined> {
    try {
      const session = await prisma.session.findUnique({
        where: { shop },
      });
      return session ? toStoredSession(session) : undefined;
    } catch (error) {
      console.error('[SessionStorage] Failed to find session by shop:', error);
      return undefined;
    }
  }

  async findSessionByApiKey(apiKey: string): Promise<StoredSession | undefined> {
    try {
      const session = await prisma.session.findUnique({
        where: { apiKey },
      });
      return session ? toStoredSession(session) : undefined;
    } catch (error) {
      console.error('[SessionStorage] Failed to find session by API key:', error);
      return undefined;
    }
  }

  async getApiKeyForShop(shop: string): Promise<string | undefined> {
    const session = await this.findSessionByShop(shop);
    return session?.apiKey;
  }

  async regenerateApiKey(shop: string): Promise<string | undefined> {
    try {
      const newApiKey = `sk_live_${uuidv4()}`;
      await prisma.session.update({
        where: { shop },
        data: { apiKey: newApiKey },
      });
      console.log(`[SessionStorage] Regenerated API key for ${shop}`);
      return newApiKey;
    } catch (error) {
      console.error('[SessionStorage] Failed to regenerate API key:', error);
      return undefined;
    }
  }

  async getAllSessions(): Promise<StoredSession[]> {
    try {
      const sessions = await prisma.session.findMany();
      return sessions.map(toStoredSession);
    } catch (error) {
      console.error('[SessionStorage] Failed to get all sessions:', error);
      return [];
    }
  }

  async incrementUsage(shop: string): Promise<{ allowed: boolean; count: number; limit: number }> {
    try {
      const session = await prisma.session.findUnique({
        where: { shop },
      });

      if (!session) {
        return { allowed: false, count: 0, limit: 0 };
      }

      // Check if we need to reset the counter (billing period expired)
      const resetDate = new Date(session.usageResetDate);
      let usageCount = session.usageCount;

      if (resetDate < new Date()) {
        usageCount = 0;
        await prisma.session.update({
          where: { shop },
          data: {
            usageCount: 0,
            usageResetDate: getNextBillingDate(),
          },
        });
        console.log(`[Billing] Reset usage counter for ${shop}`);
      }

      const plan = session.plan as 'free' | 'starter' | 'pro';
      const limit = USAGE_LIMITS[plan];

      // Pro plan = unlimited
      if (limit === -1) {
        await prisma.session.update({
          where: { shop },
          data: { usageCount: { increment: 1 } },
        });
        return { allowed: true, count: usageCount + 1, limit: -1 };
      }

      // Check limit for free/starter
      if (usageCount >= limit) {
        return { allowed: false, count: usageCount, limit };
      }

      await prisma.session.update({
        where: { shop },
        data: { usageCount: { increment: 1 } },
      });

      return { allowed: true, count: usageCount + 1, limit };
    } catch (error) {
      console.error('[SessionStorage] Failed to increment usage:', error);
      return { allowed: false, count: 0, limit: 0 };
    }
  }

  async updatePlan(shop: string, plan: 'free' | 'starter' | 'pro', subscriptionId?: string): Promise<boolean> {
    try {
      await prisma.session.update({
        where: { shop },
        data: {
          plan,
          subscriptionId: subscriptionId || null,
          // Reset usage when upgrading
          usageCount: 0,
          usageResetDate: getNextBillingDate(),
        },
      });
      console.log(`[Billing] Updated plan for ${shop} to ${plan}`);
      return true;
    } catch (error) {
      console.error('[SessionStorage] Failed to update plan:', error);
      return false;
    }
  }

  async getUsageStats(shop: string): Promise<{ plan: string; usageCount: number; limit: number; resetDate: string } | null> {
    try {
      const session = await prisma.session.findUnique({
        where: { shop },
      });

      if (!session) return null;

      const plan = session.plan as 'free' | 'starter' | 'pro';
      return {
        plan: session.plan,
        usageCount: session.usageCount,
        limit: USAGE_LIMITS[plan],
        resetDate: session.usageResetDate.toISOString(),
      };
    } catch (error) {
      console.error('[SessionStorage] Failed to get usage stats:', error);
      return null;
    }
  }

  async deleteSessionByShop(shop: string): Promise<boolean> {
    try {
      await prisma.session.delete({
        where: { shop },
      });
      console.log(`[SessionStorage] Deleted session for ${shop}`);
      return true;
    } catch (error) {
      console.error('[SessionStorage] Failed to delete session by shop:', error);
      return false;
    }
  }
}

export const sessionStorage = new PostgresSessionStorage();
