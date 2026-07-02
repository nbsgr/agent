# COMPLETE CODE UPDATES FOR AI BOT EXTENSION

## STATUS: Phase 1 & 2 Implementation

This document contains complete code snippets for each file that needs updating.

---

## 1. BACKEND: agents.py - Provider Routing

### CURRENT ISSUE
```python
# Current approach - always calls stream_llm with Ollama
for event in _execute_tool_loop(session_id, full_messages, model, images):
    yield event
```

### SOLUTION: Add Provider Detection

```python
# At the start of unified_stream, add:

from utils import get_provider_for_model

def unified_stream(session_id, message, model, images=None, workspace_folder="", history=None):
    # ... existing code ...
    
    # ✅ ADDED: Detect provider BEFORE executing tool loop
    provider = get_provider_for_model(model)
    logger.info(f"PROVIDER DETECTED | model={model} | provider={provider}")
    
    # Pass provider to tool loop
    yield from _execute_tool_loop(session_id, full_messages, model, images, provider=provider)
    
    total_time_ms = int((time.time() - total_start) * 1000)
    logger.info(f"=========UNIFIED STREAM COMPLETE | timeMs={total_time_ms}=========")
    yield {"type": "done", "session_id": session_id, "total_time_ms": total_time_ms}


def _execute_tool_loop(session_id, messages, model, images=None, provider='ollama'):
    """
    Execute tool-use agent loop.
    Now accepts provider parameter to route to correct API.
    """
    logger.info(f"=========EXECUTE TOOL LOOP | provider={provider}=========")
    # ... rest of function stays the same ...
    
    # When calling stream_llm, pass provider:
    stream_args = {
        "messages": active_messages,
        "model": model,
        "tools": active_tools,
        "images": images,
        "options": options if not tools_disabled else OLLAMA_OPTIONS_CHAT,
        "provider": provider  # ✅ ADDED
    }
    
    for event in stream_llm(**stream_args):
        # ... existing event handling ...
        yield event
```

---

## 2. BACKEND: generator.py - Dual Provider Support

### CURRENT ISSUE
```python
# Only supports Ollama
def stream_llm(messages, model="", tools=None, images=None, ...):
    yield from _stream_ollama(...)
```

### SOLUTION: Add LLM7 Support

