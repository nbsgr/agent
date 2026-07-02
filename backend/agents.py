import json
import logging
import os
import requests
import tools
import utils

# =====================================================
# LOGGING
# =====================================================

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)


# =====================================================
# CONFIG
# =====================================================

MAX_ITERATIONS = 20

CLOUD_API_KEY = os.environ.get(
    "CLOUD_API_KEY",
    "YOUR_API_KEY_HERE"
)
CLOUD_API_URL = os.environ.get("CLOUD_API_URL", "https://api.llm7.io/v1")


# =====================================================
# TOOL DESCRIPTIONS FOR MODEL
# =====================================================

TOOL_DESCRIPTIONS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the full contents of a file at the given relative path inside the workspace. Returns the file text. Use this BEFORE editing any file so you know what is in it. Also use to inspect code, configs, logs, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path to the file inside the workspace, e.g. 'src/main.py' or 'README.md'"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create a new file or completely overwrite an existing file with the provided content. Parent directories are created automatically. Use this to create new files or when you need to rewrite a file entirely.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path to the file inside the workspace, e.g. 'src/app.js'"},
                    "content": {"type": "string", "description": "The complete file content to write"}
                },
                "required": ["file_path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "Replace the first occurrence of an exact string in a file with a new string. Use this for small, precise edits without rewriting the whole file. The old_string must match exactly (including whitespace and indentation).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path to the file inside the workspace"},
                    "old_string": {"type": "string", "description": "The exact string to find (must match precisely including whitespace)"},
                    "new_string": {"type": "string", "description": "The string to replace old_string with"}
                },
                "required": ["file_path", "old_string", "new_string"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Permanently delete a file from the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path to the file to delete"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_folder",
            "description": "Create a directory (and any parent directories) in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_path": {"type": "string", "description": "Relative path to the folder to create, e.g. 'src/components'"}
                },
                "required": ["folder_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_folder",
            "description": "Delete a folder and ALL its contents recursively from the workspace. Use with caution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_path": {"type": "string", "description": "Relative path to the folder to delete"}
                },
                "required": ["folder_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List all files and folders in a directory. Returns each entry's name and whether it is a file or directory. Use this to explore and understand the project structure before making changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_path": {"type": "string", "description": "Relative path to the folder to list. Use '.' for the workspace root."}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": "Recursively search for files matching a glob pattern (e.g., '*.py', '*.html', 'test_*') within a folder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Glob pattern to match filenames, e.g. '*.py', '*.js', 'Dockerfile'"},
                    "folder_path": {"type": "string", "description": "Relative path to search in. Defaults to workspace root."}
                },
                "required": ["pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_file_info",
            "description": "Get metadata about a file or folder: size in bytes, last modified time, creation time, and whether it is a file or directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path to the file or folder"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_terminal",
            "description": "Execute a shell command in the workspace directory and return its stdout, stderr, and exit code. Use for: running builds, installing packages, running tests, git commands, listing processes, checking versions, etc. The command runs with the workspace as the current directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to execute, e.g. 'npm install', 'python main.py', 'git status'"},
                    "timeout": {"type": "integer", "description": "Max seconds to wait. Default 30. Increase for long builds."}
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_datetime",
            "description": "Get the current date and time. Useful when the user asks about the current time or you need timestamps.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]


# =====================================================
# SYSTEM PROMPT
# =====================================================

