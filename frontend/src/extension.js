import * as vscode from "vscode";
import * as path from "path";

let statusBarItem;
let activeTerminal = null;
let currentWebview = null;
let sidebarWebviewView = null;
let extensionContext = null;

// =====================================================
// CONFIG - Backend URL (DevTunnel) - ONLY MODIFIABLE SETTING
// =====================================================
const DEFAULT_BACKEND_URL = "https://1jr88jrl-5000.inc1.devtunnels.ms";
const API_TIMEOUT = 600000; // 10 minutes for streaming

// Track active streams for abort
const activeStreams = new Map();

// =====================================================
// ACTIVATE
// =====================================================
export function activate(context) {
  console.log("[EXTENSION] AI Bot Extension Activated");
  extensionContext = context;

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "aibot.openSidebar";
  statusBarItem.text = "$(comment-discussion) AI Bot";
  statusBarItem.tooltip = "Open AI Bot chat";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("aibot.openSidebar", () => {
      vscode.commands.executeCommand("aibot.chatView.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aibot.openPanel", () => {
      createOrShowPanel(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aibot.newChat", () => {
      if (currentWebview) {
        currentWebview.postMessage({ type: "newChat" });
      }
    })
  );

  // Sidebar provider
  const sidebarProvider = new SidebarWebviewViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("aibot.chatView", sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Terminal cleanup
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === activeTerminal) activeTerminal = null;
    })
  );

  // Health check
  checkFlaskHealth();
}

// =====================================================
// SIDEBAR WEBVIEW PROVIDER
// =====================================================
class SidebarWebviewViewProvider {
  constructor(extensionUri) { this.extensionUri = extensionUri; }

  resolveWebviewView(webviewView, context, token) {
    console.log("[EXTENSION] resolveWebviewView called");
    sidebarWebviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.extensionUri.fsPath, "src"))]
    };

    const html = getWebviewHtml(webviewView.webview, this.extensionUri);
    webviewView.webview.html = html;

    // Handle messages FROM webview
    webviewView.webview.onDidReceiveMessage((message) => {
      handleFrontendMessage(message, webviewView.webview);
    });

    // Send initial data: workspaceFolder is auto-detected, NOT modifiable by user
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
    setTimeout(() => {
      if (!webviewView.webview) return;
      webviewView.webview.postMessage({
        type: "workspaceFolder",
        path: workspaceFolder
      });
      try {
        const stored = extensionContext?.globalState.get('aibot_conversations', '[]') || '[]';
        const selectedModel = extensionContext?.globalState.get('aibot_selected_model', '') || '';
        webviewView.webview.postMessage({
          type: "loadConversations",
          conversations: stored,
          selectedModel: selectedModel
        });
      } catch (e) {
        console.error("[EXTENSION] Failed to load conversations:", e);
      }
    }, 500);

    currentWebview = webviewView.webview;
  }
}

// =====================================================
// PANEL CREATOR
// =====================================================
function createOrShowPanel(extensionUri) {
  const panel = vscode.window.createWebviewPanel(
    "aibotPanel",
    "AI Bot",
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, "src"))]
    }
  );

  panel.webview.html = getWebviewHtml(panel.webview, extensionUri);

  panel.webview.onDidReceiveMessage((message) => {
    handleFrontendMessage(message, panel.webview);
  });

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
  const selectedModel = extensionContext?.globalState.get('aibot_selected_model', '') || '';
  setTimeout(() => {
    if (panel.webview) {
      panel.webview.postMessage({
        type: "workspaceFolder",
        path: workspaceFolder
      });
      panel.webview.postMessage({
        type: "loadConversations",
        conversations: extensionContext?.globalState.get('aibot_conversations', '[]') || '[]',
        selectedModel: selectedModel
      });
    }
  }, 500);

  currentWebview = panel.webview;
}