```python
import os
import httpx  # Add to imports

# Add LLM7 config
LLM7_BASE_URL = "https://api.llm7.io/v1"
LLM7_API_KEY = os.getenv('LLM7_API_KEY', 'your-key-here')

def stream_llm(messages, model="", tools=None, images=None, options=None, stream=True, provider='ollama'):
    """
    Unified LLM stream. Supports BOTH Ollama and LLM7.
    Routes based on provider parameter.
    """
    selected_model = model.strip() if model and model.strip() else ""
    
    if not selected_model:
        logger.error("NO MODEL PROVIDED")
        yield {"type": "error", "message": "No model specified."}
        return
    
    logger.info(f"STREAM LLM | model={selected_model} | provider={provider}")
    start_time = time.time()
    
    if provider == 'llm7':
        yield from _stream_llm7(messages, selected_model, tools, images, options, stream)
    else:
        yield from _stream_ollama(messages, selected_model, tools, images, options, stream)
    
    time_ms = int((time.time() - start_time) * 1000)
    logger.info(f"STREAM LLM COMPLETE | timeMs={time_ms}")


def _stream_llm7(messages, model, tools=None, images=None, options=None, stream=True):
    """
    Stream from LLM7 (OpenAI-compatible API).
    Returns same NDJSON format as Ollama for consistency.
    """
    logger.info(f"STREAMING LLM7 | model={model}")
    
    import json
    
    # Build request
    request_body = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 2048
    }
    
    if tools:
        request_body["tools"] = tools
    
    headers = {
        "Authorization": f"Bearer {LLM7_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        with httpx.stream(
            "POST",
            f"{LLM7_BASE_URL}/chat/completions",
            json=request_body,
            headers=headers,
            timeout=300
        ) as response:
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"LLM7 ERROR | status={response.status_code} | {error_text}")
                yield {"type": "error", "message": f"LLM7 API error: {error_text}"}
                return
            
            # Process streaming response
            content_buffer = ""
            thinking_buffer = ""
            
            for line in response.iter_lines():
                if not line:
                    continue
                
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        # End of stream
                        if content_buffer:
                            yield {"type": "content", "content": content_buffer}
                        if thinking_buffer:
                            yield {"type": "thinking_complete", "block_id": 1, "full_content": thinking_buffer}
                        yield {"type": "done"}
                        break
                    
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        
                        # Handle content
                        if "content" in delta:
                            content_buffer += delta["content"]
                            yield {"type": "content", "content": delta["content"], "delta": True}
                        
                        # Handle thinking (if model supports it)
                        if "thinking" in delta:
                            thinking_buffer += delta["thinking"]
                            yield {"type": "thinking", "content": delta["thinking"], "block_id": 1, "delta": True}
                        
                        # Handle tool calls
                        if "tool_calls" in delta:
                            for tool_call in delta["tool_calls"]:
                                yield {
                                    "type": "tool_call",
                                    "tool": tool_call.get("function", {}).get("name"),
                                    "args": json.loads(tool_call.get("function", {}).get("arguments", "{}")),
                                    "id": tool_call.get("id")
                                }
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse LLM7 response: {data_str}")
    
    except Exception as e:
        logger.error(f"LLM7 STREAM ERROR | {e}")
        yield {"type": "error", "message": f"Stream error: {str(e)}"}
```

---

## 3. BACKEND: rag.py - NEW FILE (OPTIONAL FOR V1)

```python
"""
Vector retrieval for RAG pipeline.
Used to enhance web search results with embeddings.
"""
import json
import logging
import time
from utils import OLLAMA_EMBED_ENDPOINT, session as ollama_session

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMBED_MODEL = "nomic-embed-text-v2-moe:latest"

def embed_text(text: str):
    """Generate embeddings for text using Ollama."""
    if not text:
        return None
    
    logger.info(f"EMBEDDING TEXT | length={len(text)}")
    
    try:
        response = ollama_session.post(
            OLLAMA_EMBED_ENDPOINT,
            json={"model": EMBED_MODEL, "input": text},
            timeout=30
        )
        
        if response.status_code == 200:
            embedding = response.json().get("embedding")
            logger.info(f"EMBEDDING SUCCESS | dim={len(embedding) if embedding else 0}")
            return embedding
        else:
            logger.error(f"EMBEDDING FAILED | status={response.status_code}")
            return None
    except Exception as e:
        logger.error(f"EMBEDDING ERROR | {e}")
        return None


def cosine_similarity(vec1, vec2):
    """Calculate cosine similarity between two vectors."""
    import math
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    mag1 = math.sqrt(sum(a ** 2 for a in vec1))
    mag2 = math.sqrt(sum(b ** 2 for b in vec2))
    
    if mag1 == 0 or mag2 == 0:
        return 0.0
    
    return dot_product / (mag1 * mag2)


def retrieve_context(query: str, documents: list, top_k: int = 3):
    """
    Retrieve top-k most relevant documents for query using cosine similarity.
    
    Args:
        query: Search query string
        documents: List of document strings to search
        top_k: Number of top results to return
    
    Returns:
        List of (document, similarity_score) tuples
    """
    logger.info(f"RETRIEVE CONTEXT | query_len={len(query)} | docs={len(documents)} | top_k={top_k}")
    
    if not documents:
        logger.warning("RETRIEVE CONTEXT | No documents provided")
        return []
    
    # Embed query
    query_embedding = embed_text(query)
    if not query_embedding:
        logger.warning("RETRIEVE CONTEXT | Failed to embed query")
        return documents[:top_k]  # Fallback: return first K docs
    
    # Embed and score documents
    scored_docs = []
    
    for doc in documents:
        doc_embedding = embed_text(doc[:500])  # Limit doc length for embedding
        if doc_embedding:
            score = cosine_similarity(query_embedding, doc_embedding)
            scored_docs.append((doc, score))
            logger.debug(f"DOC SCORE | len={len(doc[:50])}... | score={score:.4f}")
    
    # Sort by score and return top-k
    scored_docs.sort(key=lambda x: x[1], reverse=True)
    result = scored_docs[:top_k]
    
    logger.info(f"RETRIEVE CONTEXT COMPLETE | returned={len(result)}")
    return result
```

