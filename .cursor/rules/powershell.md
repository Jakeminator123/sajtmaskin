---
description: Use PowerShell-compatible shell commands on Windows
alwaysApply: true
---

This workspace is primarily run from PowerShell 7 on Windows.

Do NOT use bash heredocs such as:

```bash
cat > file.txt <<'EOF'
content
EOF