SYSTEM_PROMPT = """You are an autonomous AI coding agent integrated into a VS Code extension. You operate inside a user's workspace and have access to tools for reading, writing, editing, deleting files, listing directories, searching files, and running terminal commands.

## YOUR ROLE
You are the decision-maker. For every user request, you MUST decide:
1. Can I answer this directly from my knowledge? → Answer immediately, do NOT call tools.
2. Do I need to inspect or modify files/folders or run commands? → Use the appropriate tools.

## DECISION RULES

**ANSWER DIRECTLY (no tools) when the user asks:**
- Knowledge questions: "What is Python?", "Explain async/await", "How does React work?"
- Conceptual help: "What design pattern should I use?", "Compare REST vs GraphQL"
- Code explanations: "What does this code do?" (if code is in the message itself)
- General advice: "How should I structure my project?"

**USE TOOLS when the user asks to:**
- Read, create, edit, or delete files → use read_file, write_file, edit_file, delete_file
- Explore project structure → use list_directory, search_files
- Run commands (build, test, install, git) → use run_terminal
- Any task that requires seeing or changing files in the workspace

## HOW TO WORK (Think → Plan → Act → Verify)

1. **Think**: Understand what the user wants. Break complex tasks into steps.
2. **Plan**: Decide which tools to call and in what order.
3. **Act**: Call tools one at a time. Read results carefully.
4. **Verify**: After making changes, verify they are correct (read the file back, run tests, etc.)

## WORKSPACE RULES
- The workspace path is provided by the system. Always use RELATIVE paths (e.g., 'src/main.py' not '/home/user/project/src/main.py').
- NEVER access files outside the workspace.
- ALWAYS read a file before editing it, so you understand its current content.
- When creating files, parent directories are created automatically.

## TOOL CALLING RULES
- Call ONE tool at a time unless multiple tools are completely independent.
- After receiving tool results, analyze them before deciding the next action.
- If a tool fails, read the error message, understand why, and try a different approach.
- You have a maximum of 20 tool iterations — use them wisely, do not waste calls.

## FILE EDITING RULES
- ALWAYS use read_file before edit_file — you need to know the exact content to replace.
- For small changes, use edit_file (find and replace exact strings).
- For large rewrites or new files, use write_file.
- Preserve existing code that the user did not ask to change.

## TERMINAL RULES
- Use run_terminal for: installing packages, running scripts, git operations, builds, tests.
- Read command output carefully — if it fails, analyze the error and fix it.
- Use appropriate timeouts for long-running commands (default is 30 seconds).

## RESPONSE RULES
- Be concise and clear.
- After completing a task, summarize what you did and the final result.
- Once you finish running tools and no further actions are needed, you MUST write a final text response confirming the completion of the requested task (e.g., "I have successfully deleted all files as requested..."). Do NOT output empty content or end the stream abruptly.
- If you encounter errors, explain what went wrong and what you tried.
- Format code in markdown code blocks with language tags.
"""


# =====================================================
# HELPER: BUILD MESSAGES
# =====================================================

def _build_messages(system_prompt, history, current_message, images):
    """Build the messages array for the LLM. Filter out existing system messages to avoid duplication."""
    messages = [{"role": "system", "content": system_prompt}]

    # Append history, skipping any existing system messages to avoid duplication
    for msg in history:
        if msg.get("role") != "system":
            messages.append(msg)

    # Current user message
    user_msg = {"role": "user", "content": current_message}
    if images:
        user_msg["images"] = images
    messages.append(user_msg)

    return messages


# =====================================================
# HELPER: SANITIZE MESSAGES FOR LLM SPECS
# =====================================================

def _sanitize_messages(messages, provider):
    """Sanitize the messages list to ensure it is fully compliant with target API specs."""
    sanitized = []
    for msg in messages:
        if not isinstance(msg, dict):
            try:
                msg = msg.model_dump() if hasattr(msg, "model_dump") else dict(msg)
            except Exception:
                continue

        role = msg.get("role")
        content = msg.get("content")

        if content is None:
            content = ""
        elif not isinstance(content, str):
            content = str(content)

        if role == "system":
            sanitized.append({"role": "system", "content": content})
        elif role == "user":
            user_msg = {"role": "user", "content": content}
            if "images" in msg:
                user_msg["images"] = msg["images"]
            sanitized.append(user_msg)
        elif role == "assistant":
            assistant_msg = {"role": "assistant", "content": content}
            
            # OpenAI/Cloud strict validations:
            # 1. Content cannot be empty if there are no tool calls.
            if provider == "cloud" and not assistant_msg["content"] and not msg.get("tool_calls"):
                assistant_msg["content"] = "Thinking..."
                
            # 2. Tool calls processing
            if msg.get("tool_calls"):
                tcs = []
                for tc in msg["tool_calls"]:
                    tc_id = tc.get("id") or tc.get("tool_call_id") or ""
                    if provider == "cloud" and not tc_id:
                        import uuid
                        tc_id = "call_mock_" + uuid.uuid4().hex[:8]
                        
                    func = tc.get("function", {})
                    func_name = func.get("name") or tc.get("name") or ""
                    func_args = func.get("arguments") or tc.get("arguments") or {}
                    if provider == "cloud":
                        if isinstance(func_args, dict):
                            func_args = json.dumps(func_args)
                    else:  # provider == "ollama"
                        if isinstance(func_args, str):
                            try:
                                func_args = json.loads(func_args)
                            except Exception:
                                func_args = {}
                        
                    tcs.append({
                        "id": tc_id,
                        "type": "function",
                        "function": {
                            "name": func_name,
                            "arguments": func_args
                        }
                    })
                assistant_msg["tool_calls"] = tcs
                if provider == "cloud":
                    assistant_msg["content"] = None
                    
            sanitized.append(assistant_msg)
        elif role == "tool":
            tool_msg = {"role": "tool", "content": content}
            tc_id = msg.get("tool_call_id")
            if provider == "cloud":
                tool_msg["tool_call_id"] = tc_id or "call_mock_1"
            else:
                tool_msg["name"] = msg.get("tool_name") or "tool"
            sanitized.append(tool_msg)
            
    return sanitized


