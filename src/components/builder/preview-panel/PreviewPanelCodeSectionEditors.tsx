"use client";

import { Loader2 } from "lucide-react";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FileNode } from "@/lib/builder/types";
import { getLanguageFromFileName } from "./code-file-tree-utils";
import type { PreviewPanelCodeDraftsBundle } from "./hooks/usePreviewPanelCodeDrafts";

export type PreviewPanelCodeSectionEditorsProps = {
  drafts: PreviewPanelCodeDraftsBundle;
  showElementRegistry: boolean;
  selectedRegistryLine: number | null;
  rawEditMode: boolean;
  rawCodeDraft: string;
  setRawCodeDraft: (value: string) => void;
  rawCodeSaveError: string | null;
  selectedFile: FileNode | null;
};

export function PreviewPanelCodeSectionEditors({
  drafts,
  showElementRegistry,
  selectedRegistryLine,
  rawEditMode,
  rawCodeDraft,
  setRawCodeDraft,
  rawCodeSaveError,
  selectedFile,
}: PreviewPanelCodeSectionEditorsProps) {
  const {
    metadataDraft,
    setMetadataDraft,
    metadataSaveError,
    isMetadataSaving,
    heroDraft,
    setHeroDraft,
    heroSaveError,
    isHeroSaving,
    serviceItemsDraft,
    setServiceItemsDraft,
    servicesSaveError,
    isServicesSaving,
    contactDraft,
    setContactDraft,
    contactSaveError,
    isContactSaving,
    faqItemsDraft,
    setFaqItemsDraft,
    faqSaveError,
    isFaqSaving,
    testimonialItemsDraft,
    setTestimonialItemsDraft,
    testimonialsSaveError,
    isTestimonialsSaving,
    teamMembersDraft,
    setTeamMembersDraft,
    teamSaveError,
    isTeamSaving,
    statItemsDraft,
    setStatItemsDraft,
    statsSaveError,
    isStatsSaving,
    processStepsDraft,
    setProcessStepsDraft,
    processSaveError,
    isProcessSaving,
    productItemsDraft,
    setProductItemsDraft,
    productsSaveError,
    isProductsSaving,
    pricingCardsDraft,
    setPricingCardsDraft,
    pricingSaveError,
    isPricingSaving,
    pricingFeatureCardsDraft,
    setPricingFeatureCardsDraft,
    pricingFeaturesSaveError,
    isPricingFeaturesSaving,
    categoryItemsDraft,
    setCategoryItemsDraft,
    categorySaveError,
    isCategorySaving,
    navItemsDraft,
    setNavItemsDraft,
    navSaveError,
    isNavSaving,
    buttonLabelsDraft,
    setButtonLabelsDraft,
    buttonLabelsSaveError,
    isButtonLabelsSaving,
    blogPostsDraft,
    setBlogPostsDraft,
    blogPostsSaveError,
    isBlogPostsSaving,
    footerLinkGroupsDraft,
    setFooterLinkGroupsDraft,
    footerLinksSaveError,
    isFooterLinksSaving,
    editableMetadata,
    editableHeroContent,
    editableServiceItems,
    editableContactDetails,
    editableFaqItems,
    editableTestimonialItems,
    editableTeamMembers,
    editableStatItems,
    editableProcessSteps,
    editableProductItems,
    editablePricingCards,
    editablePricingFeatureCards,
    editableCategoryItems,
    editableNavItems,
    editableButtonLabels,
    editableBlogPosts,
    editableFooterLinkGroups,
    metadataDirty,
    heroDirty,
    servicesDirty,
    contactDirty,
    faqDirty,
    testimonialsDirty,
    teamDirty,
    statsDirty,
    processDirty,
    productsDirty,
    pricingDirty,
    pricingFeaturesDirty,
    categoryDirty,
    navDirty,
    buttonLabelsDirty,
    blogPostsDirty,
    footerLinksDirty,
    handleSaveMetadata,
    handleSaveHeroContent,
    handleSaveServiceItems,
    handleSaveContactDetails,
    handleSaveFaqItems,
    handleSaveTestimonialItems,
    handleSaveTeamMembers,
    handleSaveStatItems,
    handleSaveProcessSteps,
    handleSaveProductItems,
    handleSavePricingCards,
    handleSavePricingFeatures,
    handleSaveCategoryItems,
    handleSaveNavItems,
    handleSaveButtonLabels,
    handleSaveBlogPosts,
    handleSaveFooterLinks,
  } = drafts;

  return (
    <>
    {metadataDraft && editableMetadata ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Metadata-editor</div>
            <div className="text-xs text-muted-foreground">
              Spara title och description direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveMetadata()}
            disabled={!metadataDirty || isMetadataSaving}
          >
            {isMetadataSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara metadata
          </Button>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-foreground" htmlFor="metadata-title">
              Title
            </label>
            <Input
              id="metadata-title"
              value={metadataDraft.title}
              onChange={(event) =>
                setMetadataDraft((prev) =>
                  prev ? { ...prev, title: event.target.value } : prev,
                )
              }
            />
          </div>
          <div className="grid gap-1">
            <label
              className="text-xs font-medium text-foreground"
              htmlFor="metadata-description"
            >
              Description
            </label>
            <Textarea
              id="metadata-description"
              value={metadataDraft.description}
              onChange={(event) =>
                setMetadataDraft((prev) =>
                  prev ? { ...prev, description: event.target.value } : prev,
                )
              }
              rows={3}
            />
          </div>
          {metadataSaveError ? (
            <div className="text-xs text-muted-foreground">{metadataSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {heroDraft && editableHeroContent ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Hero-editor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera hero-rubrik, ingress och CTA direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveHeroContent()}
            disabled={!heroDirty || isHeroSaving}
          >
            {isHeroSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara hero
          </Button>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-foreground" htmlFor="hero-title">
              Rubrik
            </label>
            <Input
              id="hero-title"
              value={heroDraft.title}
              onChange={(event) =>
                setHeroDraft((prev) =>
                  prev ? { ...prev, title: event.target.value } : prev,
                )
              }
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-foreground" htmlFor="hero-intro">
              Ingress
            </label>
            <Textarea
              id="hero-intro"
              value={heroDraft.intro}
              onChange={(event) =>
                setHeroDraft((prev) =>
                  prev ? { ...prev, intro: event.target.value } : prev,
                )
              }
              rows={3}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-foreground" htmlFor="hero-cta">
              CTA-text
            </label>
            <Input
              id="hero-cta"
              value={heroDraft.ctaLabel}
              onChange={(event) =>
                setHeroDraft((prev) =>
                  prev ? { ...prev, ctaLabel: event.target.value } : prev,
                )
              }
            />
          </div>
          {heroSaveError ? (
            <div className="text-xs text-muted-foreground">{heroSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {serviceItemsDraft && editableServiceItems ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Tjänsteeditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera tjänstetitlar och beskrivningar direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveServiceItems()}
            disabled={!servicesDirty || isServicesSaving}
          >
            {isServicesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara tjänster
          </Button>
        </div>
        <div className="grid gap-3">
          {serviceItemsDraft.map((item, index) => (
            <div
              key={`service-item-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Tjänst {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`service-title-${index}`}
                  >
                    Titel
                  </label>
                  <Input
                    id={`service-title-${index}`}
                    value={item.title}
                    onChange={(event) =>
                      setServiceItemsDraft((prev) =>
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
                    className="text-xs font-medium text-foreground"
                    htmlFor={`service-description-${index}`}
                  >
                    Beskrivning
                  </label>
                  <Textarea
                    id={`service-description-${index}`}
                    value={item.description}
                    onChange={(event) =>
                      setServiceItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, description: event.target.value }
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
          {servicesSaveError ? (
            <div className="text-xs text-muted-foreground">{servicesSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {faqItemsDraft && editableFaqItems ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">FAQ-editor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera frågor och svar direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveFaqItems()}
            disabled={!faqDirty || isFaqSaving}
          >
            {isFaqSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara FAQ
          </Button>
        </div>
        <div className="grid gap-3">
          {faqItemsDraft.map((item, index) => (
            <div
              key={`faq-item-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                FAQ {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`faq-question-${index}`}
                  >
                    Fråga
                  </label>
                  <Input
                    id={`faq-question-${index}`}
                    value={item.question}
                    onChange={(event) =>
                      setFaqItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, question: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`faq-answer-${index}`}
                  >
                    Svar
                  </label>
                  <Textarea
                    id={`faq-answer-${index}`}
                    value={item.answer}
                    onChange={(event) =>
                      setFaqItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, answer: event.target.value }
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
          {faqSaveError ? (
            <div className="text-xs text-muted-foreground">{faqSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {testimonialItemsDraft && editableTestimonialItems ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Omdömeseditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera namn, roll och citat direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveTestimonialItems()}
            disabled={!testimonialsDirty || isTestimonialsSaving}
          >
            {isTestimonialsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara omdömen
          </Button>
        </div>
        <div className="grid gap-3">
          {testimonialItemsDraft.map((item, index) => (
            <div
              key={`testimonial-item-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Omdöme {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`testimonial-name-${index}`}
                  >
                    Namn
                  </label>
                  <Input
                    id={`testimonial-name-${index}`}
                    value={item.name}
                    onChange={(event) =>
                      setTestimonialItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, name: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`testimonial-role-${index}`}
                  >
                    Roll
                  </label>
                  <Input
                    id={`testimonial-role-${index}`}
                    value={item.role}
                    onChange={(event) =>
                      setTestimonialItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, role: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`testimonial-quote-${index}`}
                  >
                    Citat
                  </label>
                  <Textarea
                    id={`testimonial-quote-${index}`}
                    value={item.quote}
                    onChange={(event) =>
                      setTestimonialItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, quote: event.target.value }
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
          {testimonialsSaveError ? (
            <div className="text-xs text-muted-foreground">{testimonialsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {teamMembersDraft && editableTeamMembers ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Teameditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera namn, roll och beskrivning för teammedlemmar.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveTeamMembers()}
            disabled={!teamDirty || isTeamSaving}
          >
            {isTeamSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara team
          </Button>
        </div>
        <div className="grid gap-3">
          {teamMembersDraft.map((member, index) => (
            <div
              key={`team-member-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Medlem {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`team-name-${index}`}
                  >
                    Namn
                  </label>
                  <Input
                    id={`team-name-${index}`}
                    value={member.name}
                    onChange={(event) =>
                      setTeamMembersDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, name: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`team-role-${index}`}
                  >
                    Roll
                  </label>
                  <Input
                    id={`team-role-${index}`}
                    value={member.role}
                    onChange={(event) =>
                      setTeamMembersDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, role: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`team-bio-${index}`}
                  >
                    Beskrivning
                  </label>
                  <Textarea
                    id={`team-bio-${index}`}
                    value={member.bio}
                    onChange={(event) =>
                      setTeamMembersDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, bio: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}
          {teamSaveError ? (
            <div className="text-xs text-muted-foreground">{teamSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {statItemsDraft && editableStatItems ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Nyckeltalseditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera etiketter och värden direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveStatItems()}
            disabled={!statsDirty || isStatsSaving}
          >
            {isStatsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara nyckeltal
          </Button>
        </div>
        <div className="grid gap-3">
          {statItemsDraft.map((item, index) => (
            <div
              key={`stat-item-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Nyckeltal {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`stat-label-${index}`}
                  >
                    Etikett
                  </label>
                  <Input
                    id={`stat-label-${index}`}
                    value={item.label}
                    onChange={(event) =>
                      setStatItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, label: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`stat-value-${index}`}
                  >
                    Värde
                  </label>
                  <Input
                    id={`stat-value-${index}`}
                    value={item.value}
                    onChange={(event) =>
                      setStatItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, value: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
          {statsSaveError ? (
            <div className="text-xs text-muted-foreground">{statsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {processStepsDraft && editableProcessSteps ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Processtegeditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera process-/steps-listan direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveProcessSteps()}
            disabled={!processDirty || isProcessSaving}
          >
            {isProcessSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara processteg
          </Button>
        </div>
        <div className="grid gap-3">
          {processStepsDraft.map((item, index) => (
            <div
              key={`process-step-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Steg {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-foreground"
                  htmlFor={`process-step-${index}`}
                >
                  Text
                </label>
                <Textarea
                  id={`process-step-${index}`}
                  value={item.text}
                  onChange={(event) =>
                    setProcessStepsDraft((prev) =>
                      prev
                        ? prev.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, text: event.target.value }
                              : entry,
                          )
                        : prev,
                    )
                  }
                  rows={3}
                />
              </div>
            </div>
          ))}
          {processSaveError ? (
            <div className="text-xs text-muted-foreground">{processSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {productItemsDraft && editableProductItems ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Produkteditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera produktnamn och pris direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveProductItems()}
            disabled={!productsDirty || isProductsSaving}
          >
            {isProductsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara produkter
          </Button>
        </div>
        <div className="grid gap-3">
          {productItemsDraft.map((item, index) => (
            <div
              key={`product-item-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Produkt {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`product-name-${index}`}
                  >
                    Namn
                  </label>
                  <Input
                    id={`product-name-${index}`}
                    value={item.name}
                    onChange={(event) =>
                      setProductItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, name: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`product-price-${index}`}
                  >
                    Pris
                  </label>
                  <Input
                    id={`product-price-${index}`}
                    value={item.price}
                    onChange={(event) =>
                      setProductItemsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, price: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
          {productsSaveError ? (
            <div className="text-xs text-muted-foreground">{productsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {pricingCardsDraft && editablePricingCards ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Pricing-editor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera namn, pris och beskrivning för prisplaner i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSavePricingCards()}
            disabled={!pricingDirty || isPricingSaving}
          >
            {isPricingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara pricing
          </Button>
        </div>
        <div className="grid gap-3">
          {pricingCardsDraft.map((item, index) => (
            <div
              key={`pricing-card-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Prisplan {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`pricing-name-${index}`}
                  >
                    Namn
                  </label>
                  <Input
                    id={`pricing-name-${index}`}
                    value={item.name}
                    onChange={(event) =>
                      setPricingCardsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, name: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`pricing-price-${index}`}
                  >
                    Pris
                  </label>
                  <Input
                    id={`pricing-price-${index}`}
                    value={item.price}
                    onChange={(event) =>
                      setPricingCardsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, price: event.target.value }
                                : entry,
                            )
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor={`pricing-description-${index}`}
                  >
                    Beskrivning
                  </label>
                  <Textarea
                    id={`pricing-description-${index}`}
                    value={item.description}
                    onChange={(event) =>
                      setPricingCardsDraft((prev) =>
                        prev
                          ? prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, description: event.target.value }
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
          {pricingSaveError ? (
            <div className="text-xs text-muted-foreground">{pricingSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {pricingFeatureCardsDraft && editablePricingFeatureCards ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">
              Pricing features-editor
            </div>
            <div className="text-xs text-muted-foreground">
              Uppdatera feature-listorna för prisplaner direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSavePricingFeatures()}
            disabled={!pricingFeaturesDirty || isPricingFeaturesSaving}
          >
            {isPricingFeaturesSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Spara features
          </Button>
        </div>
        <div className="grid gap-3">
          {pricingFeatureCardsDraft.map((card, cardIndex) => (
            <div
              key={`pricing-feature-card-${cardIndex}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                {card.name}
              </div>
              <div className="grid gap-3">
                {card.features.map((feature, featureIndex) => (
                  <div
                    key={`pricing-feature-${cardIndex}-${featureIndex}`}
                    className="grid gap-1"
                  >
                    <label
                      className="text-xs font-medium text-foreground"
                      htmlFor={`pricing-feature-${cardIndex}-${featureIndex}`}
                    >
                      Feature {featureIndex + 1}
                    </label>
                    <Input
                      id={`pricing-feature-${cardIndex}-${featureIndex}`}
                      value={feature}
                      onChange={(event) =>
                        setPricingFeatureCardsDraft((prev) =>
                          prev
                            ? prev.map((entry, entryIndex) =>
                                entryIndex === cardIndex
                                  ? {
                                      ...entry,
                                      features: entry.features.map(
                                        (entryFeature, entryFeatureIndex) =>
                                          entryFeatureIndex === featureIndex
                                            ? event.target.value
                                            : entryFeature,
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
          {pricingFeaturesSaveError ? (
            <div className="text-xs text-muted-foreground">{pricingFeaturesSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {categoryItemsDraft && editableCategoryItems ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Kategorieditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera kategorinamnen direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveCategoryItems()}
            disabled={!categoryDirty || isCategorySaving}
          >
            {isCategorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara kategorier
          </Button>
        </div>
        <div className="grid gap-3">
          {categoryItemsDraft.map((item, index) => (
            <div
              key={`category-item-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Kategori {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-foreground"
                  htmlFor={`category-name-${index}`}
                >
                  Namn
                </label>
                <Input
                  id={`category-name-${index}`}
                  value={item.name}
                  onChange={(event) =>
                    setCategoryItemsDraft((prev) =>
                      prev
                        ? prev.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, name: event.target.value }
                              : entry,
                          )
                        : prev,
                    )
                  }
                />
              </div>
            </div>
          ))}
          {categorySaveError ? (
            <div className="text-xs text-muted-foreground">{categorySaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {navItemsDraft && editableNavItems ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Navigationeditor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera navigationsetiketter direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveNavItems()}
            disabled={!navDirty || isNavSaving}
          >
            {isNavSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara navigation
          </Button>
        </div>
        <div className="grid gap-3">
          {navItemsDraft.map((item, index) => (
            <div
              key={`nav-item-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Menyval {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-foreground"
                  htmlFor={`nav-label-${index}`}
                >
                  Etikett
                </label>
                <Input
                  id={`nav-label-${index}`}
                  value={item.label}
                  onChange={(event) =>
                    setNavItemsDraft((prev) =>
                      prev
                        ? prev.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, label: event.target.value }
                              : entry,
                          )
                        : prev,
                    )
                  }
                />
              </div>
            </div>
          ))}
          {navSaveError ? (
            <div className="text-xs text-muted-foreground">{navSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {buttonLabelsDraft && editableButtonLabels ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">CTA-editor</div>
            <div className="text-xs text-muted-foreground">
              Uppdatera vanliga Button-etiketter direkt i den aktiva versionen.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveButtonLabels()}
            disabled={!buttonLabelsDirty || isButtonLabelsSaving}
          >
            {isButtonLabelsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara CTA
          </Button>
        </div>
        <div className="grid gap-3">
          {buttonLabelsDraft.map((item, index) => (
            <div
              key={`button-label-${index}`}
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Knapp {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-foreground"
                  htmlFor={`button-label-${index}`}
                >
                  Etikett
                </label>
                <Input
                  id={`button-label-${index}`}
                  value={item.label}
                  onChange={(event) =>
                    setButtonLabelsDraft((prev) =>
                      prev
                        ? prev.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, label: event.target.value }
                              : entry,
                          )
                        : prev,
                    )
                  }
                />
              </div>
            </div>
          ))}
          {buttonLabelsSaveError ? (
            <div className="text-xs text-muted-foreground">{buttonLabelsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {blogPostsDraft && editableBlogPosts ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Inläggseditor</div>
            <div className="text-xs text-muted-foreground">
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
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-foreground">
                Inlägg {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
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
                    className="text-xs font-medium text-foreground"
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
            <div className="text-xs text-muted-foreground">{blogPostsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {footerLinkGroupsDraft && editableFooterLinkGroups ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Footereditor</div>
            <div className="text-xs text-muted-foreground">
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
              className="rounded-md border border-border bg-background/10 p-3"
            >
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-foreground"
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
                      className="text-xs font-medium text-foreground"
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
            <div className="text-xs text-muted-foreground">{footerLinksSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {contactDraft && editableContactDetails ? (
      <div className="rounded-md border border-border bg-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">Kontakteditor</div>
            <div className="text-xs text-muted-foreground">
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
            <label className="text-xs font-medium text-foreground" htmlFor="contact-email">
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
            <label className="text-xs font-medium text-foreground" htmlFor="contact-phone">
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
            <div className="text-xs text-muted-foreground">{contactSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {showElementRegistry && selectedRegistryLine && (
      <div className="text-xs text-muted-foreground">Målrad: {selectedRegistryLine}</div>
    )}
    {rawEditMode ? (
      <div className="space-y-2">
        <Textarea
          value={rawCodeDraft}
          onChange={(event) => setRawCodeDraft(event.target.value)}
          className="min-h-[420px] font-mono text-xs"
        />
        {rawCodeSaveError ? (
          <div className="text-xs text-muted-foreground">{rawCodeSaveError}</div>
        ) : null}
      </div>
    ) : (
      <CodeBlock
        code={selectedFile?.content || ""}
        language={getLanguageFromFileName(selectedFile?.name || "")}
        showLineNumbers
      >
        <CodeBlockCopyButton className="text-muted-foreground hover:text-foreground" />
      </CodeBlock>
    )}
    </>
  );
}
