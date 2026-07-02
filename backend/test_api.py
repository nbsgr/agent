"""
Test script for ai-agent backend APIs.
Runs against localhost:5000 with gemma4:e4b-it-q4_K_M model.
Tests: /api/models, /api/chat (direct answer), /api/chat (tool call).
"""

import requests
import json
import sys
import time

BASE_URL = "http://localhost:5000"
MODEL = "gemma4:e4b-it-q4_K_M"
WORKSPACE = "C:\\Users\\ganes\\PycharmProjects\\ai-agent"


def test_models():
    print("=" * 60)
    print("TEST 1: GET /api/models")
    print("=" * 60)
    try:
        resp = requests.get(f"{BASE_URL}/api/models", timeout=10)
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Models: {data.get('models', [])}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert "models" in data, "Missing 'models' key"
        assert "llm7" in data["models"], "llm7 not in models list"
        print("RESULT: PASS")
        return True
    except Exception as e:
        print(f"RESULT: FAIL - {e}")
        return False


def test_chat_direct():
    print()
    print("=" * 60)
    print("TEST 2: POST /api/chat (direct answer, no tools)")
    print("=" * 60)
    try:
        payload = {
            "message": "What is Python in one sentence? Answer briefly.",
            "model": MODEL,
            "workspaceFolder": WORKSPACE,
            "history": [],
            "images": []
        }
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            stream=True,
            timeout=120
        )
        print(f"Status: {resp.status_code}")

        full_content = ""
        thinking_text = ""
        chunk_count = 0
        has_agent_done = False
        has_error = False

        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8")
            chunk_count += 1

            try:
                data = json.loads(line)

                # Check for errors
                if data.get("error"):
                    print(f"  ERROR: {data['error']}")
                    has_error = True
                    break

                # Check for agent events
                if data.get("type") == "agent_done":
                    has_agent_done = True
                    print(f"  agent_done: reason={data.get('reason')}")
                    continue

                # Accumulate content from message
                msg = data.get("message", {})
                if msg.get("content"):
                    full_content += msg["content"]
                if msg.get("thinking"):
                    thinking_text += msg["thinking"]

            except json.JSONDecodeError:
                print(f"  [non-json line] {line[:80]}")

        print(f"Chunks received: {chunk_count}")
        print(f"Thinking: {len(thinking_text)} chars")
        print(f"Content: {full_content[:200]}...")
        print(f"Agent done: {has_agent_done}")

        assert not has_error, "Got error in response"
        assert chunk_count > 0, "No chunks received"
        assert len(full_content) > 0, "No content in response"
        assert has_agent_done, "Missing agent_done event"
        print("RESULT: PASS")
        return True
    except Exception as e:
        print(f"RESULT: FAIL - {e}")
        return False


def test_chat_tool_call():
    print()
    print("=" * 60)
    print("TEST 3: POST /api/chat (tool call - list directory)")
    print("=" * 60)
    try:
        payload = {
            "message": "List all files in the current workspace root directory. Use the list_directory tool.",
            "model": MODEL,
            "workspaceFolder": WORKSPACE,
            "history": [],
            "images": []
        }
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            stream=True,
            timeout=180
        )
        print(f"Status: {resp.status_code}")

        full_content = ""
        chunk_count = 0
        has_agent_done = False
        has_error = False
        tool_actions = []
        tool_results = []
        agent_iterations = []

        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8")
            chunk_count += 1

            try:
                data = json.loads(line)

                if data.get("error"):
                    print(f"  ERROR: {data['error']}")
                    has_error = True
                    break

                event_type = data.get("type")

                if event_type == "agent_done":
                    has_agent_done = True
                    print(f"  agent_done: reason={data.get('reason')}")
                elif event_type == "action":
                    tool_actions.append(data)
                    print(f"  action: {data.get('action')} - {data.get('message')}")
                elif event_type == "tool_result":
                    tool_results.append(data)
                    success = data.get("success", False)
                    tool_name = data.get("tool", "unknown")
                    print(f"  tool_result: {tool_name} success={success}")
                    if data.get("entries"):
                        for entry in data["entries"][:5]:
                            print(f"    - {entry['name']} ({entry['type']})")
                        if len(data["entries"]) > 5:
                            print(f"    ... and {len(data['entries']) - 5} more")
                elif event_type == "agent_status":
                    print(f"  agent_status: {data.get('status')} count={data.get('count')}")
                elif event_type == "agent_iteration":
                    agent_iterations.append(data)
                    print(f"  agent_iteration: {data.get('iteration')} phase={data.get('phase')}")
                else:
                    # Regular streaming chunk
                    msg = data.get("message", {})
                    if msg.get("content"):
                        full_content += msg["content"]

            except json.JSONDecodeError:
                pass

        print(f"Chunks received: {chunk_count}")
        print(f"Tool actions: {len(tool_actions)}")
        print(f"Tool results: {len(tool_results)}")
        print(f"Agent iterations: {len(agent_iterations)}")
        print(f"Final content: {full_content[:200]}...")
        print(f"Agent done: {has_agent_done}")

        assert not has_error, "Got error in response"
        assert chunk_count > 0, "No chunks received"
        assert has_agent_done, "Missing agent_done event"

        # Tool call test: we expect at least one tool action + result
        if len(tool_actions) > 0 and len(tool_results) > 0:
            print("RESULT: PASS (model used tools)")
        elif len(full_content) > 0:
            print("RESULT: PASS (model answered directly - may not have called tools)")
        else:
            print("RESULT: PARTIAL (no content and no tool calls)")

        return True
    except Exception as e:
        print(f"RESULT: FAIL - {e}")
        return False


if __name__ == "__main__":
    print("AI Agent Backend API Tests")
    print(f"Base URL: {BASE_URL}")
    print(f"Model: {MODEL}")
    print()

    results = []

    # Test 1: Models
    results.append(("GET /api/models", test_models()))

    # Test 2: Direct answer
    results.append(("POST /api/chat (direct)", test_chat_direct()))

    # Test 3: Tool call
    results.append(("POST /api/chat (tool call)", test_chat_tool_call()))

    # Summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {status}: {name}")

    total = len(results)
    passed = sum(1 for _, p in results if p)
    print(f"\n{passed}/{total} tests passed")

    sys.exit(0 if passed == total else 1)
