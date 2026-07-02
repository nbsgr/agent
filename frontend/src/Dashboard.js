// Dashboard.js - VS Code Copilot Chat style shell.
// Conversation state lives in the frontend. The backend receives history per request.

(function () {
  "use strict";

  var DEFAULT_BASE_URL = window.BACKEND_URL || "https://1jr88jrl-5000.inc1.devtunnels.ms";
  var STORAGE_KEY = "aibot_conversations";
  var SETTINGS_KEY = "aibot_settings";
  var MODEL_KEY = "aibot_selected_model";

  var state = {
    sidebarOpen: true,
    conversations: [],
    activeConversationId: null,
    renamingId: null,
    renameValue: "",
    selectedModel: "",
    workspaceFolder: window.WORKSPACE_FOLDER || "",
    models: [],
    modelsByProvider: { ollama: [], llm7: [] },
    isVsCode: !!window.VSCODE,
    baseUrl: DEFAULT_BASE_URL,
    isOnline: false
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function genId() {
    return "conv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function loadConversations() {
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "requestConversations" });
      return;
    }
    try {
      state.conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (_) {
      state.conversations = [];
    }
    try {
      state.selectedModel = localStorage.getItem(MODEL_KEY) || "";
      var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (settings.baseUrl) {
        if (settings.baseUrl.indexOf("localhost") !== -1 || settings.baseUrl.indexOf("127.0.0.1") !== -1) {
          state.baseUrl = DEFAULT_BASE_URL;
        } else {
          state.baseUrl = settings.baseUrl;
        }
      }
    } catch (_) {}
  }

  function saveConversations() {
    var raw = JSON.stringify(state.conversations);
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "saveConversations", conversations: raw });
      return;
    }
    localStorage.setItem(STORAGE_KEY, raw);
  }

  function saveSelectedModel() {
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "saveSelectedModel", model: state.selectedModel });
      return;
    }
    localStorage.setItem(MODEL_KEY, state.selectedModel);
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl: state.baseUrl }));
    localStorage.setItem(MODEL_KEY, state.selectedModel);
  }

  window.loadConversationsFromExtension = function (conversationsJson, selectedModel) {
    try {
      state.conversations = typeof conversationsJson === "string"
        ? JSON.parse(conversationsJson || "[]")
        : Array.isArray(conversationsJson) ? conversationsJson : [];
      if (selectedModel) state.selectedModel = selectedModel;
    } catch (_) {
      state.conversations = [];
    }
    renderSidebar();
    if (!state.activeConversationId && state.conversations.length) {
      selectConversation(state.conversations[0].id);
    } else if (!state.conversations.length) {
      selectConversation(null);
    }
    updateModelSelectValue();
    updateModelBadge();
  };

  window.setDashboardWorkspace = function (folderPath) {
    state.workspaceFolder = folderPath || "";
    var display = document.getElementById("cfgWorkspaceDisplay");
    if (display) display.textContent = state.workspaceFolder || "(not detected)";
  };

  window.renderDashboard = function (container) {
    if (!container) return;
    loadConversations();
    container.innerHTML = buildShell();
    initUI();
    renderSidebar();
    loadModels();
    if (state.conversations.length) {
      selectConversation(state.conversations[0].id);
    } else {
      selectConversation(null);
    }
  };

  function buildShell() {
    return (
      '<div class="db-root">' +
        '<header class="db-header">' +
          '<div class="db-header-left">' +
            '<span class="db-copilot-mark">O</span>' +
            '<span class="db-title">Ollama Coder Agent</span>' +
            '<span class="db-model-badge" id="headerModelBadge"></span>' +
          '</div>' +
          '<div class="db-header-right">' +
            '<span class="db-status"><span class="db-status-dot connecting" id="status-dot"></span><span id="status-text">Connecting</span></span>' +
            '<button id="newChatHeaderBtn" class="db-icon-btn" title="New Chat">+</button>' +
          '</div>' +
        '</header>' +
        '<div class="db-body">' +
          '<nav class="db-rail">' +
            '<button id="rail-toggle" class="db-rail-btn" title="Toggle chats">☰</button>' +
            '<button id="rail-chat" class="db-rail-btn active" title="Chat">⌁</button>' +
            '<button id="rail-settings" class="db-rail-btn" title="Settings">⚙</button>' +
          '</nav>' +
          '<main class="db-viewport">' +
            '<section id="panel-chat" class="db-panel active">' +
              '<div class="db-chat-layout">' +
                '<aside id="chat-sidebar" class="db-sidebar open">' +
                  '<div class="db-sidebar-head"><span>Chats</span><button id="newChatBtn" class="db-mini-btn" title="New chat">+</button></div>' +
                  '<div id="thread-list" class="db-thread-list"></div>' +
                '</aside>' +
                '<section class="db-chat-main">' +
                  '<div class="db-model-bar">' +
                    '<label for="modelSelect">Model</label>' +
                    '<select id="modelSelect"></select>' +
                    '<button id="refreshModelsBtn" class="db-refresh-btn" title="Refresh models">↻</button>' +
                    '<button id="stopGenerationBtn" class="db-stop-gen-btn" title="Stop generation" style="display:none">Stop</button>' +
                  '</div>' +
                  '<div id="inlineTerminal" class="db-terminal">' +
                    '<div class="db-terminal-header"><span>Terminal</span><span id="terminalCwd">~</span><button id="clearTerminalBtn" class="db-term-clear">Clear</button></div>' +
                    '<div id="terminalOutputLines" class="db-terminal-body"></div>' +
                  '</div>' +
                  '<div id="chat-area-container"></div>' +
                '</section>' +
              '</div>' +
            '</section>' +
            '<section id="panel-settings" class="db-panel">' +
              '<div class="db-view-header"><h3>Settings</h3></div>' +
              '<div class="db-settings">' +
                '<div class="db-input-group"><label>Backend URL</label><input type="text" id="cfgBackendUrl" value="' + esc(state.baseUrl) + '" placeholder="https://1jr88jrl-5000.inc1.devtunnels.ms"></div>' +
                '<div class="db-input-group"><label>Workspace Folder</label><div id="cfgWorkspaceDisplay" class="db-workspace-display">' + esc(state.workspaceFolder || "(not detected)") + '</div></div>' +
                '<button id="saveSettingsBtn" class="db-save-btn">Save Settings</button>' +
                '<button id="clearAllConvBtn" class="db-danger-btn">Clear All Conversations</button>' +
              '</div>' +
            '</section>' +
          '</main>' +
        '</div>' +
      '</div>'
    );
  }

  function initUI() {
    document.getElementById("rail-toggle").onclick = toggleSidebar;
    document.getElementById("rail-chat").onclick = function () { switchPanel("panel-chat", this); };
    document.getElementById("rail-settings").onclick = function () { switchPanel("panel-settings", this); };
    document.getElementById("newChatBtn").onclick = createNewChat;
    document.getElementById("newChatHeaderBtn").onclick = createNewChat;
    document.getElementById("refreshModelsBtn").onclick = loadModels;
    document.getElementById("clearTerminalBtn").onclick = clearTerminal;

    var modelSelect = document.getElementById("modelSelect");
    modelSelect.onchange = function () {
      state.selectedModel = modelSelect.value;
      saveSelectedModel();
      updateModelBadge();
    };

    document.getElementById("saveSettingsBtn").onclick = function () {
      var input = document.getElementById("cfgBackendUrl");
      state.baseUrl = input.value.trim() || DEFAULT_BASE_URL;
      saveSettings();
      loadModels();
      checkHealth();
      var button = document.getElementById("saveSettingsBtn");
      button.textContent = "Saved";
      setTimeout(function () { button.textContent = "Save Settings"; }, 1200);
    };

    document.getElementById("clearAllConvBtn").onclick = function () {
      if (state.isVsCode && window.VSCODE_API) {
        window.VSCODE_API.postMessage({ type: "confirmClearAll" });
        return;
      }
      if (confirm("Delete all conversations?")) performClearAll();
    };

    document.getElementById("stopGenerationBtn").onclick = function () {
      if (window.stopCurrentChatStream) window.stopCurrentChatStream();
      showStopButton(false);
    };

    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        createNewChat();
      }
    });

    checkHealth();
  }

  function switchPanel(panelId, button) {
    document.querySelectorAll(".db-panel").forEach(function (panel) { panel.classList.remove("active"); });
    document.querySelectorAll(".db-rail-btn").forEach(function (btn) { btn.classList.remove("active"); });
    document.getElementById(panelId).classList.add("active");
    if (button) button.classList.add("active");
  }

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    var sidebar = document.getElementById("chat-sidebar");
    sidebar.classList.toggle("open", state.sidebarOpen);
    sidebar.classList.toggle("closed", !state.sidebarOpen);
  }

  function checkHealth() {
    var dot = document.getElementById("status-dot");
    var text = document.getElementById("status-text");
    if (dot) dot.className = "db-status-dot connecting";
    if (text) text.textContent = "Connecting";

    fetch(state.baseUrl + "/api/models")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function () {
        state.isOnline = true;
        if (dot) dot.className = "db-status-dot";
        if (text) text.textContent = "Online";
      })
      .catch(function () {
        state.isOnline = false;
        if (dot) dot.className = "db-status-dot offline";
        if (text) text.textContent = "Offline";
      });
  }

  function loadModels() {
    var select = document.getElementById("modelSelect");
    if (select) select.innerHTML = '<option value="">Loading models...</option>';

    fetch(state.baseUrl + "/api/models")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        var allModels = data.models || [];
        var ollamaModels = allModels.filter(function (m) { return m !== "llm7"; });
        var llm7Models = allModels.filter(function (m) { return m === "llm7"; });

        state.models = allModels;
        state.modelsByProvider = { ollama: ollamaModels, llm7: llm7Models };
        renderModelOptions();
        checkHealth();
      })
      .catch(function () {
        if (select) select.innerHTML = '<option value="">Unable to load models</option>';
      });
  }

  function renderModelOptions() {
    var select = document.getElementById("modelSelect");
    if (!select) return;
    select.innerHTML = "";

    if (!state.models.length) {
      select.innerHTML = '<option value="">No models available</option>';
      state.selectedModel = "";
      updateModelBadge();
      return;
    }

    appendProviderGroup(select, "Ollama local", state.modelsByProvider.ollama);
    appendProviderGroup(select, "LLM7 cloud", state.modelsByProvider.llm7);

    if (!select.options.length) {
      state.models.forEach(function (model) {
        var option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
      });
    }

    if (!state.selectedModel || !optionExists(select, state.selectedModel)) {
      state.selectedModel = select.options[0] ? select.options[0].value : "";
      saveSelectedModel();
    }
    updateModelSelectValue();
    updateModelBadge();
  }

  function appendProviderGroup(select, label, models) {
    if (!models || !models.length) return;
    var group = document.createElement("optgroup");
    group.label = label;
    models.forEach(function (model) {
      var option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      option.title = model;
      group.appendChild(option);
    });
    select.appendChild(group);
  }

  function optionExists(select, value) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) return true;
    }
    return false;
  }

  function updateModelSelectValue() {
    var select = document.getElementById("modelSelect");
    if (select && state.selectedModel && optionExists(select, state.selectedModel)) {
      select.value = state.selectedModel;
    }
  }

  function updateModelBadge() {
    var badge = document.getElementById("headerModelBadge");
    if (!badge) return;
    badge.textContent = state.selectedModel || "No model";
  }

  function renderSidebar() {
    var list = document.getElementById("thread-list");
    if (!list) return;
    list.innerHTML = "";

    if (!state.conversations.length) {
      list.innerHTML = '<div class="db-empty">No chats yet</div>';
      return;
    }

    state.conversations.forEach(function (conversation) {
      var item = document.createElement("div");
      item.className = "db-thread-item" + (state.activeConversationId === conversation.id ? " active" : "");
      item.dataset.id = conversation.id;

      if (state.renamingId === conversation.id) {
        var input = document.createElement("input");
        input.className = "db-rename-input";
        input.id = "rename-input-" + conversation.id;
        input.value = state.renameValue;
        item.appendChild(input);
      } else {
        item.innerHTML =
          '<span class="db-thread-title">' + esc(conversation.title || "New chat") + '</span>' +
          '<span class="db-thread-actions">' +
            '<button class="db-thread-dots" title="Rename" data-action="rename" data-id="' + esc(conversation.id) + '">✎</button>' +
            '<button class="db-thread-delete" title="Delete" data-action="delete" data-id="' + esc(conversation.id) + '">×</button>' +
          '</span>';
      }

      list.appendChild(item);
    });

    list.querySelectorAll(".db-thread-item").forEach(function (item) {
      item.onclick = function (event) {
        var button = event.target.closest("[data-action]");
        if (button) {
          if (button.dataset.action === "rename") startRename(button.dataset.id);
          if (button.dataset.action === "delete") deleteConversation(button.dataset.id);
          return;
        }
        if (state.renamingId !== item.dataset.id) selectConversation(item.dataset.id);
      };
    });

    if (state.renamingId) bindRenameInput();
  }

  function bindRenameInput() {
    var input = document.getElementById("rename-input-" + state.renamingId);
    if (!input) return;
    input.focus();
    input.select();
    input.onblur = function () { saveRename(state.renamingId); };
    input.onkeydown = function (event) {
      if (event.key === "Enter") saveRename(state.renamingId);
      if (event.key === "Escape") {
        state.renamingId = null;
        renderSidebar();
      }
    };
  }

  function selectConversation(id) {
    state.activeConversationId = id || null;
    state.renamingId = null;
    renderSidebar();

    var container = document.getElementById("chat-area-container");
    if (!container) return;

    if (!id) {
      container.innerHTML =
        '<div class="db-empty-chat">' +
          '<div class="db-empty-mark">C</div>' +
          '<p class="db-empty-chat-title">Ask Copilot about this workspace</p>' +
          '<p class="db-empty-chat-sub">Choose a model, then ask about code, files, terminal commands, or current web info.</p>' +
        '</div>';
      return;
    }

    var conversation = state.conversations.find(function (item) { return item.id === id; });
    if (conversation && typeof window.renderChatSpace === "function") {
      window.renderChatSpace(container, conversation, {
        model: state.selectedModel,
        workspaceFolder: state.workspaceFolder,
        baseUrl: state.baseUrl,
        onStreamStart: function () { showStopButton(true); },
        onStreamEnd: function () { showStopButton(false); },
        onStreamError: function () { showStopButton(false); }
      });
    }
  }

  function rerenderActiveChat() {
    if (state.activeConversationId) selectConversation(state.activeConversationId);
  }

  function createNewChat() {
    var conversation = {
      id: genId(),
      title: "New chat",
      messages: [],
      createdAt: Date.now()
    };
    state.conversations.unshift(conversation);
    saveConversations();
    selectConversation(conversation.id);
  }

  function startRename(id) {
    var conversation = state.conversations.find(function (item) { return item.id === id; });
    state.renamingId = id;
    state.renameValue = conversation ? conversation.title || "" : "";
    renderSidebar();
  }

  function saveRename(id) {
    var input = document.getElementById("rename-input-" + id);
    var title = input ? input.value.trim() : "";
    var conversation = state.conversations.find(function (item) { return item.id === id; });
    if (conversation && title) {
      conversation.title = title;
      saveConversations();
    }
    state.renamingId = null;
    renderSidebar();
  }

  function deleteConversation(id) {
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "confirmDelete", id: id });
      return;
    }
    if (confirm("Delete this conversation?")) performDelete(id);
  }

  function performDelete(id) {
    state.conversations = state.conversations.filter(function (item) { return item.id !== id; });
    if (state.activeConversationId === id) {
      state.activeConversationId = state.conversations[0] ? state.conversations[0].id : null;
    }
    saveConversations();
    renderSidebar();
    selectConversation(state.activeConversationId);
  }

  function performClearAll() {
    state.conversations = [];
    state.activeConversationId = null;
    saveConversations();
    renderSidebar();
    selectConversation(null);
  }

  window.performDeleteConversation = performDelete;
  window.performClearAllConversations = performClearAll;

  function showStopButton(show) {
    var button = document.getElementById("stopGenerationBtn");
    if (button) button.style.display = show ? "inline-flex" : "none";
  }

  window.updateAgentTimeline = function () {};
  window.clearAgentTimeline = function () {};

  window.appendTerminalLine = function (text, outputType) {
    if (!text) return;
    var terminal = document.getElementById("inlineTerminal");
    var lines = document.getElementById("terminalOutputLines");
    if (!terminal || !lines) return;
    terminal.classList.add("show");
    var line = document.createElement("div");
    line.className = "db-terminal-line " + (outputType === "stderr" || outputType === "err" ? "err" : outputType === "cmd" ? "cmd" : "out");
    line.textContent = text;
    lines.appendChild(line);
    lines.scrollTop = lines.scrollHeight;
  };

  window.clearTerminal = function () {
    var terminal = document.getElementById("inlineTerminal");
    var lines = document.getElementById("terminalOutputLines");
    if (lines) lines.innerHTML = "";
    if (terminal) terminal.classList.remove("show");
  };

  function clearTerminal() {
    window.clearTerminal();
  }

  window.getDashboardModel = function () { return state.selectedModel; };
  window.getDashboardWorkspace = function () { return state.workspaceFolder; };
  window.getDashboardBaseUrl = function () { return state.baseUrl; };

  window.saveConversationMessage = function (convId, role, content, extra) {
    var conversation = state.conversations.find(function (item) { return item.id === convId; });
    if (!conversation) return;
    if (!conversation.messages) conversation.messages = [];

    var message = { role: role, content: content || "", timestamp: Date.now() };
    extra = extra || {};
    if (extra.thinking) message.thinking = extra.thinking;
    if (extra.sources) message.sources = extra.sources;
    if (extra.image) message.image = extra.image;
    if (extra.images) message.images = extra.images;

    var last = conversation.messages[conversation.messages.length - 1];
    // Always merge into last message of same role — handles multi-iteration
    // tool loops where thinking + content arrive across multiple streaming turns
    if (last && last.role === role) {
      if (content) last.content = content;
      if (message.thinking) last.thinking = message.thinking;
      if (message.sources) last.sources = message.sources;
    } else {
      conversation.messages.push(message);
    }

    if (conversation.title === "New chat" && role === "user" && content) {
      conversation.title = content.slice(0, 44) + (content.length > 44 ? "..." : "");
    }

    saveConversations();
    renderSidebar();
  };

  window.updateConversationTitle = function (convId, title) {
    var conversation = state.conversations.find(function (item) { return item.id === convId; });
    if (conversation && title) {
      conversation.title = title;
      saveConversations();
      renderSidebar();
    }
  };

  window.webviewAlert = function (message) {
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "showAlert", message: message });
      return;
    }
    alert(message);
  };

  window.addEventListener("message", function (event) {
    var message = event.data || {};
    if (message.type === "loadConversations") {
      window.loadConversationsFromExtension(message.conversations, message.selectedModel);
    }
    if (message.type === "workspaceFolder") {
      window.setDashboardWorkspace(message.path);
    }
    if (message.type === "deleteConversationConfirmed") {
      performDelete(message.id);
    }
    if (message.type === "clearAllConversationsConfirmed") {
      performClearAll();
    }
    if (message.type === "newChat") {
      createNewChat();
    }
  });
}());