// =====================================================
// HTML GENERATOR
// =====================================================
function getWebviewHtml(webview, extensionUri) {
  const srcPath = path.join(extensionUri.fsPath, "src");
  const nonce = getNonce();

  const dashboardCss = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, "Dashboard.css")));
  const chatSpaceCss = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, "ChatSpace.css")));
  const markdownJs = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, "MarkdownRenderer.js")));
  const dashboardJs = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, "Dashboard.js")));
  const chatSpaceJs = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, "ChatSpace.js")));

  // Auto-detect workspace folder from VSCode - NOT modifiable by user
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
  const backendUrl = getBackendUrl();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; font-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'; connect-src https: http:;">
  <title>AI Bot</title>
  <link rel="stylesheet" href="${dashboardCss}">
  <link rel="stylesheet" href="${chatSpaceCss}">
</head>
<body>
  <div id="app"></div>

  <script nonce="${nonce}">
    window.BACKEND_URL = "${backendUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";
    // Workspace folder is auto-detected from VSCode and is NOT modifiable by user
    window.WORKSPACE_FOLDER = "${workspaceFolder.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";
    window.VSCODE = true;
    window.USE_EXTENSION_PROXY = false; // Direct fetch via devtunnel
    try {
      const vscode = acquireVsCodeApi();
      window.VSCODE_API = vscode;
      console.log("[WEBVIEW] VS Code API acquired");
    } catch(e) {
      console.error("[WEBVIEW] Failed to acquire VS Code API:", e);
    }
  </script>

  <script nonce="${nonce}" src="${markdownJs}"></script>
  <script nonce="${nonce}" src="${dashboardJs}"></script>
  <script nonce="${nonce}" src="${chatSpaceJs}"></script>

  <script nonce="${nonce}">
    console.log("[WEBVIEW] Scripts loaded, calling renderDashboard...");
    if (typeof renderDashboard === 'function') {
      renderDashboard(document.getElementById('app'));
      console.log("[WEBVIEW] renderDashboard called");
    } else {
      document.getElementById('app').innerHTML = '<div style="color:red;padding:20px;">Error: renderDashboard not found</div>';
    }
  </script>
