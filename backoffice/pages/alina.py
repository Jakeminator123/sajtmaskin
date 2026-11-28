from __future__ import annotations

import streamlit as st
import streamlit.components.v1 as components

from backoffice.shared import BackofficeContext


def render(ctx: BackofficeContext) -> None:
    st.header("Alinas studio")
    st.caption("Scen, bildformat, rörelser och röst delas med den lokala adminpanelen.")
    url = "http://127.0.0.1:5814/SCEN/index.html?edit=1"
    st.link_button("Öppna regissörsvyn i egen flik", url)
    components.iframe(url, height=960, scrolling=True)
