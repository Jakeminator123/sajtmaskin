# Generic Orchestrator

This automation is designed to be copied into other repositories and run with one command.

## Simple setup

The setup is intentionally simple:

- one settings file: `config.txt` in the repo root
- one inbox folder: `automation/inbox/`
- one command to process pending reports
- one optional watch mode if you want the script to wait for new reports

You do not need to edit code to adapt it to another repo. In normal use you only touch the root `config.txt`.

The recommended next layer, if you want browser-based handoff to ChatGPT, is:

- prepare the input text in a file first
- use the browser only to paste and submit that prepared text
- save the returned answer locally as markdown

## How it works

- watches or scans `automation/inbox/`
- treats each matching report as one iteration input
- tries to derive the iteration number from the filename, for example:
  - `deep-research-report.md` -> next free iteration number
  - `deep-research-report (2).md` -> iteration `2`
- generates `2` to `10` packet markdown files for that iteration
- runs implementer and verifier passes sequentially for each packet
- keeps a shared steering log for the iteration
- runs quality gates
- publishes to the next free numeric branch when the batch is done

## One-command usage

Process the currently available reports in `automation/inbox/`:

```powershell
powershell -NoProfile -File .\automation\run-iterations.ps1
```

Watch for new matching reports and process them until `maxIterations` is reached:

```powershell
powershell -NoProfile -File .\automation\run-iterations.ps1 -Watch
```

Process one explicit file:

```powershell
powershell -NoProfile -File .\automation\run-iterations.ps1 -DeepResearchPath ".\deep-research-report (2).md"
```

## Optional project briefs

If these files exist in the repo root, they are included automatically unless you point elsewhere in `config.txt`:

- `purpose.md`
- `roadmap.md`

## What you drop into the inbox

Put files like these into `automation/inbox/`:

- `deep-research-report.md`
- `deep-research-report (2).md`
- `deep-research-report (3).md`

When a new matching file appears, the orchestrator can pick it up on the next run, or immediately if you started the script with `-Watch`.

## Copy to another repo in Cursor

1. Copy the `automation/` folder and the `.cursor/agents/` folder into the new repo.
2. Add or edit `config.txt` in the repo root for that repo.
3. Set the repo-specific commands:
   - `LINT_COMMAND`
   - `BUILD_COMMAND`
   - `TEST_COMMAND` if needed
4. Put incoming deep research files into `automation/inbox/`.
5. Open the repo in Cursor.
6. Run:

```powershell
powershell -NoProfile -File .\automation\run-iterations.ps1
```

Or keep it running:

```powershell
powershell -NoProfile -File .\automation\run-iterations.ps1 -Watch
```

That is enough for the same flow to work in another repo, as long as Cursor CLI and git are available there.

## Recommended portable layout

If you want this to be easy to reuse, I recommend:

- keep `automation/` in the repo
- keep `.cursor/agents/` in the repo
- keep `config.example.txt` in the repo root as the template
- use `config.txt` in the repo root as the active configuration

That way the repo has a clear "installed" automation setup, while the active `config.txt` stays easy to tweak per project.

## Main artifacts

- `automation/state/run-state.json`: overall orchestration state
- `automation/inbox/`: incoming deep research files
- `automation/packets/iteration-XX/`: generated packet briefs
- `automation/reports/iteration-XX/steering-log.md`: shared orchestration log
- `automation/reports/iteration-XX/`: backlog, reports, verification, and quality logs
- `automation/templates/browser-input.md`: template for prepared browser prompt text
- `automation/browser-io-notes.md`: notes for a future browser automation pass

## Browser automation (strict mode)

The browser runner is now available at:

- `automation/run-browser-automation.mjs`
- `automation/run-browser-automation.ps1`
- `automation/generate-browser-input.ps1`
- `automation/install-to-repo.ps1`
- `automation/kit_manager.py`
- `automation/kit_dashboard.py`
- `INSTALLERA.py`

This flow is strict by default:

- it verifies the prompt field exists
- it verifies model is not `Auto`
- it enables `Deep research` and `Web search`
- it expects `Apps` and `Sites` in the second phase
- it stops immediately if any required element is missing

No soft UI fallback logic is used when `STRICT_MODE=true`.

### Install dependency once in toolkit repo

```powershell
npm install --save-dev playwright
```

This is only needed for `playwright` runtime.
If you use `cursor-manual` runtime, you can skip npm entirely.

### Install this kit to another local repo (path-based)

```powershell
powershell -NoProfile -File .\automation\install-to-repo.ps1 -TargetRepoPath "C:\Users\jakem\dev\projects\sajtmaskin" -Force -InstallPlaywright
```

This copies the automation kit into that repo and auto-sets the repo name keys in `config.browser.txt`.

### Example run (iteration 1)

```powershell
powershell -NoProfile -File .\automation\generate-browser-input.ps1 -Iteration 1
powershell -NoProfile -File .\automation\run-browser-automation.ps1 -Iteration 1 -RepoPath "." -RepoName "sajtmaskin"
```

Cursor embedded browser manual runtime:

