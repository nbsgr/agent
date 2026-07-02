// ChatSpace.js — GitHub Copilot-style streaming chat UI
// Handles: NDJSON streaming, thinking tokens, tool calls, actions, markdown
// Direct fetch to backend (no proxy needed with devtunnel)
// STATELESS: Frontend sends full conversation history on every request.

(function () {
  'use strict';

  // ── Icons (SVG strings) ────────────────────────────────────────
  var I = {
    bot:    '<svg class="cs-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H4a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zM7 14v2a1 1 0 1 0 2 0v-2H7zm8 0v2a1 1 0 1 0 2 0v-2h-2zM5 20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1H5v1z"/></svg>',
    send:   '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    attach: '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    think:  '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>',
    tool:   '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    check:  '<svg class="cs-icon cs-icon--check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    spin:   '<svg class="cs-icon cs-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>',
    err:    '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>',
    src:    '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    close:  '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    empty:  '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    stop:   '<svg class="cs-icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    copy:   '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    play:   '<svg class="cs-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    file:   '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    folder: '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
  };

  // ── Helpers ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function md(text) {
    if (!text) return '';
    if (typeof window.renderMarkdown === 'function') return window.renderMarkdown(text);
    return esc(text).replace(/\n/g, '<br>');
  }

  function mk(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function truncate(s, n) { return s.length > n ? s.substring(0, n) + '…' : s; }

  function flatStr(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── MAIN ENTRY ───────────────────────────────────────────────────
  window.renderChatSpace = function(container, conversation, options) {
    if (!container || !conversation) return;
    options = options || {};

    var convId = conversation.id;
    var baseUrl = options.baseUrl || (window.getDashboardBaseUrl ? window.getDashboardBaseUrl() : 'https://1jr88jrl-5000.inc1.devtunnels.ms');
    var model = options.model || (window.getDashboardModel ? window.getDashboardModel() : '');
    var workspace = options.workspaceFolder || (window.getDashboardWorkspace ? window.getDashboardWorkspace() : '');
    var onStreamStart = options.onStreamStart || function() {};
    var onStreamEnd = options.onStreamEnd || function() {};
    var onStreamError = options.onStreamError || function() {};

    container.innerHTML = buildShell(conversation.title || 'Chat');

    var msgList    = container.querySelector('.cs-msg-list');
    var input      = container.querySelector('.cs-textarea');
    var sendBtn    = container.querySelector('.cs-send-btn');
    var attachBtn  = container.querySelector('.cs-attach-btn');
    var fileInput  = container.querySelector('.cs-file-input');
    var previewBox = container.querySelector('.cs-img-preview');
    var previewImg = container.querySelector('.cs-preview-img');
    var clearImg   = container.querySelector('.cs-clear-img-btn');
    var charCount  = container.querySelector('.cs-char-count');
    var stopBtn    = container.querySelector('.cs-stop-btn');

    var pendingImage = null;
    var abortCtrl = null;

    // ── Streaming state ──────────────────────────────────────────
    var S = {
      isStreaming: false,
      botBody: null,
      thinkBlock: null,
      thinkPre: null,
      thinkText: '',
      fullThinking: '',        // accumulates ALL thinking across ALL iterations
      iterationThinking: '',   // thinking for current iteration only
      contentDiv: null,
      contentText: '',
      actionList: null,
      actionMap: {},
      fullResponse: '',
      sources: [],
      toolCallBlocks: {},
      iterationCount: 0,
      statusLines: []
    };

    function clearStatusLines(S) {
      if (S.statusLines && S.statusLines.length) {
        S.statusLines.forEach(function(el) {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        S.statusLines = [];
      }
    }

    function clearStreamTurn() {
      S.thinkBlock = null; S.thinkPre = null; S.thinkText = '';
      S.fullThinking = ''; S.iterationThinking = '';
      S.contentDiv = null; S.contentText = '';
      S.actionList = null; S.actionMap = {};
      S.sources = [];
      S.toolCallBlocks = {};
      S.iterationCount = 0;
      clearStatusLines(S);
    }

    // ── Load history ───────────────────────────────────────────────
    loadHistory(msgList, conversation.messages || []);

    // ── Auto-resize textarea ─────────────────────────────────────
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 180) + 'px';
      if (charCount) charCount.textContent = input.value.length;
    });

    // ── Keyboard ───────────────────────────────────────────────────
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    sendBtn.addEventListener('click', doSend);

    // ── Stop button ────────────────────────────────────────────────
    if (stopBtn) {
      stopBtn.addEventListener('click', function() {
        if (abortCtrl) {
          abortCtrl.abort();
          abortCtrl = null;
        }
        setStreaming(false);
        if (window.stopGeneration) window.stopGeneration();
      });
    }

    window.stopCurrentChatStream = function() {
      if (abortCtrl) {
        abortCtrl.abort();
        abortCtrl = null;
      }
      setStreaming(false);
      onStreamEnd();
    };

    // ── Image attach ─────────────────────────────────────────────
    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        pendingImage = ev.target.result.replace(/^data:[^;]+;base64,/, '');
        if (previewImg) previewImg.src = ev.target.result;
        if (previewBox) previewBox.style.display = 'flex';
      };
      reader.readAsDataURL(f);
      fileInput.value = '';
    });
    if (clearImg) {
      clearImg.addEventListener('click', function () {
        pendingImage = null;
        if (previewBox) previewBox.style.display = 'none';
      });
    }

    // ── Send ───────────────────────────────────────────────────────
    function doSend() {
      var text = input.value.trim();
      if (!text || S.isStreaming) return;

      // CRITICAL: Validate model is selected before sending
      var currentModel = (window.getDashboardModel ? window.getDashboardModel() : '') || model;
      var currentWorkspace = (window.getDashboardWorkspace ? window.getDashboardWorkspace() : '') || workspace;
      var currentBaseUrl = (window.getDashboardBaseUrl ? window.getDashboardBaseUrl() : '') || baseUrl;
      if (!currentModel) {
        if (window.webviewAlert) {
          window.webviewAlert('Please select a model from the dropdown before sending a message.');
        } else {
          alert('Please select a model from the dropdown before sending a message.');
        }
        return;
      }

      var imgB64 = pendingImage;
      pendingImage = null;
      if (previewBox) previewBox.style.display = 'none';
      input.value = '';
      input.style.height = 'auto';
      if (charCount) charCount.textContent = '0';

      // Clear timeline and terminal for new turn
      if (window.clearAgentTimeline) window.clearAgentTimeline();
      if (window.clearTerminal) window.clearTerminal();

      // Save user message to conversation
      if (!conversation.messages) conversation.messages = [];
      if (window.saveConversationMessage) {
        window.saveConversationMessage(convId, 'user', text, { image: imgB64 });
      } else {
        conversation.messages.push({
          role: 'user',
          content: text,
          image: imgB64,
          timestamp: Date.now()
        });
      }

      // Render user bubble
      appendUserBubble(msgList, text, imgB64);
      scrollBottom(msgList);

      // Prepare bot wrapper
      clearStreamTurn();
      S.fullResponse = '';
      S.botBody = appendBotWrapper(msgList);
      appendTyping(S.botBody);
      setStreaming(true);
      scrollBottom(msgList);

      // Build history for backend API (excluding the current user message we just saved)
      var history = conversation.messages.slice(0, -1).map(function(m) {
        var h = { role: m.role, content: m.content || '' };
        if (m.thinking) h.thinking = m.thinking;
        if (m.tool_calls) h.tool_calls = m.tool_calls;
        if (m.tool_call_id) h.tool_call_id = m.tool_call_id;
        if (m.images) h.images = m.images;
        // Handle legacy 'image' field
        if (m.image && !h.images) h.images = [m.image];
        return h;
      });

      // Build request body - CRITICAL: model is REQUIRED
      var body = {
        message: text,
        model: currentModel,  // REQUIRED - backend rejects without this
        session_id: convId,
        workspaceFolder: currentWorkspace,
        workspace_folder: currentWorkspace,
        history: history      // FULL conversation history from frontend
      };
      if (imgB64) body.images = [imgB64];

      // Start streaming
      onStreamStart();

      // Direct fetch to backend
      abortCtrl = new AbortController();

      fetch(currentBaseUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' },
        body: JSON.stringify(body),
        signal: abortCtrl.signal
      })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        var reader = res.body.getReader();
        var dec = new TextDecoder('utf-8');
        var buf = '';

        function pump() {
          return reader.read().then(function(c) {
            if (c.done) {
              if (buf.trim()) {
                try { handleEvent(JSON.parse(buf.trim()), S); } catch(e) {}
              }
              finishStream(S);
              setStreaming(false);
              onStreamEnd();
              saveBotResponse(S);
              scrollBottom(msgList);
              return;
            }
            buf += dec.decode(c.value, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop();
            lines.forEach(function(line) {
              line = line.trim();
              if (!line) return;
              try { 
                var ev = JSON.parse(line);
                handleEvent(ev, S); 
                scrollBottom(msgList);
              } catch(e) { 
                console.warn('Parse error:', e, line); 
              }
            });
            return pump();
          }).catch(function(e) {
            if (e.name !== 'AbortError') {
              handleStreamError(e);
              onStreamError(e);
            }
          });
        }
        return pump();
      })
      .catch(function(e) {
        if (e.name !== 'AbortError') {
          handleStreamError(e);
          onStreamError(e);
        }
      });
    }

    function handleStreamError(err) {
      removeTyping(S.botBody);
      var e = mk('div', 'cs-error-line');
      e.innerHTML = I.err + ' Error: ' + esc(err && err.message || String(err));
      if (S.botBody) S.botBody.appendChild(e);
      setStreaming(false);
      scrollBottom(msgList);
    }

    function saveBotResponse(S) {
      // Save whenever there is a response OR thinking (thinking-only turns happen during tool loops)
      if (S.fullResponse || S.fullThinking) {
        var extra = {};
        if (S.sources && S.sources.length) extra.sources = S.sources;
        if (S.fullThinking) extra.thinking = S.fullThinking;
        if (window.saveConversationMessage) {
          window.saveConversationMessage(convId, 'assistant', S.fullResponse, extra);
        } else {
          conversation.messages.push({
            role: 'assistant',
            content: S.fullResponse,
            thinking: S.fullThinking,
            timestamp: Date.now()
          });
        }
      }
    }

    function setStreaming(on) {
      S.isStreaming = on;
      sendBtn.disabled = on;
      input.disabled = on;
      sendBtn.classList.toggle('cs-send-btn--busy', on);
      if (stopBtn) stopBtn.style.display = on ? 'flex' : 'none';
      if (sendBtn) sendBtn.style.display = on ? 'none' : 'flex';
    }

    // =================================================================
    // EVENT HANDLER — Maps backend NDJSON events to UI
    // GitHub Copilot Chat-style action streaming
    // =================================================================
    function handleEvent(ev, S) {
      if (!ev) return;

      // 1. Raw Stream Chunks (has .message)
      if (ev.message) {
        var msg = ev.message;

        // --- Thinking Chunk ---
        if (msg.thinking) {
          removeTyping(S.botBody);
          if (!S.thinkBlock) {
            S.thinkBlock = appendThinkBlock(S.botBody);
            S.thinkPre = S.thinkBlock.querySelector('.cs-think-pre');
            S.thinkText = '';
            S.iterationThinking = '';
          }
          var chunk = msg.thinking;
          S.thinkText += chunk;
          S.iterationThinking += chunk;
          S.fullThinking += chunk;
          if (S.thinkPre) S.thinkPre.textContent = S.thinkText;
        }

        // --- Content Chunk ---
        if (msg.content) {
          if (S.thinkBlock) {
            var lbl = S.thinkBlock.querySelector('.cs-think-label');
            if (lbl) lbl.textContent = 'Thought process';
            S.thinkBlock = null; S.thinkPre = null; S.thinkText = ''; S.iterationThinking = '';
          }
          removeTyping(S.botBody);
          if (!S.contentDiv) { S.contentDiv = appendContentBlock(S.botBody); S.contentText = ''; }
          S.contentText += msg.content;
          S.fullResponse = S.contentText;
          S.contentDiv.innerHTML = md(S.contentText);
          bindCopyButtons(S.contentDiv);
        }

        // --- Tool Calls Incremental or End ---
        if (msg.tool_calls && msg.tool_calls.length) {
          removeTyping(S.botBody);
          msg.tool_calls.forEach(function (tc) {
            var toolName = tc.function?.name || tc.name || '';
            var toolArgs = tc.function?.arguments || tc.arguments || {};
            var toolId = tc.id || 'tool_' + Date.now();
            if (!S.toolCallBlocks[toolId]) {
              S.toolCallBlocks[toolId] = appendToolCallBlock(S.botBody, toolName, toolArgs, toolId);
            }
          });
        }
        return;
      }

      // 2. Event Types
      if (ev.type) {
        switch (ev.type) {
          case 'thinking': {
            removeTyping(S.botBody);
            if (!S.thinkBlock) {
              S.thinkBlock = appendThinkBlock(S.botBody);
              S.thinkPre = S.thinkBlock.querySelector('.cs-think-pre');
              S.thinkText = '';
              S.iterationThinking = '';
            }
            var chunk = ev.content || '';
            S.thinkText += chunk;
            S.iterationThinking += chunk;
            S.fullThinking += chunk;
            if (S.thinkPre) S.thinkPre.textContent = S.thinkText;
            break;
          }

          case 'thinking_complete': {
            if (S.thinkBlock) {
              var fullThink = ev.full_thinking || ev.full_content || S.thinkText;
              if (fullThink) {
                if (S.iterationThinking && S.fullThinking.endsWith(S.iterationThinking)) {
                  S.fullThinking = S.fullThinking.slice(0, -S.iterationThinking.length) + fullThink;
                } else {
                  S.fullThinking = fullThink;
                }
              }
              if (S.thinkPre) S.thinkPre.textContent = S.thinkText;
              var lbl = S.thinkBlock.querySelector('.cs-think-label');
              if (lbl) lbl.textContent = 'Thought process';
              S.thinkBlock.open = true;
            }
            S.thinkBlock = null; S.thinkPre = null; S.thinkText = ''; S.iterationThinking = '';
            break;
          }

          case 'content': {
            removeTyping(S.botBody);
            if (!S.contentDiv) { S.contentDiv = appendContentBlock(S.botBody); S.contentText = ''; }
            S.contentText += (ev.content || '');
            S.fullResponse = S.contentText;
            S.contentDiv.innerHTML = md(S.contentText);
            bindCopyButtons(S.contentDiv);
            break;
          }

          case 'tool_call': {
            removeTyping(S.botBody);
            var toolId = ev.id || 'tool_' + Date.now();
            S.toolCallBlocks[toolId] = appendToolCallBlock(S.botBody, ev.tool, ev.args, ev.id);
            S.thinkBlock = null; S.thinkPre = null; S.thinkText = '';
            break;
          }

          // Backend tool execution started
          case 'action': {
            removeTyping(S.botBody);
            var action = ev.action;
            if (!S.actionList) S.actionList = appendActionList(S.botBody);
            var key = (action || 'act') + '|' + S.iterationCount;
            S.actionMap[key] = appendActionItem(S.actionList, action, ev.message, 'started', S.iterationCount);
            if (typeof window.updateAgentTimeline === 'function') {
              window.updateAgentTimeline({ text: (ev.message || action) + '…', status: 'running' });
            }
            break;
          }

          // Backend tool execution completed
          case 'tool_result': {
            removeTyping(S.botBody);
            var action = ev.tool;
            var key = (action || 'act') + '|' + S.iterationCount;
            var existing = S.actionMap[key];
            var success = ev.success !== false;
            var resultMsg = ev.message || (success ? 'Success' : 'Failed');
            if (existing) {
              completeActionItem(existing, resultMsg, null, success);
            } else {
              if (!S.actionList) S.actionList = appendActionList(S.botBody);
              appendActionItem(S.actionList, action, null, 'completed', S.iterationCount, resultMsg, null, success);
            }
            if (typeof window.updateAgentTimeline === 'function') {
              window.updateAgentTimeline({ text: action + (success ? ' ✓' : ' ✗'), status: success ? 'done' : 'error' });
            }
            appendToolResultBlock(S.botBody, action, ev);
            break;
          }

          // Backend agent status updates
          case 'agent_status': {
            removeTyping(S.botBody);
            var statusMsg = ev.status === 'executing_tools' ? 'Executing ' + ev.count + ' tool call(s)...' : ev.status || '';
            appendStatusLine(S.botBody, statusMsg);
            break;
          }

          // Backend loop iteration markers
          case 'agent_iteration': {
            S.iterationCount = ev.iteration;
            // Clear block refs so next loop has its own block
            S.thinkBlock = null; S.thinkPre = null; S.thinkText = ''; S.iterationThinking = '';
            S.contentDiv = null; S.contentText = '';
            clearStatusLines(S);
            break;
          }

          case 'agent_done':
          case 'done': {
            removeTyping(S.botBody);
            if (ev.full_content && !S.contentDiv) {
              S.contentDiv = appendContentBlock(S.botBody);
              S.contentDiv.innerHTML = md(ev.full_content);
              S.fullResponse = ev.full_content;
            }
            if (ev.sources && ev.sources.length) {
              S.sources = ev.sources;
              appendSources(S.botBody, ev.sources);
            }
            S.thinkBlock = null; S.thinkPre = null;
            clearStatusLines(S);
            break;
          }

          case 'sources': {
            if (ev.sources && ev.sources.length) {
              S.sources = ev.sources;
              appendSources(S.botBody, ev.sources);
            }
            break;
          }

          case 'agent_error':
          case 'error': {
            removeTyping(S.botBody);
            var errDiv = mk('div', 'cs-error-line');
            errDiv.innerHTML = I.err + ' ' + esc(ev.message || ev.error || 'Error from agent');
            if (S.botBody) S.botBody.appendChild(errDiv);
            if (typeof window.updateAgentTimeline === 'function') {
              window.updateAgentTimeline({ text: 'Error: ' + (ev.message || 'Unknown'), status: 'error' });
            }
            clearStatusLines(S);
            break;
          }

          case 'status': {
            removeTyping(S.botBody);
            appendStatusLine(S.botBody, ev.message);
            break;
          }

          case 'keepalive': {
            break;
          }
        }
      }
    }

    function finishStream(S) {
      removeTyping(S.botBody);
      S.thinkBlock = null; S.thinkPre = null;
    }

    // =================================================================
    // DOM BUILDERS
    // =================================================================
    function buildShell(title) {
      return (
        '<div class="cs-root">' +
          '<div class="cs-header">' +
            '<span class="cs-header-avatar">' + I.bot + '</span>' +
            '<span class="cs-header-title">' + esc(title) + '</span>' +
          '</div>' +
          '<div class="cs-msg-list"></div>' +
          '<div class="cs-composer">' +
            '<div class="cs-img-preview" style="display:none">' +
              '<img class="cs-preview-img" src="" alt=""/>' +
              '<button type="button" class="cs-clear-img-btn" title="Remove">' + I.close + '</button>' +
            '</div>' +
            '<div class="cs-composer-row">' +
              '<button type="button" class="cs-attach-btn" title="Attach image">' + I.attach + '</button>' +
              '<textarea class="cs-textarea" rows="1" placeholder="Ask anything… (Enter to send · Shift+Enter for newline)"></textarea>' +
              '<button type="button" class="cs-send-btn" title="Send">' + I.send + '</button>' +
              '<button type="button" class="cs-stop-btn" title="Stop generation" style="display:none">' + I.stop + '</button>' +
            '</div>' +
            '<div class="cs-composer-footer">' +
              '<span class="cs-char-count">0</span>' +
              '<span class="cs-hint">Shift+Enter · new line</span>' +
            '</div>' +
          '</div>' +
          '<input type="file" class="cs-file-input" accept="image/*" style="display:none"/>' +
        '</div>'
      );
    }

    function appendUserBubble(msgList, text, imgB64) {
      var row = mk('div', 'cs-row cs-row--user');
      var bub = mk('div', 'cs-user-bubble');
      if (imgB64) {
        var img = mk('img', 'cs-attach-thumb');
        img.src = 'data:image/png;base64,' + imgB64;
        img.alt = 'attachment';
        bub.appendChild(img);
      }
      if (text) {
        var sp = mk('span', 'cs-user-text');
        sp.textContent = text;
        bub.appendChild(sp);
      }
      // Timestamp
      var ts = mk('span', 'cs-msg-time');
      ts.textContent = formatTime(Date.now());
      bub.appendChild(ts);

      row.appendChild(bub);
      msgList.appendChild(row);
      return row;
    }

    function appendBotWrapper(msgList) {
      var row = mk('div', 'cs-row cs-row--bot');
      var av = mk('div', 'cs-bot-avatar');
      av.innerHTML = I.bot;
      var body = mk('div', 'cs-bot-body');
      row.appendChild(av);
      row.appendChild(body);
      msgList.appendChild(row);
      return body;
    }

    function appendTyping(body) {
      if (!body || body.querySelector('.cs-typing')) return;
      var d = mk('div', 'cs-typing');
      d.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(d);
    }

    function removeTyping(body) {
      if (!body) return;
      var t = body.querySelector('.cs-typing');
      if (t && t.parentNode) t.parentNode.removeChild(t);
    }

    function appendStatusLine(body, message) {
      if (!body) return null;
      var d = mk('div', 'cs-status-line');
      d.innerHTML = '<span class="cs-status-bullet">·</span> <span class="cs-status-text">' + esc(message) + '</span>';
      body.appendChild(d);
      if (S.statusLines) S.statusLines.push(d);
      return d;
    }

    function appendThinkBlock(body) {
      if (!body) return null;
      var det = mk('details', 'cs-think-block');
      det.open = true; // Open by default while streaming
      det.innerHTML =
        '<summary class="cs-think-summary">' +
          I.think +
          '<span class="cs-think-label">Thinking…</span>' +
          '<span class="cs-think-chevron"></span>' +
        '</summary>' +
        '<pre class="cs-think-pre"></pre>';
      body.appendChild(det);
      return det;
    }

    function appendContentBlock(body) {
      if (!body) return null;
      var d = mk('div', 'cs-content-block');
      body.appendChild(d);
      return d;
    }

    function appendToolCallBlock(body, tool, args, id) {
      if (!body) return;
      var d = mk('div', 'cs-tool-call');
      var argsStr = '';
      try { argsStr = JSON.stringify(args, null, 2); } catch (_) { argsStr = String(args || ''); }
      d.innerHTML =
        '<div class="cs-tool-call-head">' +
          I.tool +
          '<span class="cs-tool-name">' + esc(tool || 'tool') + '</span>' +
          (id ? '<span class="cs-tool-id">#' + esc(String(id).substring(0, 8)) + '</span>' : '') +
        '</div>' +
        (argsStr ? '<pre class="cs-tool-args"><code>' + esc(argsStr) + '</code></pre>' : '');
      body.appendChild(d);
      return d;
    }

    function appendToolResultBlock(body, tool, ev) {
      if (!body) return null;
      var d = mk('div', 'cs-tool-result-block');
      var success = ev.success !== false;
      var statusColor = success ? '#4ec9b0' : '#f85149';
      
      d.innerHTML =
        '<div class="cs-tool-result-head" style="color: ' + statusColor + '; border-bottom: 1px solid #2a2a2a; border-left: 3px solid ' + statusColor + ';">' +
          I.bot +
          '<span class="cs-tool-name" style="margin-left: 6px;">' + esc(tool || 'tool') + ' Result</span>' +
          '<span class="cs-tool-id" style="color: ' + statusColor + '; margin-left: auto;">' + (success ? 'Success' : 'Failed') + '</span>' +
        '</div>';
        
      var bodyPre = mk('pre', 'cs-tool-result-body');
      var text = '';
      
      if (ev.content != null) {
        text = ev.content;
      } else if (ev.output != null) {
        text = ev.output;
      } else if (ev.message != null) {
        text = ev.message;
      } else if (ev.entries) {
        text = ev.entries.map(function(e) {
          return '- [' + e.type.toUpperCase() + '] ' + e.name;
        }).join('\n');
      } else if (ev.matches) {
        text = ev.matches.map(function(m) { return '- ' + m; }).join('\n');
      } else if (ev.info) {
        try { text = JSON.stringify(ev.info, null, 2); } catch(_) { text = String(ev.info); }
      } else if (ev.datetime) {
        text = 'Datetime: ' + ev.datetime;
      } else {
        try { text = JSON.stringify(ev, null, 2); } catch(_) { text = String(ev); }
      }
      
      bodyPre.textContent = text;
      d.appendChild(bodyPre);
      body.appendChild(d);
      return d;
    }

    function appendActionList(body) {
      if (!body) return null;
      var d = mk('div', 'cs-action-list');
      body.appendChild(d);
      return d;
    }

    function appendActionItem(list, action, args, status, iteration, result, timeMs, success) {
      if (!list) return null;
      var item = mk('div', 'cs-action-item cs-action-item--' + status);
      var statusIcon = status === 'completed' ? (success === false ? I.err : I.check) : I.spin;
      var iterText = iteration != null ? '<span class="cs-action-iter">#' + iteration + '</span>' : '';
      item.innerHTML =
        '<span class="cs-action-status-icon">' + statusIcon + '</span>' +
        iterText +
        '<span class="cs-action-label">' + fmtActionLabel(action, args) + '</span>' +
        (timeMs != null ? '<span class="cs-action-time">' + timeMs + 'ms</span>' : '') +
        (status === 'completed' && result != null ? '<span class="cs-action-result">' + esc(truncate(flatStr(result), 120)) + '</span>' : '');
      list.appendChild(item);
      return item;
    }

    function completeActionItem(item, result, timeMs, success) {
      if (!item) return;
      item.classList.remove('cs-action-item--started');
      item.classList.add('cs-action-item--completed');
      if (success === false) item.classList.add('cs-action-item--error');
      var ico = item.querySelector('.cs-action-status-icon');
      if (ico) ico.innerHTML = success === false ? I.err : I.check;
      if (timeMs != null) {
        var t = item.querySelector('.cs-action-time') || mk('span', 'cs-action-time');
        t.textContent = timeMs + 'ms';
        if (!t.parentNode) item.appendChild(t);
      }
      if (result != null) {
        var r = item.querySelector('.cs-action-result') || mk('span', 'cs-action-result');
        r.textContent = truncate(flatStr(result), 120);
        if (!r.parentNode) item.appendChild(r);
      }
    }

    function appendSources(body, sources) {
      if (!body || !sources || !sources.length) return;
      var d = mk('div', 'cs-sources');
      d.innerHTML = '<span class="cs-sources-lbl">Sources</span>';
      sources.forEach(function (s) {
        var label = s.title || s.name || s.path || s.url || String(s);
        var url = s.url || s.path || null;
        var chip;
        if (url) {
          chip = mk('a', 'cs-source-chip');
          chip.href = url;
          chip.target = '_blank';
          chip.rel = 'noopener noreferrer';
        } else {
          chip = mk('span', 'cs-source-chip');
        }
        chip.innerHTML = I.src + '<span>' + esc(label) + '</span>';
        d.appendChild(chip);
      });
      body.appendChild(d);
    }

    // =================================================================
    // HISTORY LOADING
    // =================================================================
    function loadHistory(msgList, messages) {
      msgList.innerHTML = '';

      if (!messages || messages.length === 0) {
        renderEmptyState(msgList);
        return;
      }

      messages.forEach(function(m) {
        if (!m) return;
        if (m.role === 'user') {
          appendUserBubble(msgList, m.content || '', m.image || null);
        } else if (m.role === 'assistant') {
          var body = appendBotWrapper(msgList);
          // Restore thinking — keep open so user can read it
          if (m.thinking) {
            var det = appendThinkBlock(body);
            var pre = det.querySelector('.cs-think-pre');
            if (pre) pre.textContent = m.thinking;
            var lbl = det.querySelector('.cs-think-label');
            if (lbl) lbl.textContent = 'Thought process (' + m.thinking.length + ' chars)';
            det.open = true;
          }
          var d = appendContentBlock(body);
          d.innerHTML = md(m.content || '');
          bindCopyButtons(d);
          // Restore sources
          if (m.sources && m.sources.length) {
            appendSources(body, m.sources);
          }
        }
      });

      scrollBottom(msgList);
    }

    function renderEmptyState(msgList) {
      msgList.innerHTML =
        '<div class="cs-empty-state">' +
          '<div class="cs-empty-icon">' + I.empty + '</div>' +
          '<p class="cs-empty-title">How can I help?</p>' +
          '<p class="cs-empty-sub">Ask me anything about your code, files, or project.</p>' +
        '</div>';
    }

    // =================================================================
    // COPY BUTTONS FOR CODE BLOCKS
    // =================================================================
    function bindCopyButtons(container) {
      if (!container) return;
      var pres = container.querySelectorAll('.md-code-wrap');
      pres.forEach(function(wrap) {
        var btn = wrap.querySelector('.md-copy-btn');
        if (btn && !btn._bound) {
          btn._bound = true;
          btn.addEventListener('click', function() {
            var codeEl = wrap.querySelector('code');
            var text = codeEl ? codeEl.textContent : '';
            if (navigator.clipboard) {
              navigator.clipboard.writeText(text).then(function() {
                btn.classList.add('md-copied');
                setTimeout(function() { btn.classList.remove('md-copied'); }, 1500);
              }).catch(function(err) {
                console.warn('Copy failed:', err);
              });
            }
          });
        }
      });
    }

    // =================================================================
    // UTILITIES
    // =================================================================
    function scrollBottom(el) {
      if (!el) return;
      requestAnimationFrame(function () { el.scrollTop = el.scrollHeight; });
    }

    function fmtActionLabel(action, args) {
      var s = '<code class="cs-action-name">' + esc(action || 'action') + '</code>';
      if (args) {
        try {
          var a = typeof args === 'string' ? JSON.parse(args) : args;
          var keys = Object.keys(a).slice(0, 2);
          if (keys.length) {
            s += ' <span class="cs-action-args">';
            s += keys.map(function (k) {
              return '<span class="cs-ak">' + esc(k) + '</span>=<span class="cs-av">' + esc(truncate(String(a[k]), 30)) + '</span>';
            }).join(' ');
            s += '</span>';
          }
        } catch (_) {}
      }
      return s;
    }

  };
}());
