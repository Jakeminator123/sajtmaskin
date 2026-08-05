from __future__ import annotations

import streamlit as st

# --- Farlig zon: destruktiva åtgärder ramas in och kräver typad bekräftelse ---
# Radering låg tidigare i samma flöde som skapa/ändra, med olika friktion per
# yta (kryssruta här, inskriven text där). Helpers först nu, där de används.

def danger_zone(label: str, *, help_text: str = ""):
    """Röd rubrik + kort förklaring runt en destruktiv åtgärd.

    Returnerar en ram-container så anropet kan användas som context manager
    (``with danger_zone("Radera variant"): ...``) och innehållet visuellt hör
    ihop med varningen.
    """
    container = st.container(border=True)
    with container:
        st.markdown(f"##### 🔴 {label}")
        if help_text:
            st.caption(help_text)
    return container


def confirm_by_typing(
    expected: str,
    key: str,
    *,
    label: str = "Bekräfta genom att skriva namnet",
) -> bool:
    """Typad bekräftelse före en radering — samma mönster som baseline-fliken.

    Returnerar ``True`` bara när operatören skrivit ``expected`` exakt
    (omgivande blanktecken ignoreras). Fail-closed: ett tomt ``expected`` kan
    aldrig bekräftas, annars skulle ett orört fält räknas som ett godkännande.
    """
    target = expected.strip()
    typed = st.text_input(
        label,
        key=key,
        help=f"Skriv exakt `{expected}` för att tillåta åtgärden.",
    )
    return bool(target) and typed.strip() == target
