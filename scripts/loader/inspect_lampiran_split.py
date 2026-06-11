"""Dry-run inspection of the Lampiran splitter — NO database access.

Runs ``_split_lampiran_sections`` against the cached transcriptions and prints the
node boundaries it would produce, so we can verify the chunking at the parsing
level before any live re-ingest.

Usage:
    python scripts/loader/inspect_lampiran_split.py            # focus on Perda 1/2024
    python scripts/loader/inspect_lampiran_split.py --all      # all transcriptions

Checks (printed as PASS/FAIL, never writes anything):
  - Each Lampiran I/II/III becomes its own container with multiple tariff sections.
  - No `lampiran_tarif` node exceeds 12,000 chars (the invariant the 182k blob broke).
  - PARKIR / PASAR / KEBERSIHAN / KESEHATAN each appear as distinct titled node(s).
  - The remaining body text (text_without_lampiran) ends at the penjelasan, not the appendix.
"""
import argparse
import sys
from pathlib import Path

# Node headings contain em-dashes etc.; force UTF-8 so the Windows cp1252 console
# doesn't choke when printing them.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

sys.path.insert(0, str(Path(__file__).parent.parent))

from loader.load_to_supabase import _split_lampiran_sections, _count_lampiran_tarif

TRANSCRIPTIONS = Path(__file__).parent.parent.parent / "data" / "transcriptions"
PERDA_1_2024 = "peraturan-daerah-nomor-1-tahun-2024-tentang-pajak-dan-retribusi-daerah.md"

MAX_TARIF_CHARS = 12_000
EXPECTED_TOPICS = ("PARKIR", "PASAR", "KEBERSIHAN", "KESEHATAN")


def _first_body_line(content: str, heading: str) -> str:
    """Return the first body line after the retained heading, for eyeballing."""
    lines = [ln for ln in content.split("\n") if ln.strip()]
    # content_text is "<heading>\n<body...>" — skip the heading line(s).
    for ln in lines:
        if ln.strip() != heading.strip():
            return ln.strip()[:90]
    return ""


def inspect(md_path: Path, verbose: bool) -> bool:
    raw = md_path.read_text(encoding="utf-8")
    before, containers = _split_lampiran_sections(raw)

    print(f"\n{'=' * 78}\n{md_path.name}\n{'=' * 78}")
    if not containers:
        print("  No LAMPIRAN heading found -> splitter is a no-op (text unchanged).")
        print(f"  unchanged: {len(before) == len(raw)}  (chars: {len(raw)})")
        return len(before) == len(raw)

    n_tarif = _count_lampiran_tarif(containers)
    print(f"  Raw chars: {len(raw):,}  ->  body chars: {len(before):,}  "
          f"(appendix peeled: {len(raw) - len(before):,})")
    print(f"  Containers: {len(containers)}   Tariff section nodes: {n_tarif}\n")

    ok = True
    oversized: list[tuple[str, int]] = []

    for c in containers:
        if c["type"] != "lampiran":
            # defensive: a tariff node emitted before any LAMPIRAN heading
            print(f"  [orphan lampiran_tarif] {c['number']}  {c['heading'][:60]}")
            continue
        print(f"  LAMPIRAN {c['number']}  ({len(c['children'])} sections)  \"{c['heading'][:60]}\"")
        for n in c["children"]:
            clen = len(n["content"])
            flag = "  <<< OVERSIZED" if clen > MAX_TARIF_CHARS else ""
            if clen > MAX_TARIF_CHARS:
                oversized.append((n["number"], clen))
                ok = False  # hard fail: every node must fit the cap after sub-splitting
            line = f"     [{n['number']:>5}] {clen:>7,}c  {n['heading'][:62]}{flag}"
            print(line)
            if verbose:
                print(f"             -> {_first_body_line(n['content'], n['heading'])}")

    # ── Checks ───────────────────────────────────────────────────────────
    print(f"\n  {'-' * 40}")
    all_headings = " | ".join(
        n["heading"].upper()
        for c in containers if c["type"] == "lampiran"
        for n in c["children"]
    )
    for topic in EXPECTED_TOPICS:
        present = topic in all_headings
        ok = ok and present
        print(f"  [{'PASS' if present else 'FAIL'}] topic node present: {topic}")

    if oversized:
        print(f"  [FAIL] {len(oversized)} node(s) exceed {MAX_TARIF_CHARS:,} chars "
              f"(sub-split could not safely reduce — decide manually): "
              f"{', '.join(f'{num}={c:,}' for num, c in oversized)}")
    else:
        print(f"  [PASS] no tariff node exceeds {MAX_TARIF_CHARS:,} chars")

    tail = before.rstrip()[-160:].replace("\n", " / ")
    appendix_leaked = "LAMPIRAN" in before.upper().split("PENJELASAN")[-1][-4000:]
    print(f"  [{'FAIL' if appendix_leaked else 'PASS'}] body tail free of appendix text")
    print(f"  body tail: …{tail}")
    ok = ok and not appendix_leaked

    return ok


def main() -> None:
    ap = argparse.ArgumentParser(description="Inspect Lampiran splitting (no DB).")
    ap.add_argument("--all", action="store_true", help="Inspect every cached transcription")
    ap.add_argument("--verbose", action="store_true", help="Show first body line per node")
    args = ap.parse_args()

    if args.all:
        targets = sorted(TRANSCRIPTIONS.glob("*.md"))
    else:
        targets = [TRANSCRIPTIONS / PERDA_1_2024]

    results = {p.name: inspect(p, args.verbose) for p in targets}

    print(f"\n{'=' * 78}\nSUMMARY")
    for name, ok in results.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    sys.exit(0 if all(results.values()) else 1)


if __name__ == "__main__":
    main()
