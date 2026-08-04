"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PreviewPanelCodeDraftsBundle } from "../hooks/usePreviewPanelCodeDrafts";

type Props = {
  drafts: PreviewPanelCodeDraftsBundle;
};

/** Internal section cluster for PreviewPanelCodeSectionEditors. */
export function CodeSectionEditorsContent({ drafts }: Props) {
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
    editableMetadata,
    editableHeroContent,
    editableServiceItems,
    editableFaqItems,
    editableTestimonialItems,
    editableTeamMembers,
    editableStatItems,
    editableProcessSteps,
    editableProductItems,
    metadataDirty,
    heroDirty,
    servicesDirty,
    faqDirty,
    testimonialsDirty,
    teamDirty,
    statsDirty,
    processDirty,
    productsDirty,
    handleSaveMetadata,
    handleSaveHeroContent,
    handleSaveServiceItems,
    handleSaveFaqItems,
    handleSaveTestimonialItems,
    handleSaveTeamMembers,
    handleSaveStatItems,
    handleSaveProcessSteps,
    handleSaveProductItems,
  } = drafts;

  return (
    <>
    {metadataDraft && editableMetadata ? (
      <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-cyan-100">Metadata-editor</div>
            <div className="text-xs text-cyan-200/80">
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
            <label className="text-xs font-medium text-cyan-100" htmlFor="metadata-title">
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
              className="text-xs font-medium text-cyan-100"
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
            <div className="text-xs text-rose-300">{metadataSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {heroDraft && editableHeroContent ? (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-amber-100">Hero-editor</div>
            <div className="text-xs text-amber-200/80">
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
            <label className="text-xs font-medium text-amber-100" htmlFor="hero-title">
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
            <label className="text-xs font-medium text-amber-100" htmlFor="hero-intro">
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
            <label className="text-xs font-medium text-amber-100" htmlFor="hero-cta">
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
            <div className="text-xs text-rose-300">{heroSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {serviceItemsDraft && editableServiceItems ? (
      <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-fuchsia-100">Tjänsteeditor</div>
            <div className="text-xs text-fuchsia-200/80">
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
              className="rounded-md border border-fuchsia-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-fuchsia-100">
                Tjänst {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-fuchsia-100"
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
                    className="text-xs font-medium text-fuchsia-100"
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
            <div className="text-xs text-rose-300">{servicesSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {faqItemsDraft && editableFaqItems ? (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-amber-100">FAQ-editor</div>
            <div className="text-xs text-amber-200/80">
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
              className="rounded-md border border-amber-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-amber-100">
                FAQ {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-amber-100"
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
                    className="text-xs font-medium text-amber-100"
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
            <div className="text-xs text-rose-300">{faqSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {testimonialItemsDraft && editableTestimonialItems ? (
      <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-sky-100">Omdömeseditor</div>
            <div className="text-xs text-sky-200/80">
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
              className="rounded-md border border-sky-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-sky-100">
                Omdöme {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-sky-100"
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
                    className="text-xs font-medium text-sky-100"
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
                    className="text-xs font-medium text-sky-100"
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
            <div className="text-xs text-rose-300">{testimonialsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {teamMembersDraft && editableTeamMembers ? (
      <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-teal-100">Teameditor</div>
            <div className="text-xs text-teal-200/80">
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
              className="rounded-md border border-teal-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-teal-100">
                Medlem {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-teal-100"
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
                    className="text-xs font-medium text-teal-100"
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
                    className="text-xs font-medium text-teal-100"
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
            <div className="text-xs text-rose-300">{teamSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {statItemsDraft && editableStatItems ? (
      <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-violet-100">Nyckeltalseditor</div>
            <div className="text-xs text-violet-200/80">
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
              className="rounded-md border border-violet-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-violet-100">
                Nyckeltal {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-violet-100"
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
                    className="text-xs font-medium text-violet-100"
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
            <div className="text-xs text-rose-300">{statsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {processStepsDraft && editableProcessSteps ? (
      <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-orange-100">Processtegeditor</div>
            <div className="text-xs text-orange-200/80">
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
              className="rounded-md border border-orange-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-orange-100">
                Steg {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-orange-100"
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
            <div className="text-xs text-rose-300">{processSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {productItemsDraft && editableProductItems ? (
      <div className="rounded-md border border-pink-500/30 bg-pink-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-pink-100">Produkteditor</div>
            <div className="text-xs text-pink-200/80">
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
              className="rounded-md border border-pink-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-pink-100">
                Produkt {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-pink-100"
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
                    className="text-xs font-medium text-pink-100"
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
            <div className="text-xs text-rose-300">{productsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    </>
  );
}