---

## 4. FRONTEND: Dashboard.js - Model Selector Update

### KEY CHANGES

```javascript
// In the model list fetch:

async function fetchModels() {
  try {
    const response = await fetch(`${state.baseUrl}/api/models`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    
    // ✅ UPDATED: Handle split model lists
    if (data.data && typeof data.data === 'object') {
      // New format: {ollama_models: [...], llm7_models: [...], all_models: [...]}
      state.models = [
        ...data.data.ollama_models.map(m => ({name: m, provider: 'ollama'})),
        ...data.data.llm7_models.map(m => ({name: m, provider: 'llm7'}))
      ];
      state.modelsByProvider = {
        ollama: data.data.ollama_models,
        llm7: data.data.llm7_models
      };
    } else if (Array.isArray(data.data)) {
      // Legacy format: flat array (for backward compatibility)
      state.models = data.data.map(m => ({name: m, provider: 'unknown'}));
    }
    
    renderModelSelector();
  } catch (e) {
    console.error('Failed to fetch models', e);
  }
}


// In model selector HTML generation:

function renderModelSelector() {
  let html = '<optgroup label="Local Models (Ollama)">';
  
  if (state.modelsByProvider && state.modelsByProvider.ollama) {
    state.modelsByProvider.ollama.forEach(model => {
      const selected = model === state.selectedModel ? 'selected' : '';
      html += `<option value="${model}" ${selected}>[Ollama] ${model}</option>`;
    });
  }
  
  html += '</optgroup><optgroup label="Cloud Models (LLM7)">';
  
  if (state.modelsByProvider && state.modelsByProvider.llm7) {
    state.modelsByProvider.llm7.forEach(model => {
      const selected = model === state.selectedModel ? 'selected' : '';
      html += `<option value="${model}" ${selected}>[LLM7] ${model}</option>`;
    });
  }
  
  html += '</optgroup>';
  
  const selector = document.querySelector('.db-model-select');
  if (selector) {
    selector.innerHTML = html;
    selector.value = state.selectedModel;
  }
}
```

---

## 5. FRONTEND: ChatSpace.js - Action Events Display

### KEY CHANGES

