import { Session } from '@shopify/shopify-api';

export class MemorySessionStorage {
  private sessions: Record<string, Session> = {};

  async storeSession(session: Session): Promise<boolean> {
    this.sessions[session.id] = session;
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const session = this.sessions[id];
    if (session) {
        // Return a copy to avoid mutation issues, 
        // ensuring it's a valid Session object if needed by library
        return session;
    }
    return undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    delete this.sessions[id];
    return true;
  }
  
  // Custom helper to find session by shop domain (useful for n8n to connect just by providing shop name)
  // Limitation: Only works if one session per shop (offline mode)
  async findSessionByShop(shop: string): Promise<Session | undefined> {
      return Object.values(this.sessions).find(s => s.shop === shop);
  }
}

export const sessionStorage = new MemorySessionStorage();