```powershell
powershell -NoProfile -File .\automation\run-browser-automation.ps1 -Iteration 1 -RepoPath "." -RepoName "sajtmaskin" -Runtime "cursor-manual"
```

Run from this toolkit folder against another local repo path:

```powershell
powershell -NoProfile -File .\automation\run-browser-automation.ps1 -RootPath "C:\Users\jakem\dev\projects\cursor_gpt" -RepoPath "C:\Users\jakem\dev\projects\sajtmaskin" -RepoName "sajtmaskin" -Iteration 1
```

Expected prompt file for this command:

- `automation/runtime/browser-input-01.md`

Output is saved to:

- `automation/inbox/deep-research-report.md`

If you run with `-Iteration 2`, output is:

- `automation/inbox/deep-research-report (2).md`

### Browser note

The script uses Playwright (Chrome channel) with its own profile folder:

- `.automation/browser-profile`

It does not automate Cursor's embedded browser tab. If you keep a Cursor browser tab open, it does not block this runner unless your local Chrome profile is locked by another process.

Before automation clicks anything, it now pauses for manual login confirmation:

- log in to ChatGPT in the opened browser
- open the chat/composer page
- type `OK` in terminal to continue

If you want to run entirely inside Cursor browser, use runtime mode `cursor-manual` in the Python manager.

## Python manager (interactive + uninstall)

Use the Python manager when you want a single entry point with install, uninstall, status, run-flags, settings dashboard, and zero-touch runs.

Start interactive mode:

```powershell
python .\automation\kit_manager.py
```

No extra arguments are required in interactive mode.  
The menu now supports:

- zero-touch runs (single or multiple iterations)
- browser mode selection:
  - `playwright` (external browser automation)
  - `cursor-manual` (run steps in Cursor browser manually, then paste final output)
- per-iteration git snapshot branches and commits (optional)
- settings dashboard for editing config keys
- run-flag status and stale flag cleanup

### Recommended: zero-touch mode

Zero-touch mode does not copy files into the target repo and does not install npm packages there.
It runs browser automation from this toolkit root while pointing to a target repo path.

If you enable `--run-agent-flow`, each browser-captured report is immediately passed to `run-iterations.ps1` for implementation in the target repo.

Zero-touch also writes run-flag files while active:

- local: `automation/state/automation-running.json`
- global: `%USERPROFILE%\.cursor-gpt-automation\automation-running.json`

If a run crashes, clear stale flags from the interactive menu before running again.

```powershell
python .\automation\kit_manager.py zero-touch --target "C:\Users\jakem\dev\projects\sajtmaskin" --iteration-start 1 --iteration-count 1
```

For browser + automatic implementation flow:

```powershell
python .\automation\kit_manager.py zero-touch --target "C:\Users\jakem\dev\projects\sajtmaskin" --iteration-start 1 --iteration-count 1 --run-agent-flow
```

Note: `--run-agent-flow` requires the kit to be installed in the target repo so `automation/run-iterations.ps1` exists there.

For multi-iteration runs with snapshots:

```powershell
python .\automation\kit_manager.py zero-touch --target "C:\Users\jakem\dev\projects\sajtmaskin" --iteration-start 1 --iteration-count 3 --create-git-snapshots --snapshot-branch-prefix "automation-iteration" --snapshot-commit-prefix "commit-iteration"
```

Snapshot safety rule: target repo must have a clean working tree before each snapshot commit.

### Install into target repo

```powershell
python .\automation\kit_manager.py install --target "C:\Users\jakem\dev\projects\sajtmaskin" --force-overwrite
```

### Uninstall from target repo

```powershell
python .\automation\kit_manager.py uninstall --target "C:\Users\jakem\dev\projects\sajtmaskin"
```

The installer writes a manifest at `.cursor-gpt-kit/manifest.json` in the target repo.
Uninstall uses this manifest and backup files to restore replaced files and remove kit-owned files.

## Cursor rule for automation safety

This repo now includes a project rule at:

- `.cursor/rules/automation-safety.mdc`

For global behavior on your machine, copy the same guidance into Cursor global rules.
Core idea: if run-flag files exist, agents should assume automation may be active and avoid broad edits or auto-commit behavior.

## GUI dashboard

Launch the desktop dashboard:

```powershell
python .\automation\kit_dashboard.py
```

One-file installer/wizard:

```powershell
python .\INSTALLERA.py
```

`INSTALLERA.py` sets default repo + runtime and can optionally install Playwright only in the toolkit repo.
`INSTALERA.py` is kept as a compatibility alias.

The dashboard includes:

- zero-touch start/stop controls
- quick setup wizard for repo + runtime
- runtime switch (`playwright` or `cursor-manual`)
- full pipeline toggle (`run-iterations.ps1` after each browser iteration)
- live process logs
- stdin input panel (`OK`, multiline paste, `EOF`) for interactive checkpoints
- config editor for `config.browser.txt` and `config.txt`
- archive browser for previous run sessions

Automatic archive behavior:

- before a new run starts, previous `ui-dashboard/current` session data is moved to `ui-dashboard/archive`
- optional baseline snapshots of `automation/reports`, `automation/inbox`, and key config files are stored with each session
