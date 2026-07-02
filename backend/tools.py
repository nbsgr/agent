import os
import sys
import shutil
import subprocess
import json
import logging
import datetime
import fnmatch
import threading
import queue

# =====================================================
# LOGGING
# =====================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(message)s"
)

logger = logging.getLogger(__name__)


# =====================================================
# HELPER: SAFE PATH
# =====================================================

def _safe_path(workspace, rel_path):
    """Resolve a path inside the workspace. Block directory traversal."""
    base = os.path.abspath(os.path.expanduser(workspace))
    target = os.path.abspath(os.path.join(base, rel_path))
    if not target.startswith(base):
        raise ValueError(f"Path traversal blocked: {rel_path}")
    return target


# =====================================================
# FILE TOOLS
# =====================================================

def read_file(arguments, workspace):
    file_path = arguments.get("file_path", "")
    logger.info(f"[READ_FILE] START file_path={file_path}")
    yield {
        "type": "action",
        "action": "read_file",
        "message": f"Reading file: {file_path}"
    }

    try:
        target = _safe_path(workspace, file_path)
        logger.info(f"[READ_FILE] resolved path={target}")

        if not os.path.exists(target):
            logger.warning(f"[READ_FILE] NOT_FOUND {target}")
            yield {
                "type": "tool_result",
                "tool": "read_file",
                "success": False,
                "message": f"File not found: {file_path}"
            }
            return

        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        logger.info(f"[READ_FILE] SUCCESS {file_path} ({len(content)} chars)")
        yield {
            "type": "tool_result",
            "tool": "read_file",
            "success": True,
            "file_path": file_path,
            "content": content
        }

    except Exception as e:
        logger.exception(f"[READ_FILE] ERROR {file_path}")
        yield {
            "type": "tool_result",
            "tool": "read_file",
            "success": False,
            "message": str(e)
        }


def write_file(arguments, workspace):
    file_path = arguments.get("file_path", "")
    content = arguments.get("content", "")
    logger.info(f"[WRITE_FILE] START file_path={file_path} ({len(content)} chars)")
    yield {
        "type": "action",
        "action": "write_file",
        "message": f"Writing file: {file_path}"
    }

    try:
        target = _safe_path(workspace, file_path)
        os.makedirs(os.path.dirname(target), exist_ok=True)

        with open(target, "w", encoding="utf-8") as f:
            f.write(content)

        logger.info(f"[WRITE_FILE] SUCCESS {file_path}")
        yield {
            "type": "tool_result",
            "tool": "write_file",
            "success": True,
            "file_path": file_path,
            "message": f"File written: {file_path}"
        }

    except Exception as e:
        logger.exception(f"[WRITE_FILE] ERROR {file_path}")
        yield {
            "type": "tool_result",
            "tool": "write_file",
            "success": False,
            "message": str(e)
        }


def edit_file(arguments, workspace):
    file_path = arguments.get("file_path", "")
    old_string = arguments.get("old_string", "")
    new_string = arguments.get("new_string", "")
    logger.info(f"[EDIT_FILE] START file_path={file_path}")
    yield {
        "type": "action",
        "action": "edit_file",
        "message": f"Editing file: {file_path}"
    }

    try:
        target = _safe_path(workspace, file_path)

        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        if old_string not in content:
            logger.warning(f"[EDIT_FILE] OLD_STRING_NOT_FOUND {file_path}")
            yield {
                "type": "tool_result",
                "tool": "edit_file",
                "success": False,
                "message": "old_string not found in file."
            }
            return

        new_content = content.replace(old_string, new_string, 1)

        with open(target, "w", encoding="utf-8") as f:
            f.write(new_content)

        logger.info(f"[EDIT_FILE] SUCCESS {file_path}")
        yield {
            "type": "tool_result",
            "tool": "edit_file",
            "success": True,
            "file_path": file_path,
            "message": f"File edited: {file_path}"
        }

    except Exception as e:
        logger.exception(f"[EDIT_FILE] ERROR {file_path}")
        yield {
            "type": "tool_result",
            "tool": "edit_file",
            "success": False,
            "message": str(e)
        }


