/**
 * Dashboard Template - Simplified with Inline Tutorials
 * Everything a non-technical user needs in one page
 */

export interface DashboardParams {
  host: string;
  shop: string | null;
  apiKey: string;
  isAuthorized: boolean;
  usageCount?: number;
  usageLimit?: number;
  plan?: 'free' | 'starter' | 'pro';
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
  
  // Pre-formatted values for easy copy-paste (no thinking required)
  const sseUrl = `${host}/sse`;
  const bearerToken = `Bearer ${apiKey}`;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Store Assistant</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #f6f6f7;
            color: #202223;
            line-height: 1.6;
            min-height: 100vh;
        }
        
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
        
        .container { max-width: 800px; margin: 0 auto; padding: 24px 16px 60px; }
        
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
        
        /* Stats */
        .stats-row { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .stat-box {
            flex: 1;
            min-width: 140px;
            background: #f9fafb;
            border: 1px solid #e1e3e5;
            border-radius: 8px;
            padding: 16px;
        }
        .stat-label { font-size: 12px; color: #6d7175; text-transform: uppercase; margin-bottom: 4px; }
        .stat-value { font-size: 20px; font-weight: 600; }
        .stat-value.success { color: #008060; }
        
        /* Progress */
        .progress-bar { background: #e1e3e5; height: 8px; border-radius: 4px; overflow: hidden; margin: 8px 0; }
        .progress-fill { height: 100%; border-radius: 4px; }
        .progress-fill.green { background: #008060; }
        .progress-fill.yellow { background: #ffc107; }
        .progress-fill.red { background: #d82c0d; }
        
        /* Tabs */
        .tabs { display: flex; gap: 4px; background: #f0f1f2; padding: 4px; border-radius: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .tab {
            flex: 1;
            min-width: 80px;
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 500;
            background: transparent;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            color: #6d7175;
            transition: all 0.15s;
        }
        .tab:hover { color: #202223; }
        .tab.active { background: white; color: #202223; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        /* Tutorial Steps */
        .step {
            display: flex;
            gap: 16px;
            padding: 20px 0;
            border-bottom: 1px solid #f0f1f2;
        }
        .step:last-child { border-bottom: none; }
        .step-num {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            background: #008060;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 600;
        }
        .step-content { flex: 1; }
        .step-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
        .step-desc { font-size: 13px; color: #6d7175; margin-bottom: 8px; }
        
        /* Copy Box */
        .copy-box {
            background: #1e1e1e;
            border-radius: 8px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .copy-value {
            flex: 1;
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 13px;
            color: #d4d4d4;
            word-break: break-all;
        }
        .copy-btn {
            background: #008060;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
        }
        .copy-btn:hover { background: #006e52; }
        .copy-btn.copied { background: #5be9b9; color: #004c3f; }
        
        /* Alert */
        .alert {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .alert.warning { background: #fff8e6; border: 1px solid #ffea8a; }
        .alert.success { background: #f1f8f5; border: 1px solid #aee9d1; }
        .alert-icon { font-size: 20px; }
        .alert-content { flex: 1; }
        .alert-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .alert-text { font-size: 13px; color: #6d7175; }
        
        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 500;
            border-radius: 8px;
            cursor: pointer;
            border: none;
            text-decoration: none;
        }
        .btn-primary { background: #008060; color: white; }
        .btn-primary:hover { background: #006e52; }
        .btn-upgrade { background: #5c4aff; color: white; }
        .btn-upgrade:hover { background: #4838cc; }
        
        /* Footer */
        .footer { text-align: center; padding: 20px; color: #6d7175; font-size: 13px; }
        .footer a { color: #008060; text-decoration: none; }
        .footer a:hover { text-decoration: underline; }
        
        /* Toast */
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #202223;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            display: none;
            z-index: 1000;
        }
        .toast.show { display: block; animation: fadeUp 0.2s; }
        @keyframes fadeUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 AI Store Assistant</h1>
        <p>Connect your AI tools to manage your store</p>
        <div class="status-badge">
            <span class="status-dot"></span>
            ${isAuthorized ? '✅ Ready to Connect' : '⚠️ Setup Needed'}
        </div>
    </div>
    
    <div class="container">
        ${!isAuthorized ? `
        <div class="alert warning">
            <div class="alert-icon">⚠️</div>
            <div class="alert-content">
                <div class="alert-title">Complete Setup First</div>
                <div class="alert-text">Connect your Shopify store to get started.</div>
            </div>
            <a href="/auth?shop=${shop || ''}" class="btn btn-primary">Connect Store</a>
        </div>
        ` : ''}
        
        <!-- Stats Row -->
        <div class="stats-row">
            <div class="stat-box">
                <div class="stat-label">Status</div>
                <div class="stat-value ${isAuthorized ? 'success' : ''}">
                    ${isAuthorized ? '✅ Ready' : '⏳ Pending'}
                </div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Plan</div>
                <div class="stat-value">${isProPlan ? '⭐ Pro' : 'Free'}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Actions Used</div>
                <div class="stat-value">${usageCount}${!isProPlan ? ` / ${usageLimit}` : ''}</div>
                ${!isProPlan ? `
                <div class="progress-bar">
                    <div class="progress-fill ${usagePercent > 90 ? 'red' : usagePercent > 70 ? 'yellow' : 'green'}" style="width: ${usagePercent}%"></div>
                </div>
                ` : ''}
            </div>
        </div>
        
        ${!isProPlan ? `
        <div style="text-align: right; margin-bottom: 20px;">
            <a href="/billing?shop=${shop}" class="btn btn-upgrade">⭐ Upgrade to Pro - Unlimited Actions</a>
        </div>
        ` : ''}
        
        ${isAuthorized ? `
        <!-- Connection Tutorial Card -->
        <div class="card">
            <div class="card-header">
                <div class="card-icon">🚀</div>
                <h2>Connect Your AI Tool</h2>
            </div>
            <div class="card-body">
                <p style="color: #6d7175; margin-bottom: 16px;">Choose your AI tool and follow the simple steps:</p>
                
                <!-- Tabs -->
                <div class="tabs">
                    <button class="tab active" onclick="showTab('n8n')">🔧 n8n</button>
                    <button class="tab" onclick="showTab('chatgpt')">💬 ChatGPT</button>
                    <button class="tab" onclick="showTab('claude')">🧠 Claude</button>
                    <button class="tab" onclick="showTab('other')">📱 Other</button>
                </div>
                
                <!-- n8n Tutorial -->
                <div id="tab-n8n" class="tab-content active">
                    <div class="step">
                        <div class="step-num">1</div>
                        <div class="step-content">
                            <div class="step-title">Open n8n and create a workflow</div>
                            <div class="step-desc">Add an "AI Agent" node, then click "Add Tool" and select "MCP Client".</div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">2</div>
                        <div class="step-content">
                            <div class="step-title">Paste this into the "SSE URL" field</div>
                            <div class="copy-box">
                                <span class="copy-value">${sseUrl}</span>
                                <button class="copy-btn" onclick="copyText(this, '${sseUrl}')">Copy</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">3</div>
                        <div class="step-content">
                            <div class="step-title">Set Authentication to "Bearer Token"</div>
                            <div class="step-desc">Then paste this into the "Token" field:</div>
                            <div class="copy-box">
                                <span class="copy-value">${apiKey}</span>
                                <button class="copy-btn" onclick="copyText(this, '${apiKey}')">Copy</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">4</div>
                        <div class="step-content">
                            <div class="step-title">Click "Test" - You're done! 🎉</div>
                            <div class="step-desc">You should see Shopify tools appear. Try asking "list my products"!</div>
                        </div>
                    </div>
                </div>
                
                <!-- ChatGPT Tutorial -->
                <div id="tab-chatgpt" class="tab-content">
                    <div class="step">
                        <div class="step-num">1</div>
                        <div class="step-content">
                            <div class="step-title">Open ChatGPT and go to Settings</div>
                            <div class="step-desc">Click your profile → Settings → Beta Features → Enable "Plugins".</div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">2</div>
                        <div class="step-content">
                            <div class="step-title">Add a custom plugin</div>
                            <div class="step-desc">In a chat, click plugins → "Plugin store" → "Develop your own plugin".</div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">3</div>
                        <div class="step-content">
                            <div class="step-title">Paste this URL when asked</div>
                            <div class="copy-box">
                                <span class="copy-value">${host}/mcp</span>
                                <button class="copy-btn" onclick="copyText(this, '${host}/mcp')">Copy</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">4</div>
                        <div class="step-content">
                            <div class="step-title">When asked for API key, paste this</div>
                            <div class="copy-box">
                                <span class="copy-value">${bearerToken}</span>
                                <button class="copy-btn" onclick="copyText(this, '${bearerToken}')">Copy</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">5</div>
                        <div class="step-content">
                            <div class="step-title">Start chatting! 🎉</div>
                            <div class="step-desc">Ask ChatGPT things like "Show me my products" or "Create a test product".</div>
                        </div>
                    </div>
                </div>
                
                <!-- Claude Tutorial -->
                <div id="tab-claude" class="tab-content">
                    <div class="step">
                        <div class="step-num">1</div>
                        <div class="step-content">
                            <div class="step-title">Open your Claude config file</div>
                            <div class="step-desc">
                                <strong>Mac:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json<br>
                                <strong>Windows:</strong> %APPDATA%\\Claude\\claude_desktop_config.json
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">2</div>
                        <div class="step-content">
                            <div class="step-title">Replace the entire file with this</div>
                            <div class="copy-box" style="flex-direction: column; align-items: stretch;">
                                <pre class="copy-value" style="white-space: pre-wrap; margin-bottom: 8px;">{
  "mcpServers": {
    "shopify": {
      "url": "${sseUrl}",
      "headers": {
        "Authorization": "${bearerToken}"
      }
    }
  }
}</pre>
                                <button class="copy-btn" onclick="copyText(this, JSON.stringify({mcpServers:{shopify:{url:'${sseUrl}',headers:{Authorization:'${bearerToken}'}}}}, null, 2))">Copy All</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">3</div>
                        <div class="step-content">
                            <div class="step-title">Save and restart Claude 🎉</div>
                            <div class="step-desc">The Shopify tools will now be available in Claude!</div>
                        </div>
                    </div>
                </div>
                
                <!-- Other Tools Tutorial -->
                <div id="tab-other" class="tab-content">
                    <div class="step">
                        <div class="step-num">1</div>
                        <div class="step-content">
                            <div class="step-title">Find MCP or Server settings in your tool</div>
                            <div class="step-desc">Look for "MCP", "Model Context Protocol", or "Add Server".</div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">2</div>
                        <div class="step-content">
                            <div class="step-title">Use this as the Server URL</div>
                            <div class="copy-box">
                                <span class="copy-value">${sseUrl}</span>
                                <button class="copy-btn" onclick="copyText(this, '${sseUrl}')">Copy</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">3</div>
                        <div class="step-content">
                            <div class="step-title">For authentication, use this token</div>
                            <div class="copy-box">
                                <span class="copy-value">${bearerToken}</span>
                                <button class="copy-btn" onclick="copyText(this, '${bearerToken}')">Copy</button>
                            </div>
                            <div class="step-desc" style="margin-top: 8px;">This already includes "Bearer " so just paste it directly.</div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-num">4</div>
                        <div class="step-content">
                            <div class="step-title">Test the connection 🎉</div>
                            <div class="step-desc">If it works, you'll see Shopify tools available!</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        ` : ''}
        
        <!-- What You Can Do -->
        <div class="card">
            <div class="card-header">
                <div class="card-icon">✨</div>
                <h2>What Your AI Can Do</h2>
            </div>
            <div class="card-body">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                        <span style="color: #008060;">✓</span> View & search products
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                        <span style="color: #008060;">✓</span> Create new products
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                        <span style="color: #008060;">✓</span> Update inventory
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                        <span style="color: #008060;">✓</span> Check order status
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                        <span style="color: #008060;">✓</span> Create discount codes
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                        <span style="color: #008060;">✓</span> Write blog posts
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:support@batinstudio.com">Help</a>
    </div>
    
    <div class="toast" id="toast">✓ Copied!</div>
    
    <script>
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
            
            // Show selected tab
            document.getElementById('tab-' + tabName).classList.add('active');
            event.target.classList.add('active');
        }
        
        function copyText(btn, text) {
            navigator.clipboard.writeText(text);
            
            // Change button text
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            btn.classList.add('copied');
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('copied');
            }, 2000);
        }
    </script>
</body>
</html>
  `;
}
