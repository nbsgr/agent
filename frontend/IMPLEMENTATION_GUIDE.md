# COMPREHENSIVE SYSTEM UPDATE GUIDE

## Executive Summary

Your AI Bot Extension needs comprehensive updates to properly handle:
1. ✅ Dual-provider model selection (Ollama + LLM7)
2. ✅ Proper thinking token streaming and display  
3. ✅ GitHub Copilot-style action event streaming
4. ✅ Web search RAG pipeline integration
5. ✅ Frontend localStorage-based stateless backend

## BACKEND IMPLEMENTATION ROADMAP

### Phase 1: Provider Detection & Routing ✅ COMPLETED

**utils.py** - ✅ UPDATED
- Added `get_provider_for_model()` - detects 'ollama' or 'llm7'
- Added `get_models_split()` - returns {ollama_models, llm7_models, all_models}

**main.py** - ✅ UPDATED  
- Updated `/api/models` endpoint to return split model lists
- Response: {ollama_models: [...], llm7_models: [...], all_models: [...]}

### Phase 2: Generator & Provider Routing 🔄 IN PROGRESS

**agents.py** - NEEDS UPDATE
```python
# Current: Always sends to stream_llm
# Needed: Detect provider, route to correct API

provider = get_provider_for_model(model)  # Returns 'ollama' or 'llm7'
if provider == 'ollama':
    yield from _stream_ollama(...)
else:
    yield from _stream_llm7(...)
```

**generator.py** - NEEDS UPDATE
```python
# Current: Only handles Ollama
# Needed: Dual provider support

def stream_llm(messages, model, tools=None, provider='ollama'):
    if provider == 'llm7':
        yield from _stream_llm7(messages, model, tools)
    else:
        yield from _stream_ollama(messages, model, tools)

def _stream_llm7(messages, model, tools=None):
    """OpenAI-compatible API calls to https://api.llm7.io/v1"""
    # Same NDJSON response format as Ollama
```

### Phase 3: RAG Pipeline Integration

**rag.py** - NEW FILE NEEDED
```python
# Vector storage and retrieval
# Used by web_search tool to enhance context

def retrieve_context(query, top_k=5):
    # Retrieve relevant docs from web search results
    # Return as context for model

def embed_text(text):
    # Use nomic-embed-text-v2-moe via Ollama
    # Return embeddings
```

## FRONTEND IMPLEMENTATION ROADMAP

### Phase 1: Model Selection UI Update

**Dashboard.js** - NEEDS UPDATE
```javascript
// Current: Shows flat model list
// Needed: Show dual-provider with badges

const models = apiResponse.data;  // {ollama_models: [...], llm7_models: [...]}

// UI should show:
// [Ollama] qwen3.5:4b
// [Ollama] gemma4:12b
// [LLM7]   gpt-4
// [LLM7]   gpt-4-turbo

// When user selects "qwen3.5:4b", send raw name to backend
// Backend auto-detects provider
```

### Phase 2: Streaming Response Display

**ChatSpace.js** - NEEDS UPDATE
```javascript
// Current: Handles some thinking tokens
// Needed: Full GitHub Copilot-style streaming

// Show action events as breadcrumbs:
// ⚡ Detecting intent...
// 🔍 Searching the web...
// 📄 Processing results...
// 💭 Thinking...
// 📝 Generating response...

// NDJSON events to handle:
- {"type": "action", "action": "...", "status": "started"|"completed"}
- {"type": "thinking", "content": "...", "delta": true}
- {"type": "thinking_complete", "block_id": N, "full_content": "..."}
- {"type": "content", "content": "...", "delta": true}
- {"type": "tool_call", "tool": "...", "args": {...}}
- {"type": "done", "session_id": "...", "total_time_ms": N}
```

### Phase 3: Conversation Storage

**Dashboard.js** - NEEDS UPDATE
```javascript
// Frontend localStorage structure:

conversations: [
  {
    id: "conv-123",
    title: "First chat",
    timestamp: 1625097600000,
    messages: [
      {role: "user", content: "Hello", images?: []},
      {role: "assistant", content: "Hi!", thinking?: "...", tool_calls?: []}
    ]
  }
]

selectedModel: "qwen3.5:4b"  // Raw model name
```

## KEY INTEGRATION POINTS

### Request Flow

```
1. Frontend loads /api/models
   ↓
2. Gets {ollama_models, llm7_models, all_models}
   ↓
3. User selects model (e.g., "qwen3.5:4b")
   ↓
4. Frontend sends to /api/chat:
   {
     message: "...",
     model: "qwen3.5:4b",    ← Raw model name
     history: [...],          ← Full conversation
     workspaceFolder: "...",  ← Auto-detected
     sessionId: "..."
   }
   ↓
5. Backend:
   provider = get_provider_for_model("qwen3.5:4b")  → 'ollama'
   ↓
6. Route to correct stream function
   ↓
7. Stream NDJSON events back to frontend
   ↓
8. Frontend displays each event in real-time
```

### Response Format

ALL events must be newline-delimited JSON (NDJSON):

```
{"type":"action","action":"intent_detection","status":"started"}\n
{"type":"thinking","content":"Let me...","block_id":1,"delta":true}\n
{"type":"content","content":"I can","delta":true}\n
{"type":"content","content":" help","delta":true}\n
{"type":"done","session_id":"...","total_time_ms":1250}\n
```

## Files Requiring Updates

### Backend
- [ ] **agents.py** - Provider detection before stream_llm call
- [ ] **generator.py** - Add _stream_llm7() function
- [ ] **rag.py** - NEW - Vector retrieval logic (optional for v1)

### Frontend  
- [ ] **extension.js** - Minor: ensure proper message routing
- [ ] **Dashboard.js** - Model selector with dual providers
- [ ] **ChatSpace.js** - Action event display, thinking tokens
- [ ] **ChatSpace.css** - Styling for thinking blocks
- [ ] **index.html** - Updated meta tags if needed

## Testing Checklist

- [ ] `/api/models` returns both Ollama and LLM7 models
- [ ] Frontend displays model selector with provider badges
- [ ] Can select and use Ollama model (e.g., qwen3.5:4b)
- [ ] Thinking tokens display in collapsible section
- [ ] Action events show as breadcrumbs
- [ ] Web search tool integration works
- [ ] Conversations stored in localStorage
- [ ] Backend receives full history on each request
- [ ] Streaming responses appear in real-time

## Critical Settings (DO NOT CHANGE)

- ✅ Backend URL: Configure in extension.js → `BACKEND_URL`
- ✅ Workspace folder: Auto-detected from VSCode, NOT user-modifiable
- ✅ Ollama endpoint: localhost:11434
- ✅ LLM7 endpoint: https://api.llm7.io/v1

## Error Handling

1. If Ollama not running: Show error "Start Ollama desktop app or run: ollama serve"
2. If LLM7 API key invalid: Show error "Configure LLM7 API key in backend"
3. If model not found: Show "Selected model not available. Refresh and try again."
4. If streaming drops: Show "Connection interrupted" with retry button

