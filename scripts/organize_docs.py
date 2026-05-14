"""Move existing planning docs to docs/ folder."""
import os
import shutil

src_dir = os.path.join(os.path.dirname(__file__), "..")
docs_dir = os.path.join(src_dir, "docs")
os.makedirs(docs_dir, exist_ok=True)

files_to_move = [
    "sandbox-plan.md",
    "data-classification.md",
    "security-guidelines.md",
    "spec-updates.md",
]

for fname in files_to_move:
    src = os.path.join(src_dir, fname)
    dst = os.path.join(docs_dir, fname)
    if os.path.exists(src) and not os.path.exists(dst):
        shutil.copy2(src, dst)
        print(f"  Copied {fname} → docs/{fname}")
    elif os.path.exists(dst):
        print(f"  Already exists: docs/{fname}")
    else:
        print(f"  Not found: {fname}")
