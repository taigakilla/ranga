import base64
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def sections(text):
    result = {}
    lines = text.splitlines(keepends=True)
    current = None
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("--- ") and i + 1 < len(lines) and lines[i + 1].startswith("+++ "):
            new = lines[i + 1][4:].split("\t")[0].strip()
            old = line[4:].split("\t")[0].strip()
            path = new if new != "/dev/null" else old
            current = re.sub(r"^[ab]/", "", path)
            result[current] = line + lines[i + 1]
            i += 2
            continue
        if line.startswith("diff --git"):
            current = None
        elif current is not None:
            result[current] += line
        i += 1
    return result


def read_series(series_path):
    with open(series_path) as f:
        return [l.strip() for l in f if l.strip() and not l.strip().startswith("#")]


def check(series_path, patches_dir, prefix, fetch):
    series = read_series(series_path)
    texts = {}
    for name in series:
        with open(os.path.join(patches_dir, name), errors="replace") as f:
            texts[name] = sections(f.read())
    targets = set()
    for name in series:
        if name.startswith(prefix):
            targets |= set(texts[name])
    if not targets:
        return []
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        for path in targets:
            content = fetch(path)
            if content is not None:
                dest = os.path.join(tmp, path)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "w") as f:
                    f.write(content)
        for name in series:
            for path in sorted(set(texts[name]) & targets):
                done = subprocess.run(
                    ["patch", "-p1", "--ignore-whitespace", "--fuzz=0", "--forward", "--batch", "--silent",
                     "--no-backup-if-mismatch", "-r", "-", "-d", tmp],
                    input=texts[name][path], text=True, capture_output=True)
                if done.returncode != 0:
                    failures.append((name, path))
    return failures


def retrying(download, attempts=6, wait=time.sleep):
    for attempt in range(attempts):
        try:
            return download()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise
            delay = e.headers.get("Retry-After") if e.headers else None
            wait(float(delay) if delay and delay.isdigit() else 2 ** attempt * 5)


def cached(fetch, folder):
    def read(path):
        cache = os.path.join(folder, path)
        missing = cache + ".missing"
        if os.path.exists(missing):
            return None
        if os.path.exists(cache):
            with open(cache, encoding="utf-8") as f:
                return f.read()
        content = fetch(path)
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(missing if content is None else cache, "w", encoding="utf-8") as f:
            f.write(content or "")
        return content
    return read


def googlesource(version):
    def fetch(path):
        url = f"https://chromium.googlesource.com/chromium/src/+/refs/tags/{version}/{path}?format=TEXT"

        def download():
            with urllib.request.urlopen(url, timeout=60) as r:
                return base64.b64decode(r.read()).decode("utf-8", errors="replace")

        try:
            return retrying(download)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
    folder = os.path.join(os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "ranga", "chromium", version)
    return cached(fetch, folder)


def main(series_path, patches_dir, version_file):
    with open(version_file) as f:
        version = f.read().strip()
    failures = check(series_path, patches_dir, "ranga/", googlesource(version))
    for name, path in failures:
        print(f"FALHOU: {name} em {path}")
    if failures:
        sys.exit(1)
    print(f"ok: patches ranga/ aplicam sobre Chromium {version}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
