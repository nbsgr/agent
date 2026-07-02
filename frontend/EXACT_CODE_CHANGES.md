# EXACT CODE CHANGES - LINE BY LINE

## WARNING: Use find-and-replace for these changes!

---

## FILE 1: agents.py

### CHANGE 1: Add import at top of file

**Find:**
```python
import json
import logging
import time

from generator import stream_llm
from tools import execute_tool, get_tool_schemas, set_workspace_root
```

**Replace with:**
```python
import json
import logging
import time

from utils import get_provider_for_model
from generator import stream_llm
from tools import execute_tool, get_tool_schemas, set_workspace_root
```

---

### CHANGE 2: Add provider detection in unified_stream()

**Find:**
```python
def unified_stream(session_id, message, model, images=None, workspace_folder="", history=None):
    """
    Unified execution stream. Single flow:
    1. Set workspace from frontend
    2. Build full message list: system prompt + history + current user message
    3. Send to model with tools available
    4. Model decides: direct response OR tool calls
    5. Stream everything as NDJSON via yield

    Yields unified event dicts continuously.
    Backend is STATELESS - history comes entirely from frontend.
    """
    logger.info("=========UNIFIED STREAM STARTED=========")
    logger.info(f"session={session_id} | model={model}")
    logger.info(f"message_len={len(message) if message else 0} | images={len(images) if images else 0}")
    logger.info(f"workspace={workspace_folder}")
    logger.info(f"history_count={len(history) if history else 0}")
    total_start = time.time()

    # ----- Step 0: Set workspace from frontend -----
    set_workspace_root(workspace_folder)
```

**Replace with:**
```python
def unified_stream(session_id, message, model, images=None, workspace_folder="", history=None):
    """
    Unified execution stream. Single flow:
    1. Set workspace from frontend
    2. Detect provider (Ollama or LLM7)
    3. Build full message list: system prompt + history + current user message
    4. Send to model with tools available
    5. Model decides: direct response OR tool calls
    6. Stream everything as NDJSON via yield

    Yields unified event dicts continuously.
    Backend is STATELESS - history comes entirely from frontend.
    """
    logger.info("=========UNIFIED STREAM STARTED=========")
    logger.info(f"session={session_id} | model={model}")
    logger.info(f"message_len={len(message) if message else 0} | images={len(images) if images else 0}")
    logger.info(f"workspace={workspace_folder}")
    logger.info(f"history_count={len(history) if history else 0}")
    total_start = time.time()

    # ----- Step 0: Set workspace from frontend -----
    set_workspace_root(workspace_folder)
    
    # ----- Step 0.5: Detect provider -----
    provider = get_provider_for_model(model)
    logger.info(f"PROVIDER DETECTED | model={model} | provider={provider}")
```

---

### CHANGE 3: Pass provider to _execute_tool_loop()

**Find:**
```python
    # ----- Step 2: Execute unified tool loop -----
    # The model itself decides whether to use tools or respond directly
    yield from _execute_tool_loop(session_id, full_messages, model, images)

    total_time_ms = int((time.time() - total_start) * 1000)
    logger.info(f"=========UNIFIED STREAM COMPLETE | timeMs={total_time_ms}=========")
    yield {"type": "done", "session_id": session_id, "total_time_ms": total_time_ms}
```

**Replace with:**
```python
    # ----- Step 2: Execute unified tool loop -----
    # The model itself decides whether to use tools or respond directly
    yield from _execute_tool_loop(session_id, full_messages, model, images, provider=provider)

    total_time_ms = int((time.time() - total_start) * 1000)
    logger.info(f"=========UNIFIED STREAM COMPLETE | timeMs={total_time_ms}=========")
    yield {"type": "done", "session_id": session_id, "total_time_ms": total_time_ms}
```

---

### CHANGE 4: Update _execute_tool_loop() signature

**Find:**
```python
def _execute_tool_loop(session_id, messages, model, images=None):
    """
    Execute tool-use agent loop.
    Model can call tools. Results are fed back. Max 20 iterations.
    Streams action events (started/completed) for each tool execution.
    """
    logger.info("=========EXECUTE TOOL LOOP=========")
```

