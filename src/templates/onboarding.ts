/**
 * Onboarding Wizard Template
 * Step-by-step guide for non-technical users
 */

export interface OnboardingParams {
  host: string;
  shop: string | null;
  apiKey: string;
  selectedTool?: 'n8n' | 'chatgpt' | 'claude' | 'other';
  step?: number;
}

export function renderOnboarding(params: OnboardingParams): string {
  const { host, shop, apiKey, selectedTool, step = 1 } = params;
  
  // Tool-specific instructions
  const toolInstructions: Record<string, { name: string; icon: string; steps: { title: string; description: string; code?: string }[] }> = {
    n8n: {
      name: 'n8n',
      icon: '🔧',
      steps: [
        { 
          title: 'Open n8n and create a workflow',
          description: 'Log into your n8n instance and click the "+" button to create a new workflow.'
        },
        {
          title: 'Add an AI Agent node',
          description: 'Click "+" in your workflow, search for "AI Agent", and add it.'
        },
        {
          title: 'Add MCP Client tool',
          description: 'In the AI Agent settings, click "Add Tool" and select "MCP Client Tool".'
        },
        {
          title: 'Enter your connection details',
          description: 'Configure the MCP Client with these settings:',
          code: `SSE URL: ${host}/sse
Authentication: Bearer Token
Token: ${apiKey || 'Complete setup to get your key'}`
        },
        {
          title: 'Test your connection',
          description: 'Click "Test" in the MCP Client. You should see Shopify tools appear! 🎉'
        }
      ]
    },
    chatgpt: {
      name: 'ChatGPT',
      icon: '💬',
      steps: [
        {
          title: 'Open ChatGPT settings',
          description: 'Go to ChatGPT → Settings → Beta Features.'
        },
        {
          title: 'Enable plugins',
          description: 'Turn on "Plugins" in the beta features section.'
        },
        {
          title: 'Add custom plugin',
          description: 'In a chat, click the plugin icon → "Plugin store" → "Develop your own plugin".'
        },
        {
          title: 'Enter your server URL',
          description: 'When prompted, enter:',
          code: `${host}/mcp`
        },
        {
          title: 'Start chatting!',
          description: 'Ask ChatGPT things like "Show me my products" or "Create a test product" 🎉'
        }
      ]
    },
    claude: {
      name: 'Claude Desktop',
      icon: '🧠',
      steps: [
        {
          title: 'Find your Claude config file',
          description: 'Open this file on your computer:',
          code: `Mac: ~/Library/Application Support/Claude/claude_desktop_config.json
Windows: %APPDATA%\\Claude\\claude_desktop_config.json`
        },
        {
          title: 'Add the server configuration',
          description: 'Add this to your config file:',
          code: `{
  "mcpServers": {
    "shopify": {
      "url": "${host}/sse",
      "headers": {
        "Authorization": "Bearer ${apiKey || 'YOUR_KEY_HERE'}"
      }
    }
  }
}`
        },
        {
          title: 'Restart Claude',
          description: 'Close and reopen Claude Desktop. The Shopify tools will now be available! 🎉'
        }
      ]
    },
    other: {
      name: 'Other Tools',
      icon: '🔌',
      steps: [
        {
          title: 'Find MCP settings in your tool',
          description: 'Look for "MCP", "Model Context Protocol", or "Server" settings in your AI tool.'
        },
        {
          title: 'Enter the server URL',
          description: 'Use one of these URLs:',
          code: `Recommended: ${host}/sse
Alternative: ${host}/mcp`
        },
        {
          title: 'Set up authentication',
          description: 'Choose "Bearer Token" authentication and enter:',
          code: `${apiKey || 'Complete setup to get your key'}`
        },
        {
          title: 'Test the connection',
          description: 'Look for a "Test" or "Connect" button. If successful, you\'ll see Shopify tools! 🎉'
        }
      ]
    }
  };

  const tool = selectedTool ? toolInstructions[selectedTool] : null;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup Your AI Connection</title>
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
        
        .container { max-width: 700px; margin: 0 auto; padding: 24px 16px 60px; }
        
        .card {
            background: white;
            border: 1px solid #e1e3e5;
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
        }
        .card-body { padding: 24px; }
        
        /* Tool Selector */
        .tool-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (max-width: 480px) { .tool-grid { grid-template-columns: 1fr; } }
        .tool-option {
            padding: 20px;
            border: 2px solid #e1e3e5;
            border-radius: 12px;
            cursor: pointer;
            text-align: center;
            transition: all 0.15s;
            text-decoration: none;
            color: inherit;
        }
        .tool-option:hover { border-color: #008060; background: #f1f8f5; }
        .tool-option.selected { border-color: #008060; background: #f1f8f5; }
        .tool-icon { font-size: 32px; margin-bottom: 8px; }
        .tool-name { font-size: 16px; font-weight: 600; }
        .tool-desc { font-size: 13px; color: #6d7175; margin-top: 4px; }
        
        /* Steps */
        .steps-container { margin-top: 20px; }
        .step {
            display: flex;
            gap: 16px;
            padding: 20px 0;
            border-bottom: 1px solid #f0f1f2;
        }
        .step:last-child { border-bottom: none; }
        .step-number {
            flex-shrink: 0;
            width: 32px;
            height: 32px;
            background: #008060;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
        }
        .step-content { flex: 1; }
        .step-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
        .step-description { font-size: 14px; color: #6d7175; margin-bottom: 8px; }
        .step-code {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 13px;
            white-space: pre-wrap;
            position: relative;
        }
        .copy-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(255,255,255,0.1);
            border: none;
            color: #999;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .copy-btn:hover { background: rgba(255,255,255,0.2); color: white; }
        
        /* Key Box */
        .key-box {
            background: #f1f8f5;
            border: 1px solid #aee9d1;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }
        .key-label { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
        .key-value {
            display: flex;
            gap: 8px;
        }
        .key-input {
            flex: 1;
            font-family: monospace;
            font-size: 14px;
            padding: 10px 12px;
            border: 1px solid #e1e3e5;
            border-radius: 6px;
            background: white;
        }
        
        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 500;
            border-radius: 8px;
            cursor: pointer;
            border: none;
            transition: all 0.15s;
            text-decoration: none;
        }
        .btn-primary { background: #008060; color: white; }
        .btn-primary:hover { background: #006e52; }
        .btn-secondary { background: white; color: #202223; border: 1px solid #e1e3e5; }
        .btn-secondary:hover { background: #f9fafb; }
        
        /* Success Box */
        .success-box {
            background: #f1f8f5;
            border: 1px solid #aee9d1;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
        }
        .success-icon { font-size: 48px; margin-bottom: 16px; }
        .success-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
        .success-text { color: #6d7175; margin-bottom: 16px; }
        
        /* Nav */
        .nav-buttons { display: flex; justify-content: space-between; margin-top: 24px; }
        
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
        }
        .toast.show { display: block; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${tool ? `Connect to ${tool.name}` : '🚀 Let\'s Get You Connected!'}</h1>
        <p>${tool ? `Follow these steps to connect ${tool.name} to your store` : 'Choose your AI tool to see setup instructions'}</p>
    </div>
    
    <div class="container">
        ${!tool ? `
        <!-- Tool Selection -->
        <div class="card">
            <div class="card-body">
                <h2 style="font-size: 18px; margin-bottom: 16px;">Which AI tool do you want to connect?</h2>
                
                <div class="tool-grid">
                    <a href="/?shop=${shop}&tool=n8n" class="tool-option">
                        <div class="tool-icon">🔧</div>
                        <div class="tool-name">n8n</div>
                        <div class="tool-desc">Workflow automation</div>
                    </a>
                    <a href="/?shop=${shop}&tool=chatgpt" class="tool-option">
                        <div class="tool-icon">💬</div>
                        <div class="tool-name">ChatGPT</div>
                        <div class="tool-desc">OpenAI's assistant</div>
                    </a>
                    <a href="/?shop=${shop}&tool=claude" class="tool-option">
                        <div class="tool-icon">🧠</div>
                        <div class="tool-name">Claude</div>
                        <div class="tool-desc">Anthropic's AI</div>
                    </a>
                    <a href="/?shop=${shop}&tool=other" class="tool-option">
                        <div class="tool-icon">🔌</div>
                        <div class="tool-name">Other</div>
                        <div class="tool-desc">Custom MCP client</div>
                    </a>
                </div>
            </div>
        </div>
        ` : `
        <!-- Your Connection Key -->
        <div class="key-box">
            <div class="key-label">🔑 Your Connection Key</div>
            <div class="key-value">
                <input type="password" class="key-input" id="api-key" value="${apiKey || 'Complete Shopify connection first'}" readonly>
                <button class="btn btn-secondary" onclick="toggleKey()">Show</button>
                <button class="btn btn-primary" onclick="copyKey()">Copy</button>
            </div>
        </div>
        
        <!-- Steps for Selected Tool -->
        <div class="card">
            <div class="card-body">
                <h2 style="font-size: 18px; margin-bottom: 8px;">${tool.icon} Setup ${tool.name}</h2>
                <p style="color: #6d7175; margin-bottom: 16px;">Follow these ${tool.steps.length} simple steps:</p>
                
                <div class="steps-container">
                    ${tool.steps.map((s, i) => `
                    <div class="step">
                        <div class="step-number">${i + 1}</div>
                        <div class="step-content">
                            <div class="step-title">${s.title}</div>
                            <div class="step-description">${s.description}</div>
                            ${s.code ? `
                            <div class="step-code">
                                <button class="copy-btn" onclick="copyText(this)">Copy</button>
                                ${s.code}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <!-- Navigation -->
        <div class="nav-buttons">
            <a href="/?shop=${shop}" class="btn btn-secondary">← Choose Different Tool</a>
            <a href="/?shop=${shop}" class="btn btn-primary">Go to Dashboard →</a>
        </div>
        `}
    </div>
    
    <div class="toast" id="toast">✓ Copied!</div>
    
    <script>
        function toggleKey() {
            const input = document.getElementById('api-key');
            input.type = input.type === 'password' ? 'text' : 'password';
        }
        
        function copyKey() {
            const input = document.getElementById('api-key');
            input.type = 'text';
            input.select();
            document.execCommand('copy');
            input.type = 'password';
            showToast();
        }
        
        function copyText(btn) {
            const code = btn.parentElement.textContent.replace('Copy', '').trim();
            navigator.clipboard.writeText(code);
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
