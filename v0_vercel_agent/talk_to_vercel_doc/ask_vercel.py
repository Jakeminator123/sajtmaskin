from pathlib import Path
import os
import re
import time

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


URL = "https://vercel.com/docs"


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


def get_user_message_count(page) -> int:
    return page.locator("div.is-user").count()


def get_copy_button_count(page) -> int:
    return page.locator('button[aria-label="Copy chat as markdown"]').count()


def clean_response_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]

    cleaned_lines = []
    skip_exact = {
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


def get_latest_answer_text(page) -> str:
    last_copy_button = page.locator('button[aria-label="Copy chat as markdown"]').last
    assistant_container = last_copy_button.locator(
        "xpath=ancestor::div[contains(@class, 'max-w-[95%]')][1]"
    )
    assistant_container.wait_for(state="visible", timeout=15000)
    return clean_response_text(assistant_container.inner_text())


def activate_page(page, headless: bool):
    if not headless:
        page.bring_to_front()
        page.wait_for_timeout(300)


def ensure_chat_open(page, headless: bool):
    textarea = page.locator('textarea[name="message"]').first

    try:
        if textarea.is_visible():
            return
    except Exception:
        pass

    ask_ai_buttons = page.locator('button[aria-label="Ask AI"]')

    try:
        index = click_first_visible(page, ask_ai_buttons, timeout_ms=15000)
        print(f"Klickade på synlig Ask AI-knapp, index {index}.")
    except PlaywrightTimeoutError:
        fallback = page.locator('button, a, [role="button"]').filter(has_text="Ask AI")
        index = click_first_visible(page, fallback, timeout_ms=10000)
        print(f"Klickade på Ask AI via fallback, index {index}.")

    textarea.wait_for(state="visible", timeout=15000)
    activate_page(page, headless)


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
    message_box.press_sequentially(prompt, delay=20)

    typed_value = message_box.input_value().strip()
    if typed_value != prompt.strip():
        raise RuntimeError(
            f"Prompten i textboxen stämmer inte.\nFörväntat: {prompt}\nFaktiskt:  {typed_value}"
        )


def submit_message(page, message_box, previous_user_count: int):
    print("Trycker Enter för att skicka...")
    message_box.press("Enter")

    try:
        wait_until(
            page,
            lambda: (
                get_user_message_count(page) > previous_user_count
                or message_box.input_value().strip() == ""
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
            get_user_message_count(page) > previous_user_count
            or message_box.input_value().strip() == ""
        ),
        timeout_ms=5000,
        description="submit efter ControlOrMeta+Enter",
    )


def ask_once(page, prompt: str, headless: bool) -> str:
    ensure_chat_open(page, headless=headless)

    message_box = page.locator('textarea[name="message"]').first
    message_box.wait_for(state="visible", timeout=15000)

    activate_page(page, headless)

    previous_user_count = get_user_message_count(page)
    previous_copy_count = get_copy_button_count(page)

    clear_and_type_message(page, message_box, prompt)
    print(f"\nSkickar fråga:\n{prompt}\n")

    submit_message(page, message_box, previous_user_count)
    print("Prompt skickad. Väntar på färdigt AI-svar...")

    wait_until(
        page,
        lambda: get_copy_button_count(page) > previous_copy_count,
        timeout_ms=120000,
        interval_ms=500,
        description="nytt AI-svar",
    )

    return get_latest_answer_text(page)


def open_fresh_docs_chat(context, old_page, headless: bool):
    try:
        old_page.close()
    except Exception:
        pass

    page = context.new_page()
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)

    activate_page(page, headless)
    ensure_chat_open(page, headless=headless)

    return page


def reload_chat(page, headless: bool):
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)

    activate_page(page, headless)
    ensure_chat_open(page, headless=headless)

    return page


def main():
    headless = read_headless_flag()
    print(f"HEADLESS_ASK = {'y' if headless else 'n'}")

    profile_dir = Path(__file__).resolve().parent / ".chrome-vercel-profile"
    profile_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            channel="chrome",
            headless=headless,
            args=["--start-maximized"],
            no_viewport=True,
        )

        page = context.pages[0] if context.pages else context.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_timeout(2500)

        activate_page(page, headless)
        ensure_chat_open(page, headless)

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
                page = open_fresh_docs_chat(context, page, headless=headless)
                print("Ny chatt redo.\n")
                continue

            if prompt.lower() == "/reload":
                print("Laddar om sidan och öppnar chattpanelen igen...")
                page = reload_chat(page, headless=headless)
                print("Chatt omladdad.\n")
                continue

            try:
                answer = ask_once(page, prompt, headless=headless)
                print("\n" + "=" * 80)
                print("SVAR FRÅN VERCEL AI")
                print("=" * 80)
                print(answer)
                print("=" * 80 + "\n")
            except Exception as exc:
                print(f"\nFel: {exc}\n")

        context.close()


if __name__ == "__main__":
    main()