**Replace with:**
```python
def _execute_tool_loop(session_id, messages, model, images=None, provider='ollama'):
    """
    Execute tool-use agent loop.
    Model can call tools. Results are fed back. Max 20 iterations.
    Streams action events (started/completed) for each tool execution.
    Routes to correct provider (Ollama or LLM7).
    """
    logger.info(f"=========EXECUTE TOOL LOOP | provider={provider}=========")
```

---

### CHANGE 5: Pass provider to stream_llm call

**Find (search for "stream_llm(" in the file):**
```python
        for event in stream_llm(
            messages=active_messages,
            model=model,
            tools=active_tools,
            images=images,
            options=options if not tools_disabled else OLLAMA_OPTIONS_CHAT,
            stream=True
        ):
```

**Replace with:**
```python
        for event in stream_llm(
            messages=active_messages,
            model=model,
            tools=active_tools,
            images=images,
            options=options if not tools_disabled else OLLAMA_OPTIONS_CHAT,
            stream=True,
            provider=provider
        ):
```

---

## FILE 2: generator.py

### CHANGE 1: Add imports

**Find:**
```python
import time
import logging
import requests
import json

from utils import (
    OLLAMA_CHAT_ENDPOINT,
    session as ollama_session,
)
```

**Replace with:**
```python
import time
import logging
import requests
import json
import httpx
import os

from utils import (
    OLLAMA_CHAT_ENDPOINT,
    session as ollama_session,
    LLM7_BASE_URL,
    LLM7_API_KEY,
)
```

---

### CHANGE 2: Add LLM7 configuration

**Find:**
```python
# =====================================================
# CONFIG
# Two separate option sets:
#  - CHAT: no tools active, smaller context, thinking enabled
#  - TOOLS: tools active, MUCH larger context needed because
#    17 tool schemas alone consume ~2500+ tokens.
#    qwen3.5:4b supports up to 32K context.
# =====================================================
```

**Replace with:**
```python
# =====================================================
# CONFIG - LLM7 API
# =====================================================
LLM7_BASE_URL_LOCAL = "https://api.llm7.io/v1"
LLM7_API_KEY_LOCAL = os.getenv('LLM7_API_KEY', 'placeholder-key')

# =====================================================
# CONFIG
# Two separate option sets:
#  - CHAT: no tools active, smaller context, thinking enabled
#  - TOOLS: tools active, MUCH larger context needed because
#    17 tool schemas alone consume ~2500+ tokens.
#    qwen3.5:4b supports up to 32K context.
# =====================================================
```

---

### CHANGE 3: Update stream_llm signature

**Find:**
```python
def stream_llm(messages, model="", tools=None, images=None, options=None, stream=True):
    """
    Unified LLM stream. Ollama only.
    Yields unified event dicts: {"type": "thinking"|"content"|"tool_call"|"error"|"done", ...}

    Args:
        messages: List of message dicts [{"role": "...", "content": "..."}]
        model: Model name (e.g., "qwen3.5:4b") - MUST be provided by frontend
        tools: Optional list of tool schemas for function calling
        images: Optional list of base64 image strings
        options: Optional dict of generation options (for Ollama)
        stream: Whether to stream (default True)
    """
```

**Replace with:**
```python
def stream_llm(messages, model="", tools=None, images=None, options=None, stream=True, provider='ollama'):
    """
    Unified LLM stream. Supports BOTH Ollama and LLM7.
    Routes based on provider parameter.
    Yields unified event dicts: {"type": "thinking"|"content"|"tool_call"|"error"|"done", ...}

    Args:
        messages: List of message dicts [{"role": "...", "content": "..."}]
        model: Model name (e.g., "qwen3.5:4b") - MUST be provided by frontend
        tools: Optional list of tool schemas for function calling
        images: Optional list of base64 image strings
        options: Optional dict of generation options
        stream: Whether to stream (default True)
        provider: Which provider to use: 'ollama' or 'llm7' (default 'ollama')
    """
```

---

### CHANGE 4: Add provider routing logic

