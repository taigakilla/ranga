import os
import tempfile
import unittest
import urllib.error

import check_patches

ORIGINAL = "alpha\nbeta\ngamma\n"

UPSTREAM = """--- a/src/a.cc
+++ b/src/a.cc
@@ -1,3 +1,3 @@
 alpha
-beta
+BETA
 gamma
--- a/src/other.cc
+++ b/src/other.cc
@@ -1,1 +1,1 @@
-x
+y
"""

OURS_OK = """--- a/src/a.cc
+++ b/src/a.cc
@@ -1,3 +1,4 @@
 alpha
 BETA
+delta
 gamma
"""

OURS_BAD = """--- a/src/a.cc
+++ b/src/a.cc
@@ -1,3 +1,4 @@
 alpha
 beta
+delta
 gamma
"""


def tree(patches, series):
    root = tempfile.mkdtemp()
    for name, text in patches.items():
        path = os.path.join(root, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(text)
    with open(os.path.join(root, "series"), "w") as f:
        f.write("\n".join(series) + "\n")
    return root


def fetch(path):
    return ORIGINAL if path == "src/a.cc" else None


class CheckPatches(unittest.TestCase):
    def test_sections_split_by_file(self):
        sections = check_patches.sections(UPSTREAM)
        self.assertEqual(sorted(sections), ["src/a.cc", "src/other.cc"])
        self.assertIn("+BETA", sections["src/a.cc"])
        self.assertNotIn("other", sections["src/a.cc"])

    def test_ok_when_ours_applies_on_top(self):
        root = tree({"up/x.patch": UPSTREAM, "ranga/y.patch": OURS_OK}, ["up/x.patch", "ranga/y.patch"])
        self.assertEqual(check_patches.check(os.path.join(root, "series"), root, "ranga/", fetch), [])

    def test_reports_failing_patch(self):
        root = tree({"up/x.patch": UPSTREAM, "ranga/y.patch": OURS_BAD}, ["up/x.patch", "ranga/y.patch"])
        failures = check_patches.check(os.path.join(root, "series"), root, "ranga/", fetch)
        self.assertEqual(failures, [("ranga/y.patch", "src/a.cc")])

    def test_no_ranga_patches_is_ok(self):
        root = tree({"up/x.patch": UPSTREAM}, ["up/x.patch"])
        self.assertEqual(check_patches.check(os.path.join(root, "series"), root, "ranga/", fetch), [])

    def test_new_file_created_by_patch(self):
        new = """--- /dev/null
+++ b/src/new.h
@@ -0,0 +1,1 @@
+hello
"""
        root = tree({"ranga/n.patch": new}, ["ranga/n.patch"])
        self.assertEqual(check_patches.check(os.path.join(root, "series"), root, "ranga/", fetch), [])



    def test_retries_rate_limit_then_succeeds(self):
        calls = []

        def download():
            calls.append(1)
            if len(calls) < 3:
                raise urllib.error.HTTPError("u", 429, "Too Many Requests", {"Retry-After": "1"}, None)
            return "ok"

        waits = []
        self.assertEqual(check_patches.retrying(download, wait=waits.append), "ok")
        self.assertEqual(waits, [1.0, 1.0])

    def test_does_not_retry_not_found(self):
        def download():
            raise urllib.error.HTTPError("u", 404, "Not Found", {}, None)

        with self.assertRaises(urllib.error.HTTPError):
            check_patches.retrying(download, wait=lambda _: self.fail("esperou"))

    def test_cache_keeps_files_and_misses(self):
        calls = []

        def fetch(path):
            calls.append(path)
            return None if path == "gone.cc" else f"conteudo de {path}"

        with tempfile.TemporaryDirectory() as folder:
            read = check_patches.cached(fetch, folder)
            self.assertEqual(read("a/b.cc"), "conteudo de a/b.cc")
            self.assertIsNone(read("gone.cc"))
            again = check_patches.cached(fetch, folder)
            self.assertEqual(again("a/b.cc"), "conteudo de a/b.cc")
            self.assertIsNone(again("gone.cc"))
        self.assertEqual(calls, ["a/b.cc", "gone.cc"])


if __name__ == "__main__":
    unittest.main()
