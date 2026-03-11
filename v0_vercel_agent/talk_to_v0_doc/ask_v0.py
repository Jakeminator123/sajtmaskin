from pathlib import Path
import os
import re
import time

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


URL = "https://v0.app/docs"


def read_headless_flag() -> bool:
    env_value = os.environ.get("HEADLESS_ASK", "").strip().lower()
    if env_value in {"y", "yes", "true", "1"}:
        return True
    if env_value in {"n", "no", "false", "0"}:
        return False

    for env_path in [Path.cwd() / ".env", Path(__file__).resolve().parent / ".env"]:
        if env_path.exists():
            value = read_key_from_env_file(env_path, "HEADLESS_ASK")
            if value is not None:
                return value.strip().lower() in {"y", "yes", "true", "1"}

    return False


def read_key_from_env_file(path: Path, key: str):
    try:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip().strip('"').strip("'")
    except Exception:
        return None

    return None


def wait_until(page, predicate, timeout_ms=15000, interval_ms=250, description="villkor"):
    deadline = time.monotonic() + (timeout_ms / 1000)
    last_error = None

    while time.monotonic() < deadline:
        try:
            if predicate():
                return True
        except Exception as exc:
            last_error = exc

        page.wait_for_timeout(interval_ms)

    if last_error:
        raise RuntimeError(f"Timeout while waiting for {description}. Last error: {last_error}")

    raise RuntimeError(f"Timeout while waiting for {description}.")


def click_first_visible(page, locator, timeout_ms=15000):
    deadline = time.monotonic() + (timeout_ms / 1000)

    while time.monotonic() < deadline:
        count = locator.count()

        for i in range(count):
            item = locator.nth(i)
            try:
                if item.is_visible() and item.is_enabled():
                    item.click()
                    return i
            except Exception:
                pass

        page.wait_for_timeout(250)

    raise PlaywrightTimeoutError(
        f"Ingen synlig/enabled match hittades inom {timeout_ms} ms"
    )


def clean_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]

    cleaned_lines = []
    skip_exact = {
        "Copy",
        "Copied",
        "Retry",
        "Thumb up",
        "Thumb down",
        "Copy conversation as markdown",
    }

    for line in lines:
        if line in skip_exact:
            continue
        if re.match(r"^Used \d+ sources$", line, flags=re.IGNORECASE):
            continue
        cleaned_lines.append(line)

    return "\n".join(cleaned_lines).strip()


def get_chat_button_locator(page):
    # Exakt mot knappen du skickade:
    # <button data-slot="button"> ... <span>Ask AI</span> </button>
    return page.locator(
        "//button[@data-slot='button'][.//span[normalize-space()='Ask AI']]"
    )


def get_message_box(page):
    # Exakt mot textarean du skickade
    locator = page.locator(
        'textarea[data-slot="input-group-control"][name="message"][placeholder="What would you like to know?"]'
    )

    count = locator.count()
    for i in range(count):
        item = locator.nth(i)
        try:
            if item.is_visible() and item.is_enabled():
                return item
        except Exception:
            pass

    raise RuntimeError("Kunde inte hitta någon synlig textarea för chatten.")


def get_log_locator(page):
    # Exakt mot svarets container du skickade
    return page.locator('div[role="log"]').first


def get_log_text(page) -> str:
    log = get_log_locator(page)
    if log.count() == 0:
        return ""

    try:
        if log.is_visible():
            return clean_text(log.inner_text())
    except Exception:
        pass

    return ""


def extract_new_part(old_text: str, new_text: str) -> str:
    old_text = old_text.strip()
    new_text = new_text.strip()

    if not old_text:
        return new_text

    if new_text.startswith(old_text):
        delta = new_text[len(old_text):].strip()
        return delta if delta else new_text

    idx = new_text.find(old_text)
    if idx != -1:
        delta = new_text[idx + len(old_text):].strip()
        return delta if delta else new_text

    return new_text


def wait_for_response_completion(page, previous_log_text: str, timeout_ms=120000) -> str:
    deadline = time.monotonic() + (timeout_ms / 1000)
    last_seen = previous_log_text
    stable_count = 0
    saw_change = False

    while time.monotonic() < deadline:
        current = get_log_text(page)

        if current and current != previous_log_text:
            saw_change = True

        if current != last_seen:
            last_seen = current
            stable_count = 0
        else:
            if saw_change:
                stable_count += 1

        # ungefär 2 sekunder stabil text
        if saw_change and stable_count >= 4:
            return current

        page.wait_for_timeout(500)

    if saw_change:
        return last_seen

    raise RuntimeError("Timeout while waiting for AI-svar i chatloggen.")