**Find:**
```python
    # CRITICAL: Use the exact model name from frontend. No fallback.
    selected_model = model.strip() if model and model.strip() else ""

    if not selected_model:
        logger.error("=========STREAM LLM ERROR: NO MODEL PROVIDED=========")
        yield {"type": "error", "message": "No model specified. Frontend must send 'model' field."}
        return

    logger.info("=========STREAM LLM STARTED=========")
    logger.info(f"model={selected_model} | provider=ollama")
    logger.info(f"messages={len(messages)} | tools={bool(tools)} | images={len(images) if images else 0}")
    start_time = time.time()

    yield from _stream_ollama(messages, selected_model, tools, images, options, stream)

    time_ms = int((time.time() - start_time) * 1000)
    logger.info(f"=========STREAM LLM COMPLETE | timeMs={time_ms}=========")
```

**Replace with:**
```python
    # CRITICAL: Use the exact model name from frontend. No fallback.
    selected_model = model.strip() if model and model.strip() else ""

    if not selected_model:
        logger.error("=========STREAM LLM ERROR: NO MODEL PROVIDED=========")
        yield {"type": "error", "message": "No model specified. Frontend must send 'model' field."}
        return

    logger.info("=========STREAM LLM STARTED=========")
    logger.info(f"model={selected_model} | provider={provider}")
    logger.info(f"messages={len(messages)} | tools={bool(tools)} | images={len(images) if images else 0}")
    start_time = time.time()

    if provider == 'llm7':
        yield from _stream_llm7(messages, selected_model, tools, images, options, stream)
    else:
        yield from _stream_ollama(messages, selected_model, tools, images, options, stream)

    time_ms = int((time.time() - start_time) * 1000)
    logger.info(f"=========STREAM LLM COMPLETE | timeMs={time_ms}=========")
```

---

### CHANGE 5: Add _stream_llm7 function

**Find (at the end of generator.py):**
```python
def _stream_ollama(messages, model, tools=None, images=None, options=None, stream=True):
    # ... rest of _stream_ollama function ...
```

**Add this AFTER _stream_ollama function:**

```python
# =====================================================
# LLM7 STREAM (OpenAI-compatible API)
# =====================================================

def _stream_llm7(messages, model, tools=None, images=None, options=None, stream=True):
    """
    Stream from LLM7 (OpenAI-compatible API).
    Returns same NDJSON format as Ollama for consistency.
    """
    logger.info(f"STREAMING LLM7 | model={model}")
    
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
        "Authorization": f"Bearer {LLM7_API_KEY_LOCAL}",
        "Content-Type": "application/json"
    }
    
    try:
        with httpx.stream(
            "POST",
            f"{LLM7_BASE_URL_LOCAL}/chat/completions",
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
                        if content_buffer:
                            yield {"type": "content", "content": content_buffer}
                        if thinking_buffer:
                            yield {"type": "thinking_complete", "block_id": 1, "full_content": thinking_buffer}
                        yield {"type": "done"}
                        break
                    
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        
                        if "content" in delta:
                            content_buffer += delta["content"]
                            yield {"type": "content", "content": delta["content"], "delta": True}
                        
                        if "thinking" in delta:
                            thinking_buffer += delta["thinking"]
                            yield {"type": "thinking", "content": delta["thinking"], "block_id": 1, "delta": True}
                        
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

## TESTING AFTER CHANGES

### Test 1: Backend Changes
```bash
# Restart Flask
# Then test:
curl http://localhost:5000/api/models

# Should see both ollama and llm7 models
```

### Test 2: Chat with provider detection
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello",
    "model": "qwen3.5:4b",
    "sessionId": "test-123",
    "history": [],
    "workspaceFolder": "/home/user"
  }'

# Should work with Ollama model
```

### Test 3: Frontend Changes
1. Open VS Code
2. Open extension webview
3. Model dropdown should show both Ollama and LLM7 models with provider badges
4. Should be able to select model
5. Should be able to send message

---

## ✅ VERIFICATION

After all changes:

- [ ] Backend starts without errors
- [ ] `/api/models` returns split format
- [ ] Provider detection works
- [ ] Chat streams responses
- [ ] Frontend shows model dropdown with providers
- [ ] Frontend can send messages
- [ ] Action timeline shows in chat
- [ ] Thinking blocks display