def delete_file(arguments, workspace):
    file_path = arguments.get("file_path", "")
    logger.info(f"[DELETE_FILE] START file_path={file_path}")
    yield {
        "type": "action",
        "action": "delete_file",
        "message": f"Deleting file: {file_path}"
    }

    try:
        target = _safe_path(workspace, file_path)

        if not os.path.exists(target):
            logger.warning(f"[DELETE_FILE] NOT_FOUND {target}")
            yield {
                "type": "tool_result",
                "tool": "delete_file",
                "success": False,
                "message": f"File not found: {file_path}"
            }
            return

        os.remove(target)
        logger.info(f"[DELETE_FILE] SUCCESS {file_path}")
        yield {
            "type": "tool_result",
            "tool": "delete_file",
            "success": True,
            "file_path": file_path,
            "message": f"File deleted: {file_path}"
        }

    except Exception as e:
        logger.exception(f"[DELETE_FILE] ERROR {file_path}")
        yield {
            "type": "tool_result",
            "tool": "delete_file",
            "success": False,
            "message": str(e)
        }


# =====================================================
# DIRECTORY TOOLS
# =====================================================

def create_folder(arguments, workspace):
    folder_path = arguments.get("folder_path", "")
    logger.info(f"[CREATE_FOLDER] START folder_path={folder_path}")
    yield {
        "type": "action",
        "action": "create_folder",
        "message": f"Creating folder: {folder_path}"
    }

    try:
        target = _safe_path(workspace, folder_path)
        os.makedirs(target, exist_ok=True)
        logger.info(f"[CREATE_FOLDER] SUCCESS {folder_path}")
        yield {
            "type": "tool_result",
            "tool": "create_folder",
            "success": True,
            "folder_path": folder_path,
            "message": f"Folder created: {folder_path}"
        }

    except Exception as e:
        logger.exception(f"[CREATE_FOLDER] ERROR {folder_path}")
        yield {
            "type": "tool_result",
            "tool": "create_folder",
            "success": False,
            "message": str(e)
        }


def delete_folder(arguments, workspace):
    folder_path = arguments.get("folder_path", "")
    logger.info(f"[DELETE_FOLDER] START folder_path={folder_path}")
    yield {
        "type": "action",
        "action": "delete_folder",
        "message": f"Deleting folder: {folder_path}"
    }

    try:
        target = _safe_path(workspace, folder_path)

        if not os.path.exists(target):
            logger.warning(f"[DELETE_FOLDER] NOT_FOUND {target}")
            yield {
                "type": "tool_result",
                "tool": "delete_folder",
                "success": False,
                "message": f"Folder not found: {folder_path}"
            }
            return

        shutil.rmtree(target)
        logger.info(f"[DELETE_FOLDER] SUCCESS {folder_path}")
        yield {
            "type": "tool_result",
            "tool": "delete_folder",
            "success": True,
            "folder_path": folder_path,
            "message": f"Folder deleted: {folder_path}"
        }

    except Exception as e:
        logger.exception(f"[DELETE_FOLDER] ERROR {folder_path}")
        yield {
            "type": "tool_result",
            "tool": "delete_folder",
            "success": False,
            "message": str(e)
        }


def list_directory(arguments, workspace):
    folder_path = arguments.get("folder_path", ".")
    logger.info(f"[LIST_DIRECTORY] START folder_path={folder_path}")
    yield {
        "type": "action",
        "action": "list_directory",
        "message": f"Listing directory: {folder_path}"
    }

    try:
        target = _safe_path(workspace, folder_path)
        entries = []

        for entry in os.listdir(target):
            full = os.path.join(target, entry)
            entries.append({
                "name": entry,
                "type": "directory" if os.path.isdir(full) else "file"
            })

        logger.info(f"[LIST_DIRECTORY] SUCCESS {folder_path} ({len(entries)} items)")
        yield {
            "type": "tool_result",
            "tool": "list_directory",
            "success": True,
            "folder_path": folder_path,
            "entries": entries
        }

    except Exception as e:
        logger.exception(f"[LIST_DIRECTORY] ERROR {folder_path}")
        yield {
            "type": "tool_result",
            "tool": "list_directory",
            "success": False,
            "message": str(e)
        }