def ensure_chat_open(page):
    try:
        message_box = get_message_box(page)
        if message_box.is_visible():
            return
    except Exception:
        pass

    ask_ai_buttons = get_chat_button_locator(page)
    index = click_first_visible(page, ask_ai_buttons, timeout_ms=15000)
    print(f"Klickade på Ask AI-knappen, index {index}.")

    wait_until(
        page,
        lambda: get_message_box(page).is_visible(),
        timeout_ms=15000,
        description="synlig chattruta",
    )


def clear_and_type_message(page, message_box, prompt: str):
    message_box.click()
    page.wait_for_timeout(150)

    try:
        message_box.fill("")
    except Exception:
        pass

    try:
        message_box.press("ControlOrMeta+A")
        message_box.press("Backspace")
    except Exception:
        pass

    page.wait_for_timeout(150)

    try:
        message_box.fill(prompt)
    except Exception:
        pass

    typed_value = message_box.input_value().strip()

    if typed_value != prompt.strip():
        try:
            message_box.press("ControlOrMeta+A")
            message_box.press("Backspace")
        except Exception:
            pass

        page.wait_for_timeout(100)
        message_box.press_sequentially(prompt, delay=20)
        typed_value = message_box.input_value().strip()

    if typed_value != prompt.strip():
        raise RuntimeError(
            f"Prompten i textboxen stämmer inte.\nFörväntat: {prompt}\nFaktiskt:  {typed_value}"
        )


def submit_message(page, message_box, previous_log_text: str):
    print("Trycker Enter för att skicka...")
    message_box.press("Enter")

    try:
        wait_until(
            page,
            lambda: (
                message_box.input_value().strip() == ""
                or get_log_text(page) != previous_log_text
            ),
            timeout_ms=5000,
            description="submit efter Enter",
        )
        return
    except Exception:
        pass

    print("Vanlig Enter skickade inte. Provar ControlOrMeta+Enter...")
    message_box.press("ControlOrMeta+Enter")

    wait_until(
        page,
        lambda: (
            message_box.input_value().strip() == ""
            or get_log_text(page) != previous_log_text
        ),
        timeout_ms=5000,
        description="submit efter ControlOrMeta+Enter",
    )


def ask_once(page, prompt: str) -> str:
    ensure_chat_open(page)

    message_box = get_message_box(page)
    previous_log_text = get_log_text(page)

    clear_and_type_message(page, message_box, prompt)
    print(f"\nSkickar fråga:\n{prompt}\n")

    submit_message(page, message_box, previous_log_text)
    print("Prompt skickad. Väntar på färdigt AI-svar...")

    full_log_after = wait_for_response_completion(page, previous_log_text, timeout_ms=120000)
    answer = extract_new_part(previous_log_text, full_log_after).strip()

    if not answer:
        answer = full_log_after.strip()

    return answer


def open_fresh_docs_chat(context, old_page):
    try:
        old_page.close()
    except Exception:
        pass

    page = context.new_page()
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    ensure_chat_open(page)
    return page


def reload_chat(page):
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    ensure_chat_open(page)
    return page


def main():
    headless = read_headless_flag()
    print(f"HEADLESS_ASK = {'y' if headless else 'n'}")

    profile_dir = Path(__file__).resolve().parent / ".chrome-v0-profile"
    profile_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            channel="chrome",
            headless=headless,
            viewport={"width": 1440, "height": 1200},
            args=["--window-size=1440,1200"],
        )

        page = context.pages[0] if context.pages else context.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_timeout(2500)

        ensure_chat_open(page)

        print("CLI-chat redo.")
        print("Kommandon: /reset, /reload, /exit\n")

        while True:
            prompt = input("Du> ").strip()

            if not prompt:
                continue

            if prompt.lower() in {"/exit", "exit", "quit", "q"}:
                break

            if prompt.lower() == "/reset":
                print("Startar ny docs-sida och ny chattpanel...")
                page = open_fresh_docs_chat(context, page)
                print("Ny chatt redo.\n")
                continue

            if prompt.lower() == "/reload":
                print("Laddar om sidan och öppnar chattpanelen igen...")
                page = reload_chat(page)
                print("Chatt omladdad.\n")
                continue

            try:
                answer = ask_once(page, prompt)
                print("\n" + "=" * 80)
                print("SVAR FRÅN v0 AI")
                print("=" * 80)
                print(answer)
                print("=" * 80 + "\n")
            except Exception as exc:
                print(f"\nFel: {exc}\n")

        context.close()


if __name__ == "__main__":
    main()