```javascript
// Add to streaming state initialization:

var S = {
  // ... existing fields ...
  actionTimeline: [],  // ✅ NEW: Track action events
  currentAction: null
};

// Add action event handler in NDJSON parser:

else if (event.type === 'action') {
  logger.info(`ACTION | ${event.action} | ${event.status}`);
  
  if (event.status === 'started') {
    // Show action started
    S.currentAction = event.action;
    addActionElement(event.action, 'started', event.args || event.query);
  } else if (event.status === 'completed') {
    // Update action with results
    updateActionElement(event.action, 'completed', event);
  }
  
  // Emit NDJSON
  yield _ndjson(event);
}

// Helper functions:

function addActionElement(action, status, details) {
  if (!S.actionList) {
    S.actionList = mk('div', 'cs-action-timeline');
    S.botBody.appendChild(S.actionList);
  }
  
  const icons = {
    'intent_detection': '🧠',
    'web_search': '🔍',
    'crawl_urls': '🕷️',
    'scrape_pages': '📄',
    'retrieve_context': '📚',
    'generate_response': '✍️',
    'read_file': '📖',
    'write_file': '✏️',
    'run_terminal': '⚙️'
  };
  
  const icon = icons[action] || '⚡';
  const label = action.replace(/_/g, ' ');
  
  const actionEl = mk('div', 'cs-action-item');
  actionEl.id = `action-${action}`;
  actionEl.innerHTML = `
    <div class="cs-action-icon">${icon}</div>
    <div class="cs-action-label">${label}...</div>
    <div class="cs-action-status ${status}">
      ${status === 'started' ? '<span class="cs-spinner"></span>' : '✓'}
    </div>
  `;
  
  if (details) {
    const detailsEl = mk('div', 'cs-action-details');
    detailsEl.textContent = truncate(flatStr(details), 100);
    actionEl.appendChild(detailsEl);
  }
  
  S.actionList.appendChild(actionEl);
  S.actionMap[action] = actionEl;
}

function updateActionElement(action, status, eventData) {
  const actionEl = S.actionMap[action];
  if (!actionEl) return;
  
  const statusEl = actionEl.querySelector('.cs-action-status');
  if (statusEl) {
    statusEl.innerHTML = '✓';
    statusEl.className = 'cs-action-status completed';
  }
  
  // Show result summary if available
  if (eventData.results_count !== undefined) {
    const resultEl = mk('div', 'cs-action-result');
    resultEl.textContent = `Found ${eventData.results_count} results`;
    actionEl.appendChild(resultEl);
  }
}
```

---

## 6. FRONTEND: ChatSpace.css - Add Styling for Actions

```css
/* Add to ChatSpace.css */

.cs-action-timeline {
  margin: 10px 0;
  padding: 8px 12px;
  background: #f5f5f5;
  border-left: 3px solid #4a9eff;
  border-radius: 4px;
}

.cs-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: #333;
}

.cs-action-icon {
  font-size: 16px;
  min-width: 20px;
}

.cs-action-label {
  flex: 1;
  font-weight: 500;
}

.cs-action-status {
  font-size: 12px;
  color: #999;
  min-width: 30px;
  text-align: right;
}

.cs-action-status.completed {
  color: #4caf50;
  font-weight: bold;
}

.cs-action-details {
  font-size: 11px;
  color: #666;
  margin-left: 28px;
  margin-top: 2px;
  padding: 4px 0;
}

.cs-spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Thinking block styling - updated */

.cs-thinking-block {
  margin: 8px 0;
  padding: 12px;
  background: #f0f0f0;
  border-left: 3px solid #9c27b0;
  border-radius: 4px;
  cursor: pointer;
}

.cs-thinking-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #9c27b0;
  font-size: 13px;
}

.cs-thinking-header::before {
  content: "💭";
  font-size: 14px;
}

.cs-thinking-content {
  display: none;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #ddd;
  font-size: 12px;
  line-height: 1.5;
  color: #666;
}

.cs-thinking-block.expanded .cs-thinking-content {
  display: block;
}

.cs-thinking-block.expanded .cs-thinking-header::before {
  content: "▼ 💭";
}
```

---

## 7. COMPLETION CHECKLIST

- [ ] Update utils.py - get_provider_for_model(), get_models_split()
- [ ] Update main.py - /api/models endpoint
- [ ] Update agents.py - Add provider detection
- [ ] Update generator.py - Add _stream_llm7()
- [ ] Create rag.py - Vector retrieval (optional)
- [ ] Update Dashboard.js - Model selector with providers
- [ ] Update ChatSpace.js - Action event display
- [ ] Update ChatSpace.css - Action/thinking styling
- [ ] Test /api/models endpoint
- [ ] Test model selection and display
- [ ] Test Ollama model inference
- [ ] Test thinking token display
- [ ] Test action timeline
- [ ] Test web search integration
- [ ] Test conversation storage