</body>
</html>`;
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// =====================================================
// MESSAGE HANDLER
// Only handles: terminal commands, file operations, persistence
// Chat/Models are fetched directly by webview via devtunnel
// Workspace folder is auto-detected and NOT modifiable
// =====================================================
async function handleFrontendMessage(message, webview) {
  console.log("[EXTENSION] handleFrontendMessage:", message.type || message.command);

  const msgType = message.type || message.command;

  switch (msgType) {
    // === DIALOGS ===
    case "showAlert": {
      if (message.message) {
        vscode.window.showErrorMessage(message.message);
      }
      break;
    }

    case "confirmDelete": {
      vscode.window.showWarningMessage(
        "Are you sure you want to delete this conversation?",
        { modal: true },
        "Delete"
      ).then(choice => {
        if (choice === "Delete" && webview) {
          webview.postMessage({ type: "deleteConversationConfirmed", id: message.id });
        }
      });
      break;
    }

    case "confirmClearAll": {
      vscode.window.showWarningMessage(
        "Are you sure you want to delete ALL conversations? This cannot be undone.",
        { modal: true },
        "Delete All"
      ).then(choice => {
        if (choice === "Delete All" && webview) {
          webview.postMessage({ type: "clearAllConversationsConfirmed" });
        }
      });
      break;
    }
    // === TERMINAL COMMANDS ===
    case "runInTerminal":
    case "terminalCommand": {
      executeCommandInVSCodeTerminal(message.text);
      break;
    }

    case "terminalOutput": {
      if (message.forwardToTerminal && message.text) {
        writeToVSCodeTerminal(message.text, message.outputType || "stdout");
      }
      break;
    }

    // === WORKSPACE (auto-detected, NOT modifiable) ===
    case "requestWorkspaceFolder": {
      const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
      webview.postMessage({ type: "workspaceFolder", path: wsFolder });
      break;
    }

    // === CONVERSATIONS PERSISTENCE (frontend-only, backend is stateless) ===
    case "saveConversations": {
      if (message.conversations && extensionContext) {
        try {
          await extensionContext.globalState.update('aibot_conversations', message.conversations);
          console.log("[EXTENSION] Saved conversations");
        } catch (e) {
          console.error("[EXTENSION] Failed to save conversations:", e);
        }
      }
      break;
    }

    case "saveSelectedModel": {
      if (message.model && extensionContext) {
        try {
          await extensionContext.globalState.update('aibot_selected_model', message.model);
          console.log("[EXTENSION] Saved selected model:", message.model);
        } catch (e) {
          console.error("[EXTENSION] Failed to save selected model:", e);
        }
      }
      break;
    }

    case "requestConversations": {
      if (!extensionContext) {
        webview.postMessage({ type: "loadConversations", conversations: "[]", selectedModel: "" });
        return;
      }
      try {
        const stored = extensionContext.globalState.get('aibot_conversations', '[]');
        const selectedModel = extensionContext.globalState.get('aibot_selected_model', '');
        webview.postMessage({ type: "loadConversations", conversations: stored, selectedModel: selectedModel });
      } catch (e) {
        console.error("[EXTENSION] Failed to get conversations:", e);
        webview.postMessage({ type: "loadConversations", conversations: "[]", selectedModel: "" });
      }
      break;
    }

    // === FILE OPERATIONS ===
    case "openFile": {
      if (message.path) {
        const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
        const fullPath = path.join(wsPath, message.path);
        vscode.workspace.openTextDocument(fullPath).then(doc => {
          vscode.window.showTextDocument(doc);
        }).catch(err => {
          console.error("[EXTENSION] Failed to open file:", err);
          webview.postMessage({ type: "openFileError", path: message.path, error: err.message });
        });
      }
      break;
    }

    case "readFile": {
      if (message.path) {
        const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
        const fullPath = path.join(wsPath, message.path);
        try {
          const doc = await vscode.workspace.openTextDocument(fullPath);
          webview.postMessage({
            type: "fileContent",
            path: message.path,
            content: doc.getText(),
            language: doc.languageId
          });
        } catch (err) {
          webview.postMessage({ type: "fileContentError", path: message.path, error: err.message });
        }
      }
      break;
    }

    default: {
      console.log("[EXTENSION] Unknown message type:", msgType);
    }
  }
}

// =====================================================
// HEALTH CHECK
// =====================================================
async function checkFlaskHealth() {
  const backendUrl = getBackendUrl();
  try {
    const res = await fetch(backendUrl + "/api/models", { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const modelCount = data.models?.length || 0;
      statusBarItem.text = "$(comment-discussion) AI Bot (Online)";
      statusBarItem.tooltip = `Backend: ${backendUrl} | Models: ${modelCount}`;
    } else {
      statusBarItem.text = "$(warning) AI Bot (Backend Error)";
      statusBarItem.tooltip = `Backend error: HTTP ${res.status}`;
    }
  } catch (err) {
    statusBarItem.text = "$(warning) AI Bot (Offline)";
    statusBarItem.tooltip = `Cannot reach ${backendUrl}. Check devtunnel or backend URL setting.`;
  }
}

function getBackendUrl() {
  const configured = vscode.workspace.getConfiguration("aibot").get("backendUrl", DEFAULT_BACKEND_URL);
  return String(configured || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

// =====================================================
// TERMINAL HELPERS
// =====================================================
function getTerminal() {
  if (activeTerminal) return activeTerminal;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  activeTerminal = vscode.window.createTerminal({ name: "AI Bot", cwd: workspaceFolder });
  return activeTerminal;
}

function executeCommandInVSCodeTerminal(command) {
  if (!command) return;
  const terminal = getTerminal();
  terminal.show(true);
  terminal.sendText(command, true);
}

function writeToVSCodeTerminal(text, outputType) {
  if (!text) return;
  const terminal = getTerminal();
  terminal.show(true);
  const prefix = outputType === "stderr" ? "[ERROR] " : "[OUTPUT] ";
  text.split("\n").forEach(line => {
    if (line.trim()) terminal.sendText('echo "' + prefix + line.replace(/"/g, '\\"') + '"', true);
  });
}

// =====================================================
// DEACTIVATE
// =====================================================
export function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
  if (activeTerminal) activeTerminal.dispose();
  // Abort all active streams
  for (const [id, ac] of activeStreams) {
    ac.abort();
  }
  activeStreams.clear();
}
