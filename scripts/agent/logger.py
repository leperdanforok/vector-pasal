"""Demo-ready structured logger for the Correction Agent.

Outputs Unicode box-drawing + emoji for clean Railway logs.
No ANSI color codes, no third-party imports — stdlib only.
"""

import textwrap
import time
from datetime import datetime, timezone


# ── Box-drawing helpers ──────────────────────────────────────────────


def _single_box(lines: list[str], width: int = 62) -> None:
    """Print a single-line box (┌─┐│└─┘)."""
    inner = width - 2
    print(f"┌{'─' * inner}┐", flush=True)
    for line in lines:
        padded = line.ljust(inner)[:inner]
        print(f"│{padded}│", flush=True)
    print(f"└{'─' * inner}┘", flush=True)


def _double_box(lines: list[str], width: int = 62) -> None:
    """Print a double-line box (╔═╗║╚═╝)."""
    inner = width - 2
    print(f"╔{'═' * inner}╗", flush=True)
    for line in lines:
        padded = line.ljust(inner)[:inner]
        print(f"║{padded}║", flush=True)
    print(f"╚{'═' * inner}╝", flush=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Public API ───────────────────────────────────────────────────────


def log_banner(config: dict) -> None:
    """Print startup banner with config.

    Config keys: model, threshold, poll_interval, repo, started.
    """
    lines = [
        "",
        "  ⚖️  vectorpasal.vercel.app — Correction Agent",
        f"  Powered by {config.get('model', 'Claude Opus 4.6')}",
        "",
        f"  Model:          {config.get('model', 'claude-opus-4-6')}",
        f"  Threshold:      {config.get('threshold', 0.85)}",
        f"  Poll interval:  {config.get('poll_interval', 30)}s",
        f"  Repo:           {config.get('repo', 'ilhamfp/pasal')}",
        f"  Started:        {config.get('started', _now_iso())}",
        "",
    ]
    _single_box(lines)
    print(flush=True)


def log_poll_idle(poll_interval: int = 30) -> None:
    """One-liner for idle polling."""
    print(
        f"[{_now_iso()}] Polling... no pending suggestions. "
        f"Next check in {poll_interval}s.",
        flush=True,
    )


def log_suggestion_header(suggestion: dict, work: dict, node: dict) -> None:
    """Print suggestion detection header (double-line box)."""
    reason = suggestion.get("user_reason", "") or ""
    if len(reason) > 60:
        reason = reason[:57] + "..."

    lines = [
        "",
        "  CORRECTION AGENT — New Suggestion Detected",
        "",
    ]
    _double_box(lines)

    # Metadata tree
    print(f"  ├─ Law:       {work.get('title_id', '(unknown)')}", flush=True)
    print(f"  ├─ Article:   Pasal {node.get('number', '?')}", flush=True)
    print(
        f"  ├─ Submitted: {suggestion.get('created_at', '?')}",
        flush=True,
    )
    print(f"  └─ Reason:    {reason or '(tidak diberikan)'}", flush=True)
    print(flush=True)


def log_decision(
    decision: str,
    confidence: float,
    reasoning: str,
    threshold: float = 0.85,
) -> None:
    """Print verification decision box."""
    # Pick emoji
    if decision == "error":
        emoji = "⚠️"
    elif decision == "reject":
        emoji = "❌"
    elif decision.startswith("accept") and confidence < threshold:
        emoji = "🟡"
    else:
        emoji = "✅"

    # Wrap reasoning
    wrapped = textwrap.wrap(reasoning, width=50)[:3]
    quoted = [f'  "{line}"' for line in wrapped]

    lines = [
        "",
        f"  {emoji} Decision: {decision}",
        f"     Confidence: {confidence:.2f}",
        "",
        "  Reasoning:",
        *quoted,
        "",
    ]
    _single_box(lines, width=51)
    print(flush=True)


def log_skipped(reason: str) -> None:
    """Log a skipped auto-apply."""
    print(f"  📝 {reason}", flush=True)


def log_total_time(seconds: float) -> None:
    """Log total processing time + separator."""
    print(f"  ⏱️  Total: {seconds:.1f}s", flush=True)
    print("─" * 62, flush=True)
    print(flush=True)


def log_parser_analysis_header() -> None:
    """Print parser analysis header (double-line box)."""
    lines = [
        "",
        "  PARSER ANALYSIS — Checking for Systematic Issues",
        "",
    ]
    _double_box(lines)
    print(flush=True)


def log_parser_analysis_result(
    feedback_count: int,
    files: list[str],
    issues: list[str],
) -> None:
    """Print parser analysis results summary."""
    lines = [
        "",
        f"  Feedback entries:  {feedback_count}",
        f"  Files analyzed:    {len(files)}",
        f"  Issues created:    {len(issues)}",
        "",
    ]
    _single_box(lines)
    print("═" * 62, flush=True)
    print(flush=True)


# ── StepTimer ────────────────────────────────────────────────────────


class StepTimer:
    """Context manager that logs step start/detail/end with timing."""

    STEP_EMOJIS = {1: "⏳", 2: "📄", 3: "🧠", 4: "🚀"}

    def __init__(self, step_num: int, total: int, label: str) -> None:
        self.step_num = step_num
        self.total = total
        self.label = label
        self.emoji = self.STEP_EMOJIS.get(step_num, "▶️")
        self._start: float = 0.0

    def detail(self, msg: str) -> None:
        """Print an indented detail line."""
        print(f"     ├─ {msg}", flush=True)

    def __enter__(self) -> "StepTimer":
        self._start = time.monotonic()
        print(
            f"\n  {self.emoji} Step {self.step_num}/{self.total} — {self.label}",
            flush=True,
        )
        return self

    def __exit__(self, *args: object) -> None:
        elapsed = time.monotonic() - self._start
        print(f"     └─ Done ({elapsed:.1f}s)", flush=True)
