#!/usr/bin/env python3
"""Fail when any locale catalog is not an exact in-order mirror of the reference.

Reference locale is en. Every other messages/<locale>.json must contain exactly
the same nested keys, in the same declaration order. Reports missing keys, extra
keys, and the first order divergence per locale.
"""
import json
import os
import sys
from glob import glob

REFERENCE = "en"
MESSAGES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "messages")


def flatten(obj, prefix=""):
    """Return an ordered list of dot-path keys (depth-first, declaration order)."""
    keys = []
    for key, value in obj.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            keys.extend(flatten(value, path + "."))
        else:
            keys.append(path)
    return keys


def compare(reference_keys, locale_keys):
    """Return (missing, extra, order_divergence_index_or_None)."""
    ref_set, loc_set = set(reference_keys), set(locale_keys)
    missing = [k for k in reference_keys if k not in loc_set]
    extra = [k for k in locale_keys if k not in ref_set]
    order_at = None
    if not missing and not extra:
        for i, (a, b) in enumerate(zip(reference_keys, locale_keys)):
            if a != b:
                order_at = i
                break
    return missing, extra, order_at


def check(catalogs):
    """catalogs: dict of locale -> parsed JSON. Returns list of error lines."""
    errors = []
    reference_keys = flatten(catalogs[REFERENCE])
    for locale in sorted(catalogs):
        if locale == REFERENCE:
            continue
        missing, extra, order_at = compare(reference_keys, flatten(catalogs[locale]))
        for k in missing:
            errors.append(f"[{locale}] missing key: {k}")
        for k in extra:
            errors.append(f"[{locale}] extra key: {k}")
        if order_at is not None:
            errors.append(
                f"[{locale}] order diverges at position {order_at}: "
                f"expected {reference_keys[order_at]!r}"
            )
    return errors


def load_from_disk():
    catalogs = {}
    for path in glob(os.path.join(MESSAGES_DIR, "*.json")):
        locale = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8") as fh:
            catalogs[locale] = json.load(fh)
    return catalogs


def self_test():
    base = {"a": {"b": 1, "c": 2}, "d": 3}
    cases = {
        "matching": ({"a": {"b": 9, "c": 9}, "d": 9}, 0),
        "missing": ({"a": {"b": 1}, "d": 3}, 1),
        "extra": ({"a": {"b": 1, "c": 2}, "d": 3, "e": 4}, 1),
        "reordered": ({"d": 3, "a": {"b": 1, "c": 2}}, 1),
    }
    failures = 0
    for name, (other, want_errors) in cases.items():
        got = check({"en": base, "fr": other})
        status = "ok" if len(got) == want_errors else "WRONG"
        if status == "WRONG":
            failures += 1
        print(f"self-test {name}: {status} ({len(got)} errors) {got}")
    if failures:
        print(f"self-test FAILED: {failures} case(s) wrong")
        return 1
    print("self-test passed")
    return 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    catalogs = load_from_disk()
    if REFERENCE not in catalogs:
        print(f"reference locale {REFERENCE!r} not found in messages/")
        return 1
    errors = check(catalogs)
    if errors:
        print("Translation catalogs are out of sync:")
        for line in errors:
            print("  " + line)
        return 1
    print(f"All {len(catalogs)} locale catalogs are in-order mirrors of {REFERENCE!r}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