# =====================================================
# HELPER: PARSE TOOL CALL (handles both dict and Pydantic)
# =====================================================

def _parse_tool_call(tc):
    """Parse tool call from Ollama Pydantic object or OpenAI dict format."""
    try:
        # If it's a Pydantic model (Ollama), use attribute access
        if hasattr(tc, "function"):
            func = tc.function
            tool_name = getattr(func, "name", "")
            args = getattr(func, "arguments", {})
            # Ollama arguments come as a dict already
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            return tool_name, args if isinstance(args, dict) else {}

        # If it's a dict (OpenAI/cloud or already converted)
        if isinstance(tc, dict):
            func = tc.get("function", {})
            tool_name = func.get("name", "")
            args = func.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            return tool_name, args if isinstance(args, dict) else {}

        return "", {}

    except Exception as e:
        logger.warning(f"[PARSE_TOOL_CALL] Failed to parse tool call: {e}")
        return "", {}


# =====================================================
# HELPER: CONVERT TOOL CALL TO DICT
# =====================================================

def _tool_call_to_dict(tc):
    """Convert a tool call (Pydantic or dict) to a plain dict for JSON serialization."""
    try:
        if hasattr(tc, "model_dump"):
            return tc.model_dump()
        if hasattr(tc, "__dict__"):
            func = tc.function
            return {
                "function": {
                    "name": getattr(func, "name", ""),
                    "arguments": getattr(func, "arguments", {})
                }
            }
        return tc
    except Exception:
        return {"function": {"name": "", "arguments": {}}}


# =====================================================
# HELPER: FORMAT TOOL RESULT FOR MODEL
# =====================================================

def _format_tool_result(tr):
    """Format a tool result as a clean string for the model. Avoids double JSON encoding."""
    result = tr["result"]
    parts = [f"Tool: {tr['tool_name']}"]
    parts.append(f"Success: {result.get('success', False)}")

    if result.get('content'):
        parts.append(f"Content:\n{result['content']}")
    elif result.get('output'):
        parts.append(f"Output:\n{result['output']}")
    elif result.get('message'):
        parts.append(f"Message: {result['message']}")
    elif result.get('entries'):
        parts.append(f"Entries: {json.dumps(result['entries'])}")
    elif result.get('matches'):
        parts.append(f"Matches: {json.dumps(result['matches'])}")
    elif result.get('info'):
        parts.append(f"Info: {json.dumps(result['info'])}")
    elif result.get('datetime'):
        parts.append(f"Datetime: {result['datetime']}")

    return "\n".join(parts)


# =====================================================
# MAIN STREAM FUNCTION
# =====================================================

