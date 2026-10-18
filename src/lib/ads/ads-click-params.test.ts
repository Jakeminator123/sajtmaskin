// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADS_CLICK_PARAMS_STORAGE_KEY,
  appendAdsClickParams,
  applyAdsClickParams,
  bindAdsClickParamPassthrough,
  captureAdsClickParamsFromLocation,
  toBuilderStartHref,
} from "./ads-click-params";

describe("ads click param passthrough", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    document.cookie = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores gclid, wbraid, gbraid and utm_* in sessionStorage, never cookies", () => {
    window.history.replaceState(
      {},
      "",
      "/hemsida-till-foretag?gclid=TeStGclid1&wbraid=wb1&gbraid=gb1&utm_source=google&utm_medium=cpc&utm_campaign=sm_a_karna&utm_content=group&other=drop",
    );
    const cookiesBefore = document.cookie;
    const captured = captureAdsClickParamsFromLocation();
    expect(captured).toEqual({
      gclid: "TeStGclid1",
      wbraid: "wb1",
      gbraid: "gb1",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "sm_a_karna",
      utm_content: "group",
    });
    expect(JSON.parse(sessionStorage.getItem(ADS_CLICK_PARAMS_STORAGE_KEY) ?? "{}")).toEqual(
      captured,
    );
    expect(localStorage.getItem(ADS_CLICK_PARAMS_STORAGE_KEY)).toBeNull();
    expect(document.cookie).toBe(cookiesBefore);
    expect(document.cookie).not.toMatch(/gclid|wbraid|gbraid|utm_/);
  });

  it("appends stored click ids onto /builder?new=1 after the landing query is gone", () => {
    window.history.replaceState({}, "", "/?gclid=ClickFromAds&utm_source=google");
    captureAdsClickParamsFromLocation();
    window.history.replaceState({}, "", "/hemsida-till-foretag");
    expect(appendAdsClickParams("/builder?new=1")).toBe(
      "/builder?new=1&gclid=ClickFromAds&utm_source=google",
    );
  });

  it("does not overwrite click ids already present on the destination", () => {
    window.history.replaceState({}, "", "/?gclid=stored");
    captureAdsClickParamsFromLocation();
    expect(appendAdsClickParams("/builder?new=1&gclid=fromLink")).toBe(
      "/builder?new=1&gclid=fromLink",
    );
  });

  it("toBuilderStartHref() is the shared /builder?new=1 CTA", () => {
    expect(toBuilderStartHref()).toBe("/builder?new=1");
  });

  it("toBuilderStartHref always sets new=1 and keeps project handoff params", () => {
    window.history.replaceState({}, "", "/?gclid=GclidStart&utm_campaign=sm_a_karna");
    const params = new URLSearchParams();
    params.set("project", "proj_1");
    params.set("buildMethod", "freeform");
    params.set("buildIntent", "website");
    expect(toBuilderStartHref(params)).toBe(
      "/builder?project=proj_1&buildMethod=freeform&buildIntent=website&new=1&gclid=GclidStart&utm_campaign=sm_a_karna",
    );
  });

  it("applyAdsClickParams leaves non-builder params untouched when none are stored", () => {
    const params = new URLSearchParams("project=proj_1");
    applyAdsClickParams(params);
    expect(params.toString()).toBe("project=proj_1");
  });

  it("rewrites a builder CTA click through navigate, not cookies", () => {
    window.history.replaceState({}, "", "/exempel?gclid=FromCta&wbraid=wbcta");
    const navigate = vi.fn();
    const stop = bindAdsClickParamPassthrough(navigate);
    const link = document.createElement("a");
    link.setAttribute("href", "/builder?new=1");
    link.textContent = "Starta";
    document.body.append(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith("/builder?new=1&gclid=FromCta&wbraid=wbcta");
    expect(document.cookie).not.toMatch(/gclid|wbraid/);
    stop();
    link.remove();
  });

  it("rewrites href on auxclick/middle-mousedown so a new tab still gets gclid", () => {
    window.history.replaceState({}, "", "/?gclid=MiddleClick");
    const navigate = vi.fn();
    const stop = bindAdsClickParamPassthrough(navigate);
    const link = document.createElement("a");
    link.setAttribute("href", "/builder?new=1");
    document.body.append(link);
    link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 1 }));
    expect(link.getAttribute("href")).toBe("/builder?new=1&gclid=MiddleClick");
    link.setAttribute("href", "/builder?new=1");
    link.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
    expect(link.getAttribute("href")).toBe("/builder?new=1&gclid=MiddleClick");
    expect(navigate).not.toHaveBeenCalled();
    stop();
    link.remove();
  });
});
