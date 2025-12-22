import { Session } from '@shopify/shopify-api';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';

// Extended session data with API key for MCP authentication
export interface StoredSession {
  id: string;
  shop: string;
  accessToken: string;
  scope: string;
  apiKey: string;  // Unique key for this store to use with MCP
  createdAt: string;
  isOnline: boolean;
  state?: string;
  // Billing fields
  plan: 'free' | 'pro';
  usageCount: number;           // Tool calls this billing period
  usageResetDate: string;       // ISO date when to reset counter
  subscriptionId?: string;      // Shopify subscription GID
}

// Helper to calculate next billing reset date (30 days from now)
function getNextBillingDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString();
}

// File path for persistent storage
const DATA_DIR = process.env.DATA_DIR || './data';
const SESSIONS_FILE = `${DATA_DIR}/sessions.json`;

export class FileSessionStorage {
  private sessions: Record<string, StoredSession> = {};

  constructor() {
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      if (existsSync(SESSIONS_FILE)) {
        const data = readFileSync(SESSIONS_FILE, 'utf-8');
        this.sessions = JSON.parse(data);
        console.log(`[SessionStorage] Loaded ${Object.keys(this.sessions).length} sessions from file`);
      } else {
        console.log('[SessionStorage] No existing sessions file, starting fresh');
      }
    } catch (error) {
      console.error('[SessionStorage] Error loading sessions:', error);
      this.sessions = {};
    }
  }

  private saveToFile(): void {
    try {
      // Ensure directory exists
      const dir = dirname(SESSIONS_FILE);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(SESSIONS_FILE, JSON.stringify(this.sessions, null, 2));
    } catch (error) {
      console.error('[SessionStorage] Error saving sessions:', error);
    }
  }

  async storeSession(session: Session): Promise<boolean> {
    // Check if this shop already has a session (preserve API key)
    const existingByShop = await this.findSessionByShop(session.shop);
    const apiKey = existingByShop?.apiKey || `sk_live_${uuidv4()}`;
    
    const stored: StoredSession = {
      id: session.id,
      shop: session.shop,
      accessToken: session.accessToken || '',
      scope: session.scope || '',
      apiKey: apiKey,
      createdAt: existingByShop?.createdAt || new Date().toISOString(),
      isOnline: session.isOnline || false,
      state: session.state,
      // Billing defaults - preserve existing values if re-authenticating
      plan: existingByShop?.plan || 'free',
      usageCount: existingByShop?.usageCount || 0,
      usageResetDate: existingByShop?.usageResetDate || getNextBillingDate(),
    };
    
    this.sessions[session.id] = stored;
    this.saveToFile();
    console.log(`[SessionStorage] Stored session for ${session.shop} with API key: ${apiKey.substring(0, 12)}...`);
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const stored = this.sessions[id];
    if (stored) {
      // Reconstruct a Session object
      return new Session({
        id: stored.id,
        shop: stored.shop,
        accessToken: stored.accessToken,
        scope: stored.scope,
        isOnline: stored.isOnline,
        state: stored.state || '',
      });
    }
    return undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    delete this.sessions[id];
    this.saveToFile();
    return true;
  }
  
  // Find session by shop domain
  async findSessionByShop(shop: string): Promise<StoredSession | undefined> {
    return Object.values(this.sessions).find(s => s.shop === shop);
  }

  // Find session by API key (main auth method for MCP)
  async findSessionByApiKey(apiKey: string): Promise<StoredSession | undefined> {
    return Object.values(this.sessions).find(s => s.apiKey === apiKey);
  }

  // Get API key for a shop (for dashboard display)
  async getApiKeyForShop(shop: string): Promise<string | undefined> {
    const session = await this.findSessionByShop(shop);
    return session?.apiKey;
  }

  // Regenerate API key for a shop
  async regenerateApiKey(shop: string): Promise<string | undefined> {
    const session = Object.values(this.sessions).find(s => s.shop === shop);
    if (session) {
      session.apiKey = `sk_live_${uuidv4()}`;
      this.saveToFile();
      console.log(`[SessionStorage] Regenerated API key for ${shop}`);
      return session.apiKey;
    }
    return undefined;
  }

  // List all sessions (for debug)
  getAllSessions(): StoredSession[] {
    return Object.values(this.sessions);
  }

  // Increment usage count for a shop (called on each MCP tool use)
  async incrementUsage(shop: string): Promise<{ allowed: boolean; count: number; limit: number }> {
    const session = Object.values(this.sessions).find(s => s.shop === shop);
    if (!session) {
      return { allowed: false, count: 0, limit: 0 };
    }

    // Check if we need to reset the counter (billing period expired)
    if (new Date(session.usageResetDate) < new Date()) {
      session.usageCount = 0;
      session.usageResetDate = getNextBillingDate();
      console.log(`[Billing] Reset usage counter for ${shop}`);
    }

    // Pro plan = unlimited
    if (session.plan === 'pro') {
      session.usageCount++;
      this.saveToFile();
      return { allowed: true, count: session.usageCount, limit: -1 };
    }

    // Free plan = check limit (200 calls)
    const FREE_LIMIT = 200;
    if (session.usageCount >= FREE_LIMIT) {
      return { allowed: false, count: session.usageCount, limit: FREE_LIMIT };
    }

    session.usageCount++;
    this.saveToFile();
    return { allowed: true, count: session.usageCount, limit: FREE_LIMIT };
  }

  // Update plan for a shop
  async updatePlan(shop: string, plan: 'free' | 'pro', subscriptionId?: string): Promise<boolean> {
    const session = Object.values(this.sessions).find(s => s.shop === shop);
    if (!session) {
      return false;
    }

    session.plan = plan;
    if (subscriptionId) {
      session.subscriptionId = subscriptionId;
    }
    
    // Reset usage when upgrading to pro
    if (plan === 'pro') {
      session.usageCount = 0;
      session.usageResetDate = getNextBillingDate();
    }
    
    this.saveToFile();
    console.log(`[Billing] Updated plan for ${shop} to ${plan}`);
    return true;
  }

  // Get usage stats for a shop
  async getUsageStats(shop: string): Promise<{ plan: string; usageCount: number; limit: number; resetDate: string } | null> {
    const session = Object.values(this.sessions).find(s => s.shop === shop);
    if (!session) return null;
    
    return {
      plan: session.plan,
      usageCount: session.usageCount,
      limit: session.plan === 'pro' ? -1 : 200,
      resetDate: session.usageResetDate,
    };
  }
}

export const sessionStorage = new FileSessionStorage();