def search_files(arguments, workspace):
    pattern = arguments.get("pattern", "*")
    folder_path = arguments.get("folder_path", ".")
    logger.info(f"[SEARCH_FILES] START pattern={pattern} folder={folder_path}")
    yield {
        "type": "action",
        "action": "search_files",
        "message": f"Searching files: pattern='{pattern}' in '{folder_path}'"
    }

    try:
        target = _safe_path(workspace, folder_path)
        matches = []

        for root, dirs, files in os.walk(target):
            for filename in files:
                if fnmatch.fnmatch(filename, pattern):
                    rel = os.path.relpath(os.path.join(root, filename), target)
                    matches.append(rel)

        logger.info(f"[SEARCH_FILES] SUCCESS found {len(matches)} matches")
        yield {
            "type": "tool_result",
            "tool": "search_files",
            "success": True,
            "pattern": pattern,
            "folder_path": folder_path,
            "matches": matches
        }

    except Exception as e:
        logger.exception(f"[SEARCH_FILES] ERROR")
        yield {
            "type": "tool_result",
            "tool": "search_files",
            "success": False,
            "message": str(e)
        }


def get_file_info(arguments, workspace):
    file_path = arguments.get("file_path", "")
    logger.info(f"[GET_FILE_INFO] START file_path={file_path}")
    yield {
        "type": "action",
        "action": "get_file_info",
        "message": f"Getting file info: {file_path}"
    }

    try:
        target = _safe_path(workspace, file_path)

        if not os.path.exists(target):
            logger.warning(f"[GET_FILE_INFO] NOT_FOUND {target}")
            yield {
                "type": "tool_result",
                "tool": "get_file_info",
                "success": False,
                "message": f"Path not found: {file_path}"
            }
            return

        stat = os.stat(target)
        info = {
            "file_path": file_path,
            "exists": True,
            "is_file": os.path.isfile(target),
            "is_directory": os.path.isdir(target),
            "size": stat.st_size,
            "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "created": datetime.datetime.fromtimestamp(stat.st_ctime).isoformat()
        }

        logger.info(f"[GET_FILE_INFO] SUCCESS {file_path}")
        yield {
            "type": "tool_result",
            "tool": "get_file_info",
            "success": True,
            "info": info
        }

    except Exception as e:
        logger.exception(f"[GET_FILE_INFO] ERROR {file_path}")
        yield {
            "type": "tool_result",
            "tool": "get_file_info",
            "success": False,
            "message": str(e)
        }


# =====================================================
# TERMINAL TOOLS
# =====================================================

# In-memory terminal sessions
_TERMINAL_SESSIONS = {}


def run_terminal(arguments, workspace):
    command = arguments.get("command", "")
    timeout = arguments.get("timeout", 30)
    logger.info(f"[RUN_TERMINAL] START command='{command}' timeout={timeout}")
    yield {
        "type": "action",
        "action": "run_terminal",
        "message": f"Running command: {command}"
    }

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=timeout
        )

        output = result.stdout
        if result.stderr:
            output += "\n" + result.stderr

        logger.info(f"[RUN_TERMINAL] SUCCESS exit_code={result.returncode}")
        yield {
            "type": "tool_result",
            "tool": "run_terminal",
            "success": result.returncode == 0,
            "command": command,
            "exit_code": result.returncode,
            "output": output
        }

    except subprocess.TimeoutExpired:
        logger.error(f"[RUN_TERMINAL] TIMEOUT command='{command}'")
        yield {
            "type": "tool_result",
            "tool": "run_terminal",
            "success": False,
            "command": command,
            "message": f"Command timed out after {timeout} seconds."
        }

    except Exception as e:
        logger.exception(f"[RUN_TERMINAL] ERROR command='{command}'")
        yield {
            "type": "tool_result",
            "tool": "run_terminal",
            "success": False,
            "command": command,
            "message": str(e)
        }


