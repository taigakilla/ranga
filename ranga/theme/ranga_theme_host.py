#!/usr/bin/env python3
import json
import os
import socket
import struct
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ranga_theme

STATE = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state"), "ranga")
THEME = os.path.join(STATE, "theme.css")
COLORS = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state"), "ciel", "theme", "colors.toml")
WEATHER = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state"), "ciel", "settings", "weather.json")


def encode(obj):
    data = json.dumps(obj).encode("utf-8")
    return struct.pack("<I", len(data)) + data


def decode(stream):
    header = stream.read(4)
    if len(header) < 4:
        return None
    size = struct.unpack("<I", header)[0]
    return json.loads(stream.read(size))


def changes(path, interval):
    last = None
    while True:
        try:
            mtime = os.stat(path).st_mtime_ns
        except FileNotFoundError:
            mtime = None
        if mtime is not None and mtime != last:
            last = mtime
            with open(path) as f:
                yield f.read()
        else:
            time.sleep(interval)


LOCK = threading.Lock()


def send(obj):
    with LOCK:
        sys.stdout.buffer.write(encode(obj))
        sys.stdout.buffer.flush()


def update_ready():
    running = os.path.dirname(os.path.realpath(f"/proc/{os.getppid()}/exe"))
    current = os.path.join(os.path.dirname(running), "current")
    return os.path.islink(current) and os.path.realpath(current) != running


def location():
    try:
        with open(WEATHER, encoding="utf-8") as f:
            data = json.load(f)
        return {"name": str(data.get("name") or ""), "latitude": float(data["latitude"]), "longitude": float(data["longitude"])}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def hyprland(command):
    signature = os.environ.get("HYPRLAND_INSTANCE_SIGNATURE")
    runtime = os.environ.get("XDG_RUNTIME_DIR")
    if not signature or not runtime:
        return None
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        sock.connect(os.path.join(runtime, "hypr", signature, ".socket.sock"))
        sock.sendall(f"j/{command}".encode())
        chunks = []
        while chunk := sock.recv(65536):
            chunks.append(chunk)
    return json.loads(b"".join(chunks))


def ranga_windows(cursor, clients, monitors):
    visible = {m["activeWorkspace"]["id"] for m in monitors} | {m["specialWorkspace"]["id"] for m in monitors if m.get("specialWorkspace", {}).get("id")}
    windows = [
        {"title": c["title"], "x": c["at"][0], "y": c["at"][1], "width": c["size"][0], "height": c["size"][1], "focus": c["focusHistoryID"]}
        for c in clients
        if c.get("class") == "ranga" and c.get("mapped", True) and not c.get("hidden") and c["workspace"]["id"] in visible
    ]
    return {"x": cursor["x"], "y": cursor["y"], "windows": sorted(windows, key=lambda w: w["focus"])}


def pointer():
    try:
        return ranga_windows(hyprland("cursorpos"), hyprland("clients"), hyprland("monitors"))
    except (OSError, ValueError, KeyError, TypeError):
        return None


def handle(message, colors, theme):
    if message.get("type") == "pointer":
        send({"type": "pointer", "id": message.get("id"), "pointer": pointer()})
        return
    if message.get("type") == "build":
        send({"type": "build", "updateReady": update_ready()})
        return
    if message.get("type") == "location":
        send({"type": "location", "location": location()})
        return
    if message.get("type") == "hostname":
        send({"type": "hostname", "hostname": socket.gethostname()})
        return
    if message.get("type") != "set-opacity":
        return
    value = max(0, min(100, int(message.get("value", ranga_theme.DEFAULT_OPACITY))))
    out = os.path.dirname(theme)
    os.makedirs(out, exist_ok=True)
    ranga_theme.write_atomic(os.path.join(out, "material-opacity"), f"{value}\n")
    ranga_theme.main(colors, theme)


def listen():
    stdin = sys.stdin.buffer
    while (message := decode(stdin)) is not None:
        try:
            handle(message, COLORS, THEME)
        except (OSError, ValueError, KeyError):
            pass
    os._exit(0)


def main():
    threading.Thread(target=listen, daemon=True).start()
    for css in changes(THEME, 0.2):
        send({"type": "theme", "css": css})


if __name__ == "__main__":
    main()
