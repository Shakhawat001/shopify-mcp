/**
 * New Dashboard Template - Polaris Web Components
 * Ultra-simple for non-technical Shopify users
 */

export interface DashboardParams {
  host: string;
  shop: string | null;
  apiKey: string;
  isAuthorized: boolean;
  usageCount?: number;
  usageLimit?: number;
  plan?: 'free' | 'pro';
}

export function renderNewDashboard(params: DashboardParams): string {
  const { 
    host, 
    shop, 
    apiKey, 
    isAuthorized,
    usageCount = 0,
    usageLimit = 200,
    plan = 'free'
  } = params;
  
  const usagePercent = usageLimit > 0 ? Math.min(100, (usageCount / usageLimit) * 100) : 0;
  const isProPlan = plan === 'pro';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Store Assistant - Dashboard</title>
    
    <!-- Polaris Web Components -->
    <link rel="stylesheet" href="https://unpkg.com/@shopify/polaris@12.0.0/build/esm/styles.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #f6f6f7;
            color: #202223;
            line-height: 1.5;
            min-height: 100vh;
        }
        
        /* Header */
        .header {
            background: linear-gradient(135deg, #008060 0%, #004c3f 100%);
            color: white;
            padding: 32px 20px;
            text-align: center;
        }
        .header h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .header p { opacity: 0.9; font-size: 15px; }
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(255,255,255,0.15);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 13px;
            margin-top: 16px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            background: #5be9b9;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        
        /* Layout */
        .container { max-width: 800px; margin: 0 auto; padding: 24px 16px 60px; }
        
        /* Cards */
        .card {
            background: white;
            border: 1px solid #e1e3e5;
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
        }
        .card-header {
            padding: 20px;
            border-bottom: 1px solid #f0f1f2;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .card-header h2 { font-size: 16px; font-weight: 600; flex: 1; }
        .card-body { padding: 20px; }
        .card-icon {
            width: 36px;
            height: 36px;
            background: #f1f8f5;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }
        
        /* Stats Grid */
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        @media (max-width: 500px) { .stats-grid { grid-template-columns: 1fr; } }
        .stat-card {
            background: #f9fafb;
            border: 1px solid #e1e3e5;
            border-radius: 8px;
            padding: 16px;
        }
        .stat-label { font-size: 12px; color: #6d7175; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .stat-value { font-size: 24px; font-weight: 600; color: #202223; }
        .stat-value.success { color: #008060; }
        
        /* Progress Bar */
        .progress-bar { background: #e1e3e5; height: 8px; border-radius: 4px; overflow: hidden; margin: 12px 0; }
        .progress-fill { background: #008060; height: 100%; border-radius: 4px; transition: width 0.3s; }
        .progress-fill.warning { background: #ffc107; }
        .progress-fill.danger { background: #d82c0d; }
        
        /* Connection Key */
        .key-box {
            background: #f1f8f5;
            border: 1px solid #aee9d1;
            border-radius: 8px;
            padding: 16px;
        }
        .key-label { font-size: 14px; font-weight: 500; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .key-input {
            width: 100%;
            font-family: monospace;
            font-size: 14px;
            padding: 12px;
            border: 1px solid #e1e3e5;
            border-radius: 6px;
            background: white;
        }
        .key-actions { display: flex; gap: 8px; margin-top: 12px; }
        
        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 500;
            border-radius: 8px;
            cursor: pointer;
            border: none;
            transition: all 0.15s;
        }
        .btn-primary { background: #008060; color: white; }
        .btn-primary:hover { background: #006e52; }
        .btn-secondary { background: white; color: #202223; border: 1px solid #e1e3e5; }
        .btn-secondary:hover { background: #f9fafb; }
        .btn-upgrade { background: #5c4aff; color: white; }
        .btn-upgrade:hover { background: #4838cc; }
        
        /* Capabilities */
        .capabilities-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (max-width: 500px) { .capabilities-grid { grid-template-columns: 1fr; } }
        .capability-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #202223;
        }
        .capability-icon { color: #008060; font-size: 18px; }
        
        /* Getting Started */
        .getting-started {
            background: linear-gradient(135deg, #f0f0ff 0%, #e8f4f8 100%);
            border: 1px solid #d4d4ff;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
        }
        .getting-started h3 { font-size: 18px; margin-bottom: 8px; }
        .getting-started p { color: #6d7175; margin-bottom: 16px; }
        .tool-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .tool-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            background: white;
            border: 1px solid #e1e3e5;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
        }
        .tool-btn:hover { border-color: #008060; background: #f1f8f5; }
        .tool-btn .icon { font-size: 20px; }
        
        /* Alert */
        .alert {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 16px;
        }
        .alert.success { background: #f1f8f5; border: 1px solid #aee9d1; }
        .alert.warning { background: #fff8e6; border: 1px solid #ffea8a; }
        .alert-icon { font-size: 20px; }
        .alert-content { flex: 1; }
        .alert-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .alert-text { font-size: 13px; color: #6d7175; }
        
        /* Footer */
        .footer { text-align: center; padding: 20px; color: #6d7175; font-size: 13px; }
        .footer a { color: #008060; text-decoration: none; }
        .footer a:hover { text-decoration: underline; }
        
        /* Tooltip */
        .copied-toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #202223;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            display: none;
            z-index: 1000;
        }
        .copied-toast.show { display: block; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 AI Store Assistant</h1>
        <p>Your AI-powered Shopify companion</p>
        <div class="status-badge">
            <span class="status-dot"></span>
            ${isAuthorized ? '✅ Connected' : '⚠️ Setup needed'}
        </div>
    </div>
    
    <div class="container">
        ${!isAuthorized ? `
        <!-- Not Connected State -->
        <div class="alert warning">
            <div class="alert-icon">⚠️</div>
            <div class="alert-content">
                <div class="alert-title">Complete Setup Required</div>
                <div class="alert-text">Connect your Shopify store to get your Connection Key.</div>
            </div>
            <a href="/auth?shop=${shop || ''}" class="btn btn-primary">Connect Store</a>
        </div>
        ` : ''}
        
        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Status</div>
                <div class="stat-value ${isAuthorized ? 'success' : ''}">
                    ${isAuthorized ? '✅ Ready' : '⏳ Setup needed'}
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Plan</div>
                <div class="stat-value">${isProPlan ? '⭐ Pro' : 'Free'}</div>
            </div>
        </div>
        
        <!-- Usage Card -->
        <div class="card">
            <div class="card-header">
                <div class="card-icon">📊</div>
                <h2>This Month's Usage</h2>
                ${!isProPlan ? `<a href="/billing/subscribe?shop=${shop}" class="btn btn-upgrade btn-sm">Upgrade to Pro</a>` : ''}
            </div>
            <div class="card-body">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                    <span style="font-size: 14px; color: #6d7175;">Actions used</span>
                    <span style="font-size: 24px; font-weight: 600;">
                        ${usageCount} ${isProPlan ? '' : `/ ${usageLimit}`}
                    </span>
                </div>
                ${!isProPlan ? `
                <div class="progress-bar">
                    <div class="progress-fill ${usagePercent > 90 ? 'danger' : usagePercent > 70 ? 'warning' : ''}" style="width: ${usagePercent}%"></div>
                </div>
                <p style="font-size: 13px; color: #6d7175; margin-top: 8px;">
                    ${usagePercent > 90 
                        ? '⚠️ Almost at limit! Upgrade for unlimited actions.' 
                        : `${usageLimit - usageCount} actions remaining this month`
                    }
                </p>
                ` : `
                <p style="font-size: 13px; color: #008060; margin-top: 8px;">✨ Unlimited actions with Pro plan</p>
                `}
            </div>
        </div>
        
        ${isAuthorized ? `
        <!-- Connection Key Card -->
        <div class="card">
            <div class="card-header">
                <div class="card-icon">🔑</div>
                <h2>Your Connection Key</h2>
            </div>
            <div class="card-body">
                <p style="color: #6d7175; margin-bottom: 16px;">
                    Use this key to connect your AI tools. Keep it secret!
                </p>
                
                <div class="key-box">
                    <div class="key-label">🔐 Secret Connection Key</div>
                    <input type="password" class="key-input" id="connection-key" value="${apiKey}" readonly>
                    <div class="key-actions">
                        <button class="btn btn-secondary" onclick="toggleKey()">👁️ Show</button>
                        <button class="btn btn-primary" onclick="copyKey()">📋 Copy</button>
                    </div>
                </div>
                
                <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e1e3e5;">
                    <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">Server URL</div>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" class="key-input" id="server-url" value="${host}/sse" readonly style="flex: 1;">
                        <button class="btn btn-secondary" onclick="copyUrl()">📋 Copy</button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Getting Started Card -->
        <div class="getting-started">
            <h3>🚀 Ready to Connect?</h3>
            <p>Choose your AI tool to see setup instructions</p>
            <div class="tool-buttons">
                <a href="/?shop=${shop}&tool=n8n" class="tool-btn">
                    <span class="icon">🔧</span> n8n
                </a>
                <a href="/?shop=${shop}&tool=chatgpt" class="tool-btn">
                    <span class="icon">💬</span> ChatGPT
                </a>
                <a href="/?shop=${shop}&tool=claude" class="tool-btn">
                    <span class="icon">🧠</span> Claude
                </a>
                <a href="/?shop=${shop}&tool=other" class="tool-btn">
                    <span class="icon">📱</span> Other
                </a>
            </div>
        </div>
        ` : ''}
        
        <!-- Capabilities Card -->
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <div class="card-icon">✨</div>
                <h2>What Your AI Can Do</h2>
            </div>
            <div class="card-body">
                <div class="capabilities-grid">
                    <div class="capability-item"><span class="capability-icon">✓</span> View & search products</div>
                    <div class="capability-item"><span class="capability-icon">✓</span> Create new products</div>
                    <div class="capability-item"><span class="capability-icon">✓</span> Update inventory</div>
                    <div class="capability-item"><span class="capability-icon">✓</span> Check order status</div>
                    <div class="capability-item"><span class="capability-icon">✓</span> Create discount codes</div>
                    <div class="capability-item"><span class="capability-icon">✓</span> Write blog posts</div>
                    <div class="capability-item"><span class="capability-icon">✓</span> Manage customers</div>
                    <div class="capability-item"><span class="capability-icon">✓</span> Get store analytics</div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="mailto:support@batinstudio.com">Need Help?</a>
    </div>
    
    <div class="copied-toast" id="toast">✓ Copied to clipboard!</div>
    
    <script>
        function toggleKey() {
            const input = document.getElementById('connection-key');
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
        }
        
        function copyKey() {
            const input = document.getElementById('connection-key');
            input.type = 'text';
            input.select();
            document.execCommand('copy');
            input.type = 'password';
            showToast();
        }
        
        function copyUrl() {
            const input = document.getElementById('server-url');
            input.select();
            document.execCommand('copy');
            showToast();
        }
        
        function showToast() {
            const toast = document.getElementById('toast');
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }
    </script>
</body>
</html>
  `;
}
