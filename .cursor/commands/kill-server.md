# kill-server

Purpose:

- Stop dev servers on port 3000 and related node.exe processes.

Steps (Windows / PowerShell):

1. Inspect Cursor terminals in .cursor/terminals for running dev servers.
2. Find processes using port 3000:

   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |

   Select-Object -Property OwningProcess

3. Resolve process details:

   Get-Process -Id `<pid>`

4. Stop only related node.exe processes:

   Stop-Process -Id `<pid>` -Force

5. Wait 5 seconds, then re-check port 3000 and hanging loops.

Notes:

- Do not kill unrelated node.exe processes.
- If the server is still running, stop the terminal task too.

Trigger:

- Use /kill-server
