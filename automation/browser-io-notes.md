# Browser IO Notes

This file describes the intended browser-side flow for ChatGPT-based research handoff.

## Goal

Take one prepared iteration prompt, paste it into the ChatGPT input field, wait for the answer, and save the answer into a markdown file in the correct folder.

## Practical Flow

1. Read the prepared prompt file for the current iteration.
2. Open ChatGPT in a logged-in browser session.
3. Paste the prompt into the main chat input field.
4. Submit once.
5. Wait until the assistant response stops streaming.
6. Copy the final assistant response.
7. Save it as markdown in a deterministic path.

## Recommended Saved Output

- `automation/inbox/deep-research-report.md`
- `automation/inbox/deep-research-report (2).md`
- `automation/inbox/deep-research-report (3).md`

## Recommended Automation Strategy

- Prefer a prepared prompt text file over building the browser input ad hoc.
- Treat the browser only as a transport layer.
- Save copied output into markdown files locally instead of depending on site-specific export features.
- If a download flow exists later, treat it as optional, not required.

## Things To Inspect In A Real Browser Session

- how the main input field can be selected robustly
- how to detect that a response is still streaming
- whether the last assistant answer has a copy button
- whether copied content preserves markdown well enough
- whether a share or export action is useful or unnecessary
