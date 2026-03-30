"""One-off: patch state.db -> async read().await for API modules."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src"
FILES = list((ROOT / "api").rglob("*.rs"))
FILES += list((ROOT / "manifest_history").rglob("*.rs")) if (ROOT / "manifest_history").exists() else []
for extra in [
    "mcp_http/mod.rs",
    "mcp/tools.rs",
    "ai_tools/tool_exec.rs",
    "ai_tools/tool_exec_admin/tool_exec_admin_users.rs",
    "ai_tools/tool_exec_admin/tool_exec_admin_groups.rs",
]:
    p = ROOT / extra
    if p.exists():
        FILES.append(p)


def patch(s: str) -> str:
    s = s.replace("can_read(&state.db,", "can_read(&*state.db.read().await,")
    s = s.replace("can_write(&state.db,", "can_write(&*state.db.read().await,")
    s = s.replace("crate::permissions::can_read(&state.db,", "crate::permissions::can_read(&*state.db.read().await,")
    s = s.replace("crate::permissions::can_write(&state.db,", "crate::permissions::can_write(&*state.db.read().await,")
    s = s.replace("check_permission(&state.db,", "check_permission(&*state.db.read().await,")
    s = s.replace("state.db.", "(state.db.read().await).")
    return s


for path in sorted(set(FILES)):
    text = path.read_text(encoding="utf-8")
    if "state.db" not in text:
        continue
    new = patch(text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print("patched", path.relative_to(ROOT.parent))
