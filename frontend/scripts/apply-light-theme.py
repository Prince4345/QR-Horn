#!/usr/bin/env python3
"""Safely rewrite Tailwind classes inside className / template class strings only."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "components"

# Order matters: longer / more specific first
REPLACEMENTS: list[tuple[str, str]] = [
    ("hover:bg-violet-600/90", "hover:bg-brand-dark"),
    ("hover:bg-violet-600/30", "hover:bg-brand/15"),
    ("hover:bg-violet-500", "hover:bg-brand-dark"),
    ("bg-violet-600/30", "bg-brand/15"),
    ("bg-violet-600/25", "bg-brand/10"),
    ("bg-violet-600/20", "bg-brand/10"),
    ("bg-violet-600/15", "bg-brand/10"),
    ("bg-violet-600/10", "bg-brand/5"),
    ("bg-violet-500/15", "bg-brand/10"),
    ("bg-violet-500/10", "bg-brand/10"),
    ("border-violet-500/70", "border-brand/60"),
    ("border-violet-500/40", "border-brand/30"),
    ("border-violet-500/30", "border-brand/25"),
    ("border-violet-500/25", "border-brand/25"),
    ("border-violet-500/20", "border-brand/20"),
    ("ring-violet-500/40", "ring-brand/30"),
    ("text-violet-200/80", "text-muted"),
    ("text-violet-200/70", "text-muted"),
    ("text-violet-200/60", "text-muted"),
    ("text-violet-100/80", "text-muted"),
    ("text-violet-100/70", "text-muted"),
    ("text-violet-100/90", "text-ink"),
    ("text-violet-100", "text-brand"),
    ("text-violet-200", "text-brand"),
    ("text-violet-300", "text-brand"),
    ("text-violet-400", "text-brand"),
    ("text-violet-700", "text-brand"),
    ("from-violet-600", "from-brand"),
    ("to-fuchsia-600", "to-brand-dark"),
    ("hover:from-violet-500", "hover:from-brand"),
    ("hover:to-fuchsia-500", "hover:to-brand-dark"),
    ("from-violet-500/[0.10]", "from-brand/10"),
    ("to-fuchsia-500/[0.04]", "to-brand/5"),
    ("shadow-violet-900/30", "shadow-brand/20"),
    ("focus:border-violet-500/50", "focus:border-brand/50"),
    ("bg-violet-600", "bg-brand"),
    ("hover:bg-blue-500", "hover:bg-brand-dark"),
    ("hover:bg-blue-600", "hover:bg-brand-dark"),
    ("active:bg-blue-500", "active:bg-brand-dark"),
    ("focus:border-blue-500/50", "focus:border-brand/50"),
    ("border-blue-500/50", "border-brand/50"),
    ("border-blue-500/40", "border-brand/40"),
    ("border-blue-500/30", "border-brand/30"),
    ("bg-blue-500/30", "bg-brand/25"),
    ("bg-blue-500/20", "bg-brand/10"),
    ("bg-blue-500/10", "bg-brand/10"),
    ("shadow-blue-600/20", "shadow-brand/20"),
    ("shadow-blue-900/30", "shadow-brand/20"),
    ("shadow-blue-500/20", "shadow-brand/20"),
    ("from-blue-600/30", "from-brand/20"),
    ("from-blue-600/10", "from-brand/10"),
    ("via-indigo-600/20", "via-brand/10"),
    ("from-blue-500", "from-brand"),
    ("to-indigo-600", "to-brand-dark"),
    ("via-blue-400", "via-brand"),
    ("text-blue-400", "text-brand"),
    ("text-blue-300", "text-brand"),
    ("text-blue-500", "text-brand"),
    ("bg-blue-600", "bg-brand"),
    ("bg-blue-500", "bg-brand"),
    ("bg-gradient-to-b from-[#111] to-[#000]", "bg-surface"),
    ("bg-[#0a0a0a]/90", "bg-surface"),
    ("bg-[#0a0a0a]/80", "bg-surface"),
    ("bg-[#0a0a0a]/50", "bg-soft/80"),
    ("bg-[#111]", "bg-surface"),
    ("bg-[#050505]", "bg-canvas"),
    ("bg-white/[0.03]", "bg-soft"),
    ("bg-white/[0.02]", "bg-soft"),
    ("hover:bg-white/20", "hover:bg-soft"),
    ("hover:bg-white/10", "hover:bg-soft"),
    ("placeholder:text-white/30", "placeholder:text-faint"),
    ("text-white/90", "text-ink"),
    ("text-white/80", "text-ink"),
    ("text-white/70", "text-muted"),
    ("text-white/60", "text-muted"),
    ("text-white/50", "text-muted"),
    ("text-white/40", "text-faint"),
    ("text-white/30", "text-faint"),
    ("border-white/20", "border-line"),
    ("border-white/15", "border-line"),
    ("border-white/10", "border-line"),
    ("border-white/5", "border-line"),
    ("divide-white/5", "divide-line"),
    ("bg-white/15", "bg-soft"),
    ("bg-white/10", "bg-soft"),
    ("bg-white/5", "bg-surface"),
    ("bg-white/20", "bg-soft"),
    ("text-slate-400", "text-muted"),
    ("text-slate-500", "text-muted"),
    ("text-slate-300", "text-muted"),
    ("text-slate-200", "text-ink"),
    ("bg-slate-800", "bg-soft"),
    ("bg-slate-500/10", "bg-soft"),
    ("hover:text-white", "hover:text-ink"),
    ("text-red-300", "text-brand"),
    ("text-red-400", "text-brand"),
    ("bg-red-500/10", "bg-brand/5"),
    ("border-red-500/30", "border-brand/25"),
    ("border-red-500/20", "border-brand/20"),
    ("text-emerald-200", "text-emerald-700"),
    ("text-amber-200", "text-amber-800"),
    ("text-amber-100/70", "text-amber-800/80"),
    ("text-amber-100/60", "text-amber-800/70"),
    ("text-amber-100", "text-amber-900"),
    ("backdrop-blur-2xl", ""),
    ("backdrop-blur-xl", ""),
    ("backdrop-blur-md", ""),
    ("backdrop-blur-sm", ""),
    ("bg-black/70", "bg-ink/40"),
    ("bg-black/80", "bg-ink/50"),
]

# After general replacements, restore white text on solid brand / status buttons
BUTTON_WHITEN = [
    (r"(bg-brand(?:/[0-9]+)?(?![^\s\"'`]*text-white)(?:\s+[^\s\"'`]*)*)", None),  # handled below
]


CLASS_ATTR = re.compile(
    r"""(className\s*=\s*)(?P<q>["'`])(?P<body>(?:\\.|(?!\2).)*)(?P=q)"""
    r"""|(className\s*=\s*\{`)(?P<body2>[\s\S]*?)(`\})""",
    re.MULTILINE,
)


def transform_classes(s: str) -> str:
    out = s
    for old, new in REPLACEMENTS:
        out = out.replace(old, new)
    # Collapse leftover double spaces from empty removals
    out = re.sub(r" {2,}", " ", out)
    out = out.replace(" className=\" ", " className=\"")
    # text-white on light surfaces → text-ink, but keep on bg-brand / bg-red / bg-green / bg-black
    tokens = out.split()
    result = []
    ctx = " ".join(tokens)
    solid_brand = bool(
        re.search(r"\bbg-brand\b", ctx)
        and not re.search(r"\bbg-brand/", ctx)
    )
    # Per-token: if class string has solid bg-brand/red/green/black, keep text-white
    keep_white = bool(
        re.search(r"\bbg-brand\b(?!/)", out)
        or re.search(r"\bbg-red-6", out)
        or re.search(r"\bbg-green-6", out)
        or re.search(r"\bbg-black\b", out)
        or re.search(r"\bbg-amber-500\b", out)
        or re.search(r"from-black/", out)
        or re.search(r"to-black/", out)
    )
    if "text-white" in out and not keep_white:
        out = out.replace("text-white", "text-ink")
    # Ensure solid brand buttons have text-white
    if re.search(r"\bbg-brand\b(?!/)", out) and "text-ink" in out and "text-white" not in out:
        out = out.replace("text-ink", "text-white", 1) if "font-semibold" in out or "font-bold" in out or "font-medium" in out else out
    if re.search(r"\bbg-brand\b(?!/)", out) and "text-white" not in out and (
        "font-semibold" in out or "font-bold" in out or "rounded-2xl font" in out or "rounded-xl font" in out or "rounded-3xl font" in out
    ):
        out = out + " text-white"
    return out.strip()


def process_file(path: Path) -> bool:
    src = path.read_text(encoding="utf-8")

    def repl(m: re.Match) -> str:
        if m.group("body") is not None:
            q = m.group("q")
            body = transform_classes(m.group("body"))
            return f'{m.group(1)}{q}{body}{q}'
        body2 = transform_classes(m.group("body2"))
        return f"{m.group(1)}{body2}{m.group('body2') and ''}`}}"  # broken

    # Simpler approach: find className="..." and className={`...`}
    changed = False

    def repl_dq(m: re.Match) -> str:
        nonlocal changed
        new_body = transform_classes(m.group(1))
        if new_body != m.group(1):
            changed = True
        return f'className="{new_body}"'

    def repl_tick(m: re.Match) -> str:
        nonlocal changed
        new_body = transform_classes(m.group(1))
        if new_body != m.group(1):
            changed = True
        return f"className={{`{new_body}`}}"

    out = re.sub(r'className="([^"]*)"', repl_dq, src)
    out = re.sub(r"className=\{\`([^\`]*)\`\}", repl_tick, out)

    # Also handle cn / template pieces with className={` ... ${} ... `}
    def repl_tick_complex(m: re.Match) -> str:
        nonlocal changed
        body = m.group(1)
        # Only replace known tokens inside, don't collapse template expressions
        new_body = body
        for old, new in REPLACEMENTS:
            if old in new_body:
                new_body = new_body.replace(old, new)
                changed = True
        new_body = re.sub(r" {2,}", " ", new_body)
        return f"className={{`{new_body}`}}"

    out2 = re.sub(r"className=\{\`([\s\S]*?)\`\}", repl_tick_complex, src)
    # Prefer out2 if it found templates; merge by applying replacements to both patterns on original

    # Final reliable pass: only operate on quoted class strings
    def transform_file(text: str) -> str:
        def one(m: re.Match) -> str:
            prefix, quote, body = m.group(1), m.group(2), m.group(3)
            return f"{prefix}{quote}{transform_classes(body)}{quote}"

        text = re.sub(r'(className\s*=\s*)(["\'])([^"\']*)\2', one, text)

        def tmpl(m: re.Match) -> str:
            body = m.group(1)
            new_body = body
            for old, new in REPLACEMENTS:
                new_body = new_body.replace(old, new)
            new_body = re.sub(r" {2,}", " ", new_body)
            # careful text-white in templates
            parts = re.split(r"(\$\{[^}]*\})", new_body)
            fixed = []
            for part in parts:
                if part.startswith("${"):
                    fixed.append(part)
                else:
                    keep_white = bool(
                        re.search(r"\bbg-brand\b(?!/)", part)
                        or re.search(r"\bbg-red-6", part)
                        or re.search(r"\bbg-green-6", part)
                        or re.search(r"\bbg-black\b", part)
                    )
                    if "text-white" in part and not keep_white:
                        part = part.replace("text-white", "text-ink")
                    if re.search(r"\bbg-brand\b(?!/)", part) and "text-white" not in part:
                        if any(x in part for x in ("font-semibold", "font-bold", "font-medium")):
                            part = part.rstrip() + " text-white"
                    fixed.append(part)
            return "className={`" + "".join(fixed) + "`}"

        text = re.sub(r"className=\{\`([\s\S]*?)\`\}", tmpl, text)
        return text

    result = transform_file(src)
    if result != src:
        path.write_text(result, encoding="utf-8", newline="\n")
        return True
    return False


def main() -> None:
    skip = {"ScannerLandingPage.tsx", "ScannerLandingHero.tsx"}
    updated = []
    for path in sorted(ROOT.glob("*.tsx")):
        if path.name in skip:
            continue
        if process_file(path):
            updated.append(path.name)
    print("updated:", ", ".join(updated) if updated else "(none)")


if __name__ == "__main__":
    main()