def _reader_thread(pipe, output_queue):
    """Background thread to read from a pipe without blocking."""
    try:
        for line in iter(pipe.readline, ""):
            output_queue.put(line)
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def start_terminal_session(arguments, workspace):
    session_id = arguments.get("session_id", "default")
    logger.info(f"[START_TERMINAL_SESSION] START session_id={session_id}")
    yield {
        "type": "action",
        "action": "start_terminal_session",
        "message": f"Starting terminal session: {session_id}"
    }

    try:
        if sys.platform == "win32":
            shell_cmd = ["cmd.exe"]
        else:
            shell_cmd = ["/bin/bash", "-i"]

        proc = subprocess.Popen(
            shell_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=workspace,
            text=True,
            bufsize=1
        )

        output_q = queue.Queue()
        reader = threading.Thread(target=_reader_thread, args=(proc.stdout, output_q), daemon=True)
        reader.start()

        _TERMINAL_SESSIONS[session_id] = {
            "process": proc,
            "output_queue": output_q,
            "output_buffer": ""
        }

        logger.info(f"[START_TERMINAL_SESSION] SUCCESS session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "start_terminal_session",
            "success": True,
            "session_id": session_id,
            "message": f"Terminal session started: {session_id}"
        }

    except Exception as e:
        logger.exception(f"[START_TERMINAL_SESSION] ERROR session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "start_terminal_session",
            "success": False,
            "session_id": session_id,
            "message": str(e)
        }


def terminal_input(arguments, workspace):
    session_id = arguments.get("session_id", "default")
    text = arguments.get("text", "")
    logger.info(f"[TERMINAL_INPUT] START session_id={session_id} text='{text[:50]}...'")
    yield {
        "type": "action",
        "action": "terminal_input",
        "message": f"Sending input to terminal session: {session_id}"
    }

    try:
        session = _TERMINAL_SESSIONS.get(session_id)
        if not session:
            logger.warning(f"[TERMINAL_INPUT] SESSION_NOT_FOUND {session_id}")
            yield {
                "type": "tool_result",
                "tool": "terminal_input",
                "success": False,
                "session_id": session_id,
                "message": f"Session not found: {session_id}"
            }
            return

        proc = session["process"]
        proc.stdin.write(text + "\n")
        proc.stdin.flush()

        logger.info(f"[TERMINAL_INPUT] SUCCESS session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "terminal_input",
            "success": True,
            "session_id": session_id,
            "message": f"Input sent to session: {session_id}"
        }

    except Exception as e:
        logger.exception(f"[TERMINAL_INPUT] ERROR session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "terminal_input",
            "success": False,
            "session_id": session_id,
            "message": str(e)
        }


def terminal_key(arguments, workspace):
    session_id = arguments.get("session_id", "default")
    key = arguments.get("key", "")
    logger.info(f"[TERMINAL_KEY] START session_id={session_id} key='{key}'")
    yield {
        "type": "action",
        "action": "terminal_key",
        "message": f"Sending key to terminal session: {session_id}"
    }

    try:
        session = _TERMINAL_SESSIONS.get(session_id)
        if not session:
            logger.warning(f"[TERMINAL_KEY] SESSION_NOT_FOUND {session_id}")
            yield {
                "type": "tool_result",
                "tool": "terminal_key",
                "success": False,
                "session_id": session_id,
                "message": f"Session not found: {session_id}"
            }
            return

        proc = session["process"]
        key_map = {
            "ctrl_c": "\x03",
            "ctrl_d": "\x04",
            "enter": "\n",
            "tab": "\t",
            "escape": "\x1b"
        }
        char = key_map.get(key, key)
        proc.stdin.write(char)
        proc.stdin.flush()

        logger.info(f"[TERMINAL_KEY] SUCCESS session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "terminal_key",
            "success": True,
            "session_id": session_id,
            "message": f"Key sent to session: {session_id}"
        }

    except Exception as e:
        logger.exception(f"[TERMINAL_KEY] ERROR session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "terminal_key",
            "success": False,
            "session_id": session_id,
            "message": str(e)
        }


def get_terminal_output(arguments, workspace):
    session_id = arguments.get("session_id", "default")
    logger.info(f"[GET_TERMINAL_OUTPUT] START session_id={session_id}")
    yield {
        "type": "action",
        "action": "get_terminal_output",
        "message": f"Getting terminal output: {session_id}"
    }

    try:
        session = _TERMINAL_SESSIONS.get(session_id)
        if not session:
            logger.warning(f"[GET_TERMINAL_OUTPUT] SESSION_NOT_FOUND {session_id}")
            yield {
                "type": "tool_result",
                "tool": "get_terminal_output",
                "success": False,
                "session_id": session_id,
                "message": f"Session not found: {session_id}"
            }
            return

        output_q = session["output_queue"]
        output = ""

        # Drain the queue (non-blocking, works on all platforms)
        while not output_q.empty():
            try:
                line = output_q.get_nowait()
                output += line
            except queue.Empty:
                break

        session["output_buffer"] += output

        logger.info(f"[GET_TERMINAL_OUTPUT] SUCCESS session_id={session_id} ({len(output)} new chars)")
        yield {
            "type": "tool_result",
            "tool": "get_terminal_output",
            "success": True,
            "session_id": session_id,
            "output": output,
            "buffer": session["output_buffer"]
        }

    except Exception as e:
        logger.exception(f"[GET_TERMINAL_OUTPUT] ERROR session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "get_terminal_output",
            "success": False,
            "session_id": session_id,
            "message": str(e)
        }


