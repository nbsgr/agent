# AI Bot Extension - Complete Analysis & Update Plan

## Current State Analysis

### ✅ What's Working
- Basic Flask backend structure
- Ollama integration
- Tool execution framework
- WebSocket support in extension

### ❌ Issues Found

1. **Frontend Model Selection**
   - Dashboard doesn't separate Ollama vs LLM7 models
   - ChatSpace sends model name but no provider info
   - No dual-model list handling

2. **Backend Model Endpoint**
   - `/api/models` only returns Ollama models
   - Missing LLM7 models from llm7.io
   - No provider separation in response

3. **Provider Routing**
   - No provider detection mechanism
   - Both Ollama and LLM7 APIs need different headers/auth
   - Generator.py only supports Ollama

4. **Streaming & Responses**
   - Action streaming not implemented like GitHub Copilot
   - Thinking tokens display not integrated
   - Tool responses not streamed properly

5. **Frontend Storage**
   - Conversations stored in localStorage ✓ (correct)
   - Model selection needs better state management
   - No dual-provider model list in storage

## Updated Execution Flow

```
1. User opens extension
   ↓
2. Frontend calls /api/models
   ↓
3. Backend returns {ollama_models: [...], llm7_models: [...]}
   ↓
4. Frontend displays model selector with provider badges
   ↓
5. User selects model (e.g., "qwen3.5:4b" from Ollama)
   ↓
6. Frontend stores: selectedModel="qwen3.5:4b" (raw name)
   ↓
7. User sends message → Frontend calls /api/chat with:
   {
     message: "...",
     model: "qwen3.5:4b",  ← raw model name (provider auto-detected)
     history: [...],        ← frontend localStorage
     workspaceFolder: "...", ← auto-detected from VSCode
     sessionId: "...",
     images: []
   }
   ↓
8. Backend determines provider: is_ollama("qwen3.5:4b") → true
   ↓
9. Backend calls unified_stream() with correct provider
   ↓
10. unified_stream() streams NDJSON events:
    - {"type": "action", "action": "intent_detection", "status": "started"}
    - {"type": "thinking", "content": "...", "block_id": 1, "delta": true}
    - {"type": "content", "content": "...", "delta": true}
    - {"type": "tool_call", "tool": "web_search", ...}
    - {"type": "action", "action": "web_search", "status": "started"}
    - ... (tool results)
    - {"type": "action", "action": "web_search", "status": "completed", "results_count": 5}
    - {"type": "done", "session_id": "...", "total_time_ms": ...}
    ↓
11. Frontend displays each event in real-time (like Copilot Chat):
    ┌─────────────────────────────────┐
    │ Agent is thinking...            │ (action)
    ├─────────────────────────────────┤
    │ 💭 Thinking: "Let me analyze..." │ (thinking)
    ├─────────────────────────────────┤
    │ ⚡ Searching the web for...     │ (tool_call start)
    │   Found 5 results               │ (tool completed)
    ├─────────────────────────────────┤
    │ Here's what I found...           │ (content)
    │ ... streaming token by token ... │ (delta)
    └─────────────────────────────────┘
    ↓
12. User message + bot response stored in frontend localStorage
    ↓
13. Next request includes all history (stateless backend)
```

## Files Changed

### Frontend
- ✏️ `extension.js` - API proxy, model handling, conversation storage
- ✏️ `ChatSpace.js` - Streaming UI, thinking tokens, action display
- ✏️ `Dashboard.js` - Model selector with dual-provider support
- ✏️ `index.html` - Updated styling for thinking/action blocks

### Backend
- ✏️ `main.py` - `/api/models` dual-list, `/api/chat` with proper routing
- ✏️ `utils.py` - `get_models_split()` returns {ollama, llm7}
- ✏️ `agents.py` - Provider-aware flow, action streaming
- ✏️ `generator.py` - Support both Ollama and LLM7 APIs
- ✏️ `tools.py` - Minor logging improvements
- ✏️ `text_search.py` - Ensure proper NDJSON streaming
- ✏️ `crawler.py` - Return proper crawl results
- ✏️ `scraper.py` - Extract and return text properly
- ✏️ `rag.py` - Vector retrieval (new/updated)

### Not Needed (can delete)
- `chat.py` - Standalone UI, not needed for extension
- `check.py` - Old validation, not needed
- `intent_processor.py` - Old flow, not needed

## Key Implementation Details

### Model Detection
```python
def get_provider_for_model(model_name):
    """Returns 'ollama' or 'llm7'"""
    ollama_names = get_ollama_models()
    if model_name in ollama_names:
        return 'ollama'
    else:
        return 'llm7'
```

### Response Format
```json
{
  "type": "action",
  "action": "web_search",
  "status": "started",
  "query": "...",
  "args": {...}
}
```

### Frontend Display Strategy
- Show action events as UI breadcrumbs/timeline
- Stream thinking blocks in collapsible section
- Stream content directly
- Handle tool calls with visual indicators

