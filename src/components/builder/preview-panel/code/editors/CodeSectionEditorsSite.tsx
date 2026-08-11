"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PreviewPanelCodeDraftsBundle } from "../usePreviewPanelCodeDrafts";

type Props = {
  drafts: PreviewPanelCodeDraftsBundle;
};

/** Internal section cluster for PreviewPanelCodeSectionEditors. */
export function CodeSectionEditorsSite({ drafts }: Props) {
  const {
    contactDraft,
    setContactDraft,
    contactSaveError,
    isContactSaving,
    blogPostsDraft,
    setBlogPostsDraft,
    blogPostsSaveError,
    isBlogPostsSaving,
    footerLinkGroupsDraft,
    setFooterLinkGroupsDraft,
    footerLinksSaveError,
    isFooterLinksSaving,
    editableContactDetails,
    editableBlogPosts,
    editableFooterLinkGroups,
    contactDirty,
    blogPostsDirty,
    footerLinksDirty,
    handleSaveContactDetails,
    handleSaveBlogPosts,
    handleSaveFooterLinks,
  } = drafts;

  return (
    <>
    {blogPostsDraft && editableBlogPosts ? (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-amber-100">Inläggseditor</div>
            <div className="text-xs text-amber-200/80">
              Uppdatera blogginläggens titlar och ingresser direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveBlogPosts()}
            disabled={!blogPostsDirty || isBlogPostsSaving}
          >
            {isBlogPostsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara inlägg
          </Button>
        </div>
        <div className="grid gap-3">
          {blogPostsDraft.map((item, index) => (
            <div
              key={`blog-post-${index}`}
              className="rounded-md border border-amber-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-amber-100">
                Inlägg {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-amber-100"
                    htmlFor={`blog-post-title-${index}`}
                  >
                    Titel
                  </label>
                  <Input
                    id={`blog-post-title-${index}`}
                    value={item.title}
                    onChange={(event) =>
                      setBlogPostsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, title: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-amber-100"
                    htmlFor={`blog-post-excerpt-${index}`}
                  >
                    Ingress
                  </label>
                  <Textarea
                    id={`blog-post-excerpt-${index}`}
                    value={item.excerpt}
                    onChange={(event) =>
                      setBlogPostsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, excerpt: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                    rows={3}
                  />
                </div>
              </div>
            </div>
          ))}
          {blogPostsSaveError ? (
            <div className="text-xs text-rose-300">{blogPostsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {footerLinkGroupsDraft && editableFooterLinkGroups ? (
      <div className="rounded-md border border-slate-500/30 bg-slate-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-slate-100">Footereditor</div>
            <div className="text-xs text-slate-200/80">
              Uppdatera footergrupper och länketiketter direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveFooterLinks()}
            disabled={!footerLinksDirty || isFooterLinksSaving}
          >
            {isFooterLinksSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara footer
          </Button>
        </div>
        <div className="grid gap-3">
          {footerLinkGroupsDraft.map((group, groupIndex) => (
            <div
              key={`footer-group-${groupIndex}`}
              className="rounded-md border border-slate-500/20 bg-black/10 p-3"
            >
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-slate-100"
                    htmlFor={`footer-group-heading-${groupIndex}`}
                  >
                    Gruppnamn
                  </label>
                  <Input
                    id={`footer-group-heading-${groupIndex}`}
                    value={group.heading}
                    onChange={(event) =>
                      setFooterLinkGroupsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === groupIndex
                                ? { ...entry, heading: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                {group.items.map((item, itemIndex) => (
                  <div
                    key={`footer-group-${groupIndex}-item-${itemIndex}`}
                    className="grid gap-1"
                  >
                    <label
                      className="text-xs font-medium text-slate-100"
                      htmlFor={`footer-group-${groupIndex}-item-${itemIndex}`}
                    >
                      Länk {itemIndex + 1}
                    </label>
                    <Input
                      id={`footer-group-${groupIndex}-item-${itemIndex}`}
                      value={item}
                      onChange={(event) =>
                        setFooterLinkGroupsDraft((prev) =>
                          prev
                            ? prev.map((entry, entryIndex) =>
                                entryIndex === groupIndex
                                  ? {
                                      ...entry,
                                      items: entry.items.map(
                                        (entryItem, entryItemIndex) =>
                                          entryItemIndex === itemIndex
                                            ? event.target.value
                                            : entryItem,
                                      ),
                                    }
                                  : entry,
                              )
                            : prev,
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {footerLinksSaveError ? (
            <div className="text-xs text-rose-300">{footerLinksSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {contactDraft && editableContactDetails ? (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-emerald-100">Kontakteditor</div>
            <div className="text-xs text-emerald-200/80">
              Uppdatera `mailto:` och `tel:` direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveContactDetails()}
            disabled={!contactDirty || isContactSaving}
          >
            {isContactSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara kontakt
          </Button>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-emerald-100" htmlFor="contact-email">
              E-post
            </label>
            <Input
              id="contact-email"
              value={contactDraft.email}
              onChange={(event) =>
                setContactDraft((prev) =>
                  prev ? { ...prev, email: event.target.value } : prev,
                )
              }
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-emerald-100" htmlFor="contact-phone">
              Telefon
            </label>
            <Input
              id="contact-phone"
              value={contactDraft.phone}
              onChange={(event) =>
                setContactDraft((prev) =>
                  prev ? { ...prev, phone: event.target.value } : prev,
                )
              }
            />
          </div>
          {contactSaveError ? (
            <div className="text-xs text-rose-300">{contactSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    </>
  );
}