def stream(message, model, workspace, history, images):
    """
    Main agent stream.
    The model itself decides whether to use tools or answer directly.

    NDJSON streaming: Each line is a JSON object followed by newline.
    The frontend handles rendering thinking tokens, content tokens, tool calls, etc.

    Agent loop: stream -> accumulate -> check tool_calls -> execute -> repeat.
    """
    logger.info("=" * 60)
    logger.info("[AGENT] STREAM STARTED")
    logger.info(f"[AGENT] Model: {model}")
    logger.info(f"[AGENT] Workspace: {workspace}")
    logger.info(f"[AGENT] History length: {len(history)}")
    logger.info(f"[AGENT] Images count: {len(images)}")
    logger.info("=" * 60)

    provider = utils.get_provider_for_model(model)
    logger.info(f"[AGENT] Provider detected: {provider}")

    # Build messages with dynamic system prompt including workspace location
    dynamic_system_prompt = SYSTEM_PROMPT
    if workspace:
        dynamic_system_prompt += f"\n\n## CURRENT WORKSPACE\nThe active workspace directory is: {workspace}\nYou are running inside this folder. To refer to this folder or list/read/delete its files, use the relative path '.' or the folder path directly. Do not hesitate to use tools on the workspace root '.' when requested."

    messages = _build_messages(dynamic_system_prompt, history, message, images)
    logger.info(f"[AGENT] Built messages array with {len(messages)} messages")

    iteration = 0
    while iteration < MAX_ITERATIONS:
        iteration += 1
        logger.info(f"[AGENT] === ITERATION {iteration}/{MAX_ITERATIONS} ===")

        # Accumulators for this iteration
        full_content = ""
        thinking = ""
        tool_calls = []
        stream_error = None

        if provider == "cloud":
            # ============================================================
            # CLOUD PROVIDER (LLM7) - OpenAI-compatible SSE streaming
            # Normalized to NDJSON for consistent frontend format
            # ============================================================
            url = f"{CLOUD_API_URL}/chat/completions"
            headers = {
                "Authorization": f"Bearer {CLOUD_API_KEY}",
                "Content-Type": "application/json"
            }
            sanitized_messages = _sanitize_messages(messages, "cloud")
            payload = {
                "model": "default",
                "messages": sanitized_messages,
                "stream": True
            }
            if TOOL_DESCRIPTIONS:
                payload["tools"] = TOOL_DESCRIPTIONS

            try:
                response = requests.post(url, headers=headers, json=payload, stream=True, timeout=120)
                response.raise_for_status()

                for line in response.iter_lines():
                    if not line:
                        continue
                    line = line.decode("utf-8")

                    # Parse SSE and normalize to NDJSON
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            continue
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})

                            # Accumulate content
                            if delta.get("content"):
                                full_content += delta["content"]

                            # Merge tool_calls by index (OpenAI streams incrementally)
                            for tc_delta in delta.get("tool_calls", []):
                                idx = tc_delta.get("index", 0)
                                while len(tool_calls) <= idx:
                                    tool_calls.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                                if tc_delta.get("id"):
                                    tool_calls[idx]["id"] = tc_delta["id"]
                                if tc_delta.get("type"):
                                    tool_calls[idx]["type"] = tc_delta["type"]
                                func = tc_delta.get("function", {})
                                if func.get("name"):
                                    tool_calls[idx]["function"]["name"] += func["name"]
                                if func.get("arguments"):
                                    tool_calls[idx]["function"]["arguments"] += func["arguments"]

                            # Normalize: yield as NDJSON (same format frontend expects)
                            # Convert SSE delta to Ollama-like chunk for frontend
                            ndjson_chunk = {
                                "model": data.get("model", model),
                                "message": {
                                    "role": "assistant",
                                    "content": delta.get("content", "")
                                },
                                "done": data.get("choices", [{}])[0].get("finish_reason") is not None
                            }

                            # Include tool_calls in the final chunk if present
                            finish_reason = data.get("choices", [{}])[0].get("finish_reason")
                            if finish_reason and tool_calls:
                                ndjson_chunk["message"]["tool_calls"] = tool_calls

                            yield json.dumps(ndjson_chunk) + "\n"

                        except json.JSONDecodeError:
                            pass

                logger.info(f"[CLOUD] Iteration {iteration} ended. Content: {len(full_content)} chars. Tool calls: {len(tool_calls)}")

            except Exception as e:
                logger.exception("[CLOUD] Streaming error")
                stream_error = str(e)
                yield json.dumps({"error": str(e)}) + "\n"

        else:
            # ============================================================
            # OLLAMA PROVIDER - Raw NDJSON streaming with think=True
            # Uses ollama Python SDK which returns Pydantic objects
            # ============================================================
            try:
                import ollama
            except ImportError:
                logger.error("[OLLAMA] ollama package not installed")
                yield json.dumps({"error": "ollama package not installed"}) + "\n"
                return

            try:
                # FIXED: renamed to ollama_stream to avoid shadowing the outer 'stream' function
                sanitized_messages = _sanitize_messages(messages, "ollama")
                ollama_stream = ollama.chat(
                    model=model,
                    messages=sanitized_messages,
                    tools=TOOL_DESCRIPTIONS if TOOL_DESCRIPTIONS else None,
                    stream=True,
                    think=True
                )

                for chunk in ollama_stream:
                    # FIXED: Convert Pydantic object to dict before json.dumps
                    try:
                        chunk_dict = chunk.model_dump() if hasattr(chunk, "model_dump") else dict(chunk)
                    except Exception:
                        chunk_dict = {"message": {"content": "", "role": "assistant"}, "done": False}

                    # Forward as NDJSON to frontend
                    yield json.dumps(chunk_dict) + "\n"

                    # Accumulate for agent loop decision-making
                    # FIXED: Use attribute access for Pydantic objects
                    msg = chunk.message if hasattr(chunk, "message") else None

                    if msg:
                        content_val = getattr(msg, "content", None) or ""
                        if content_val:
                            full_content += content_val

                        thinking_val = getattr(msg, "thinking", None) or ""
                        if thinking_val:
                            thinking += thinking_val

                        # FIXED: Handle tool_calls as Pydantic list
                        tc_list = getattr(msg, "tool_calls", None)
                        if tc_list:
                            tool_calls.extend(tc_list)

                logger.info(f"[OLLAMA] Iteration {iteration} ended. Content: {len(full_content)} chars. Thinking: {len(thinking)} chars. Tool calls: {len(tool_calls)}")

            except Exception as e:
                err_msg = str(e).lower()
                if "tools" in err_msg or "tool" in err_msg:
                    logger.warning(f"[OLLAMA] Model {model} may not support tools, retrying without")
                    try:
                        sanitized_messages = _sanitize_messages(messages, "ollama")
                        ollama_retry = ollama.chat(
                            model=model,
                            messages=sanitized_messages,
                            stream=True,
                            think=True
                        )
                        for chunk in ollama_retry:
                            try:
                                chunk_dict = chunk.model_dump() if hasattr(chunk, "model_dump") else dict(chunk)
                            except Exception:
                                chunk_dict = {"message": {"content": "", "role": "assistant"}, "done": False}

                            yield json.dumps(chunk_dict) + "\n"

                            msg = chunk.message if hasattr(chunk, "message") else None
                            if msg:
                                content_val = getattr(msg, "content", None) or ""
                                if content_val:
                                    full_content += content_val
                                thinking_val = getattr(msg, "thinking", None) or ""
                                if thinking_val:
                                    thinking += thinking_val

                        logger.info(f"[OLLAMA] Retry without tools succeeded. Content: {len(full_content)} chars")
                    except Exception as e2:
                        logger.exception("[OLLAMA] Retry streaming error")
                        stream_error = str(e2)
                        yield json.dumps({"error": str(e2)}) + "\n"
                else:
                    logger.exception("[OLLAMA] Streaming error")
                    stream_error = str(e)
                    yield json.dumps({"error": str(e)}) + "\n"

        if stream_error:
            logger.error(f"[AGENT] Stream error on iteration {iteration}: {stream_error}")
            yield json.dumps({"type": "agent_error", "message": stream_error}) + "\n"
            return

        # If no tool calls, the model answered directly — we are done
        if not tool_calls:
            logger.info("[AGENT] No tool calls. Task complete (direct answer).")
            yield json.dumps({"type": "agent_done", "reason": "direct_answer"}) + "\n"
            return

        # Execute tool calls
        logger.info(f"[AGENT] Executing {len(tool_calls)} tool call(s)...")
        yield json.dumps({"type": "agent_status", "status": "executing_tools", "count": len(tool_calls)}) + "\n"

        tool_results = []
        for tc in tool_calls:
            tool_name, arguments = _parse_tool_call(tc)
            tc_id = ""
            if hasattr(tc, "id"):
                tc_id = getattr(tc, "id", "") or ""
            elif isinstance(tc, dict):
                tc_id = tc.get("id", "") or ""

            logger.info(f"[AGENT] Executing tool: {tool_name} args={arguments} tool_call_id={tc_id}")

            for event in tools.execute_tool(tool_name, arguments, workspace):
                yield json.dumps(event) + "\n"
                if event.get("type") == "tool_result":
                    tool_results.append({
                        "tool_name": tool_name,
                        "tool_call_id": tc_id,
                        "result": event
                    })

        # Yield iteration separator so frontend knows tools are done
        yield json.dumps({"type": "agent_iteration", "iteration": iteration, "phase": "tools_executed"}) + "\n"

        # Append assistant response + tool results to messages for next iteration
        # FIXED: Convert Pydantic tool_calls to dicts for JSON serialization in messages
        tool_calls_dicts = [_tool_call_to_dict(tc) for tc in tool_calls]

        assistant_msg = {
            "role": "assistant",
            "content": full_content or ""
        }
        if tool_calls_dicts:
            assistant_msg["tool_calls"] = tool_calls_dicts
        messages.append(assistant_msg)

        # Add tool results as tool messages
        for tr in tool_results:
            messages.append({
                "role": "tool",
                "tool_call_id": tr["tool_call_id"] or "call_mock_1",
                "content": _format_tool_result(tr)
            })

        logger.info(f"[AGENT] Appended {len(tool_results)} tool results. Messages now: {len(messages)}")

    # Max iterations reached
    logger.warning(f"[AGENT] MAX ITERATIONS ({MAX_ITERATIONS}) REACHED")
    yield json.dumps({"type": "agent_done", "reason": "max_iterations"}) + "\n"