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
export function CodeSectionEditorsCommerce({ drafts }: Props) {
  const {
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
    editablePricingCards,
    editablePricingFeatureCards,
    editableCategoryItems,
    editableNavItems,
    editableButtonLabels,
    pricingDirty,
    pricingFeaturesDirty,
    categoryDirty,
    navDirty,
    buttonLabelsDirty,
    handleSavePricingCards,
    handleSavePricingFeatures,
    handleSaveCategoryItems,
    handleSaveNavItems,
    handleSaveButtonLabels,
  } = drafts;

  return (
    <>
    {pricingCardsDraft && editablePricingCards ? (
      <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-cyan-100">Pricing-editor</div>
            <div className="text-xs text-cyan-200/80">
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
              className="rounded-md border border-cyan-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-cyan-100">
                Prisplan {index + 1}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-cyan-100"
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
                    className="text-xs font-medium text-cyan-100"
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
                    className="text-xs font-medium text-cyan-100"
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
            <div className="text-xs text-rose-300">{pricingSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {pricingFeatureCardsDraft && editablePricingFeatureCards ? (
      <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-teal-100">
              Pricing features-editor
            </div>
            <div className="text-xs text-teal-200/80">
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
              className="rounded-md border border-teal-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-teal-100">
                {card.name}
              </div>
              <div className="grid gap-3">
                {card.features.map((feature, featureIndex) => (
                  <div
                    key={`pricing-feature-${cardIndex}-${featureIndex}`}
                    className="grid gap-1"
                  >
                    <label
                      className="text-xs font-medium text-teal-100"
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
            <div className="text-xs text-rose-300">{pricingFeaturesSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {categoryItemsDraft && editableCategoryItems ? (
      <div className="rounded-md border border-lime-500/30 bg-lime-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-lime-100">Kategorieditor</div>
            <div className="text-xs text-lime-200/80">
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
              className="rounded-md border border-lime-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-lime-100">
                Kategori {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-lime-100"
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
            <div className="text-xs text-rose-300">{categorySaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {navItemsDraft && editableNavItems ? (
      <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-indigo-100">Navigationeditor</div>
            <div className="text-xs text-indigo-200/80">
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
              className="rounded-md border border-indigo-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-indigo-100">
                Menyval {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-indigo-100"
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
            <div className="text-xs text-rose-300">{navSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {buttonLabelsDraft && editableButtonLabels ? (
      <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-rose-100">CTA-editor</div>
            <div className="text-xs text-rose-200/80">
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
              className="rounded-md border border-rose-500/20 bg-black/10 p-3"
            >
              <div className="mb-2 text-xs font-medium text-rose-100">
                Knapp {index + 1}
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs font-medium text-rose-100"
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
            <div className="text-xs text-rose-300">{buttonLabelsSaveError}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    </>
  );
}