def stop_terminal_session(arguments, workspace):
    session_id = arguments.get("session_id", "default")
    logger.info(f"[STOP_TERMINAL_SESSION] START session_id={session_id}")
    yield {
        "type": "action",
        "action": "stop_terminal_session",
        "message": f"Stopping terminal session: {session_id}"
    }

    try:
        session = _TERMINAL_SESSIONS.get(session_id)
        if not session:
            logger.warning(f"[STOP_TERMINAL_SESSION] SESSION_NOT_FOUND {session_id}")
            yield {
                "type": "tool_result",
                "tool": "stop_terminal_session",
                "success": False,
                "session_id": session_id,
                "message": f"Session not found: {session_id}"
            }
            return

        proc = session["process"]
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()

        del _TERMINAL_SESSIONS[session_id]

        logger.info(f"[STOP_TERMINAL_SESSION] SUCCESS session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "stop_terminal_session",
            "success": True,
            "session_id": session_id,
            "message": f"Terminal session stopped: {session_id}"
        }

    except Exception as e:
        logger.exception(f"[STOP_TERMINAL_SESSION] ERROR session_id={session_id}")
        yield {
            "type": "tool_result",
            "tool": "stop_terminal_session",
            "success": False,
            "session_id": session_id,
            "message": str(e)
        }


# =====================================================
# UTILITY TOOLS
# =====================================================

def get_current_datetime(arguments, workspace):
    logger.info("[GET_CURRENT_DATETIME] START")
    yield {
        "type": "action",
        "action": "get_current_datetime",
        "message": "Getting current date and time"
    }

    try:
        now = datetime.datetime.now().isoformat()
        logger.info(f"[GET_CURRENT_DATETIME] SUCCESS {now}")
        yield {
            "type": "tool_result",
            "tool": "get_current_datetime",
            "success": True,
            "datetime": now
        }

    except Exception as e:
        logger.exception("[GET_CURRENT_DATETIME] ERROR")
        yield {
            "type": "tool_result",
            "tool": "get_current_datetime",
            "success": False,
            "message": str(e)
        }


# =====================================================
# TOOL REGISTRY
# =====================================================

TOOLS = {
    "read_file": read_file,
    "write_file": write_file,
    "edit_file": edit_file,
    "delete_file": delete_file,

    "create_folder": create_folder,
    "delete_folder": delete_folder,
    "list_directory": list_directory,
    "search_files": search_files,
    "get_file_info": get_file_info,

    "run_terminal": run_terminal,
    "start_terminal_session": start_terminal_session,
    "terminal_input": terminal_input,
    "terminal_key": terminal_key,
    "get_terminal_output": get_terminal_output,
    "stop_terminal_session": stop_terminal_session,

    "get_current_datetime": get_current_datetime
}


# =====================================================
# EXECUTE TOOL
# =====================================================

def execute_tool(tool_name, arguments, workspace):

    logger.info(f"[TOOL] {tool_name}")
    logger.info(f"[WORKSPACE] {workspace}")
    logger.info(f"[ARGUMENTS] {arguments}")

    tool = TOOLS.get(tool_name)

    if tool is None:

        logger.error(f"[TOOL NOT FOUND] {tool_name}")

        yield {
            "type": "tool_result",
            "tool": tool_name,
            "success": False,
            "message": "Tool not found."
        }

        return

    try:
        yield from tool(arguments, workspace)

    except Exception as e:

        logger.exception(f"[TOOL ERROR] {tool_name}")

        yield {
            "type": "tool_result",
            "tool": tool_name,
            "success": False,
            "message": str(e)
        }