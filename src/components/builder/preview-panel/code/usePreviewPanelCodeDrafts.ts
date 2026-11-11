"use client";

import {
  readContactDetailsDraft,
  updateContactDetailsDraft,
  type ContactDetailsDraft,
} from "@/lib/builder/editors/contact-editor";
import {
  readHeroContentDraft,
  updateHeroContentDraft,
  type HeroContentDraft,
} from "@/lib/builder/editors/hero-editor";
import {
  readServiceItemsDraft,
  updateServiceItemsDraft,
  type ServiceItemDraft,
} from "@/lib/builder/editors/services-editor";
import {
  readFaqItemsDraft,
  updateFaqItemsDraft,
  type FaqItemDraft,
} from "@/lib/builder/editors/faq-editor";
import {
  readTestimonialItemsDraft,
  updateTestimonialItemsDraft,
  type TestimonialItemDraft,
} from "@/lib/builder/editors/testimonials-editor";
import {
  readTeamMembers,
  updateTeamMembersDraft,
  type TeamMemberDraft,
} from "@/lib/builder/editors/team-editor";
import {
  readStatItemsDraft,
  updateStatItemsDraft,
  type StatItemDraft,
} from "@/lib/builder/editors/stats-editor";
import {
  readProcessStepsDraft,
  updateProcessStepsDraft,
  type ProcessStepDraft,
} from "@/lib/builder/editors/process-editor";
import {
  readProductItemsDraft,
  updateProductItemsDraft,
  type ProductItemDraft,
} from "@/lib/builder/editors/product-editor";
import {
  readPricingCardsDraft,
  updatePricingCardsDraft,
  type PricingCardDraft,
} from "@/lib/builder/editors/pricing-editor";
import {
  readPricingFeatureCardsDraft,
  updatePricingFeatureCardsDraft,
  type PricingFeatureCardDraft,
} from "@/lib/builder/editors/pricing-features-editor";
import {
  readCategoryItemsDraft,
  updateCategoryItemsDraft,
  type CategoryItemDraft,
} from "@/lib/builder/editors/category-editor";
import {
  readNavItemsDraft,
  updateNavItemsDraft,
  type NavItemDraft,
} from "@/lib/builder/editors/nav-items-editor";
import {
  readButtonLabelsDraft,
  updateButtonLabelsDraft,
  type ButtonLabelDraft,
} from "@/lib/builder/editors/button-label-editor";
import {
  readBlogPostsDraft,
  updateBlogPostsDraft,
  type BlogPostDraft,
} from "@/lib/builder/editors/blog-posts-editor";
import {
  readFooterLinkGroupsDraft,
  updateFooterLinkGroupsDraft,
  type FooterLinkGroupDraft,
} from "@/lib/builder/editors/footer-links-editor";
import {
  readStaticMetadataDraft,
  updateStaticMetadataDraft,
  type StaticMetadataDraft,
} from "@/lib/builder/editors/metadata-editor";
import type { FileNode } from "@/lib/builder/types";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

// Keep unsaved edits per file when selection or fetched content changes.
function useFileDraft<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [entries, setEntries] = useState<Record<string, { source: string; draft: T }>>({});
  const source = JSON.stringify(initial);
  const entry = entries[key];
  const dirty = entry && JSON.stringify(entry.draft) !== entry.source;
  const value = dirty ? entry.draft : initial;
  // A successful save acknowledges the draft; future refreshes may replace it.
  if (entry && entry.source !== source && (!dirty || JSON.stringify(entry.draft) === source)) {
    setEntries((previous) => ({ ...previous, [key]: { source, draft: initial } }));
  }
  const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    setEntries((previous) => {
      const saved = previous[key];
      const savedDirty = saved && JSON.stringify(saved.draft) !== saved.source;
      const current = savedDirty ? saved.draft : initial;
      const draft = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
      return { ...previous, [key]: { source: savedDirty ? saved.source : source, draft } };
    });
  }, [key, initial, source]);
  return [value, setValue];
}

export function usePreviewPanelCodeDrafts(options: {
  selectedFile: FileNode | null;
  draftScope?: string | null;
  saveSelectedFileContent: (nextContent: string) => Promise<boolean>;
}) {
  const { selectedFile, saveSelectedFileContent } = options;
  const draftKey = JSON.stringify([options.draftScope ?? null, selectedFile?.path ?? null]);

  const [metadataSaveError, setMetadataSaveError] = useState<string | null>(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [heroSaveError, setHeroSaveError] = useState<string | null>(null);
  const [isHeroSaving, setIsHeroSaving] = useState(false);
  const [servicesSaveError, setServicesSaveError] = useState<string | null>(null);
  const [isServicesSaving, setIsServicesSaving] = useState(false);
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [isContactSaving, setIsContactSaving] = useState(false);
  const [faqSaveError, setFaqSaveError] = useState<string | null>(null);
  const [isFaqSaving, setIsFaqSaving] = useState(false);
  const [testimonialsSaveError, setTestimonialsSaveError] = useState<string | null>(null);
  const [isTestimonialsSaving, setIsTestimonialsSaving] = useState(false);
  const [teamSaveError, setTeamSaveError] = useState<string | null>(null);
  const [isTeamSaving, setIsTeamSaving] = useState(false);
  const [statsSaveError, setStatsSaveError] = useState<string | null>(null);
  const [isStatsSaving, setIsStatsSaving] = useState(false);
  const [processSaveError, setProcessSaveError] = useState<string | null>(null);
  const [isProcessSaving, setIsProcessSaving] = useState(false);
  const [productsSaveError, setProductsSaveError] = useState<string | null>(null);
  const [isProductsSaving, setIsProductsSaving] = useState(false);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);
  const [isPricingSaving, setIsPricingSaving] = useState(false);
  const [pricingFeaturesSaveError, setPricingFeaturesSaveError] = useState<string | null>(null);
  const [isPricingFeaturesSaving, setIsPricingFeaturesSaving] = useState(false);
  const [categorySaveError, setCategorySaveError] = useState<string | null>(null);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [navSaveError, setNavSaveError] = useState<string | null>(null);
  const [isNavSaving, setIsNavSaving] = useState(false);
  const [buttonLabelsSaveError, setButtonLabelsSaveError] = useState<string | null>(null);
  const [isButtonLabelsSaving, setIsButtonLabelsSaving] = useState(false);
  const [blogPostsSaveError, setBlogPostsSaveError] = useState<string | null>(null);
  const [isBlogPostsSaving, setIsBlogPostsSaving] = useState(false);
  const [footerLinksSaveError, setFooterLinksSaveError] = useState<string | null>(null);
  const [isFooterLinksSaving, setIsFooterLinksSaving] = useState(false);
  const [rawCodeSaveError, setRawCodeSaveError] = useState<string | null>(null);
  const [isRawCodeSaving, setIsRawCodeSaving] = useState(false);

  const editableMetadata = useMemo(
    () =>
      selectedFile
        ? readStaticMetadataDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableHeroContent = useMemo(
    () =>
      selectedFile
        ? readHeroContentDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableServiceItems = useMemo(
    () =>
      selectedFile
        ? readServiceItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableContactDetails = useMemo(
    () => (selectedFile ? readContactDetailsDraft(selectedFile.content || "") : null),
    [selectedFile],
  );

  const editableFaqItems = useMemo(
    () =>
      selectedFile
        ? readFaqItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableTestimonialItems = useMemo(
    () =>
      selectedFile
        ? readTestimonialItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableTeamMembers = useMemo(
    () =>
      selectedFile
        ? readTeamMembers(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableStatItems = useMemo(
    () =>
      selectedFile
        ? readStatItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableProcessSteps = useMemo(
    () =>
      selectedFile
        ? readProcessStepsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableProductItems = useMemo(
    () =>
      selectedFile
        ? readProductItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editablePricingCards = useMemo(
    () =>
      selectedFile
        ? readPricingCardsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editablePricingFeatureCards = useMemo(
    () =>
      selectedFile
        ? readPricingFeatureCardsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableCategoryItems = useMemo(
    () =>
      selectedFile
        ? readCategoryItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableNavItems = useMemo(
    () => (selectedFile ? readNavItemsDraft(selectedFile.path, selectedFile.content || "") : null),
    [selectedFile],
  );

  const editableButtonLabels = useMemo(
    () =>
      selectedFile ? readButtonLabelsDraft(selectedFile.path, selectedFile.content || "") : null,
    [selectedFile],
  );

  const editableBlogPosts = useMemo(
    () => (selectedFile ? readBlogPostsDraft(selectedFile.path, selectedFile.content || "") : null),
    [selectedFile],
  );

  const editableFooterLinkGroups = useMemo(
    () =>
      selectedFile
        ? readFooterLinkGroupsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const [metadataDraft, setMetadataDraft] = useFileDraft<StaticMetadataDraft | null>(draftKey, editableMetadata);
  const [heroDraft, setHeroDraft] = useFileDraft<HeroContentDraft | null>(draftKey, editableHeroContent);
  const [serviceItemsDraft, setServiceItemsDraft] = useFileDraft<ServiceItemDraft[] | null>(draftKey, editableServiceItems);
  const [contactDraft, setContactDraft] = useFileDraft<ContactDetailsDraft | null>(draftKey, editableContactDetails);
  const [faqItemsDraft, setFaqItemsDraft] = useFileDraft<FaqItemDraft[] | null>(draftKey, editableFaqItems);
  const [testimonialItemsDraft, setTestimonialItemsDraft] = useFileDraft<TestimonialItemDraft[] | null>(draftKey, editableTestimonialItems);
  const [teamMembersDraft, setTeamMembersDraft] = useFileDraft<TeamMemberDraft[] | null>(draftKey, editableTeamMembers);
  const [statItemsDraft, setStatItemsDraft] = useFileDraft<StatItemDraft[] | null>(draftKey, editableStatItems);
  const [processStepsDraft, setProcessStepsDraft] = useFileDraft<ProcessStepDraft[] | null>(draftKey, editableProcessSteps);
  const [productItemsDraft, setProductItemsDraft] = useFileDraft<ProductItemDraft[] | null>(draftKey, editableProductItems);
  const [pricingCardsDraft, setPricingCardsDraft] = useFileDraft<PricingCardDraft[] | null>(draftKey, editablePricingCards);
  const [pricingFeatureCardsDraft, setPricingFeatureCardsDraft] = useFileDraft<PricingFeatureCardDraft[] | null>(draftKey, editablePricingFeatureCards);
  const [categoryItemsDraft, setCategoryItemsDraft] = useFileDraft<CategoryItemDraft[] | null>(draftKey, editableCategoryItems);
  const [navItemsDraft, setNavItemsDraft] = useFileDraft<NavItemDraft[] | null>(draftKey, editableNavItems);
  const [buttonLabelsDraft, setButtonLabelsDraft] = useFileDraft<ButtonLabelDraft[] | null>(draftKey, editableButtonLabels);
  const [blogPostsDraft, setBlogPostsDraft] = useFileDraft<BlogPostDraft[] | null>(draftKey, editableBlogPosts);
  const [footerLinkGroupsDraft, setFooterLinkGroupsDraft] = useFileDraft<FooterLinkGroupDraft[] | null>(draftKey, editableFooterLinkGroups);
  const [rawEditMode, setRawEditMode] = useFileDraft(draftKey, false);
  const [rawCodeDraft, setRawCodeDraft] = useFileDraft(draftKey, selectedFile?.content || "");

  useEffect(() => {
    setMetadataSaveError(null);
    setHeroSaveError(null);
    setServicesSaveError(null);
    setContactSaveError(null);
    setFaqSaveError(null);
    setTestimonialsSaveError(null);
    setTeamSaveError(null);
    setStatsSaveError(null);
    setProcessSaveError(null);
    setProductsSaveError(null);
    setPricingSaveError(null);
    setPricingFeaturesSaveError(null);
    setCategorySaveError(null);
    setNavSaveError(null);
    setButtonLabelsSaveError(null);
    setBlogPostsSaveError(null);
    setFooterLinksSaveError(null);
    setRawCodeSaveError(null);
  }, [draftKey, selectedFile?.content]);

  const metadataDirty = Boolean(
    metadataDraft &&
      editableMetadata &&
      (metadataDraft.title !== editableMetadata.title ||
        metadataDraft.description !== editableMetadata.description),
  );

  const heroDirty = Boolean(
    heroDraft &&
      editableHeroContent &&
      (heroDraft.title !== editableHeroContent.title ||
        heroDraft.intro !== editableHeroContent.intro ||
        heroDraft.ctaLabel !== editableHeroContent.ctaLabel),
  );

  const servicesDirty = Boolean(
    serviceItemsDraft &&
      editableServiceItems &&
      JSON.stringify(serviceItemsDraft) !== JSON.stringify(editableServiceItems),
  );

  const contactDirty = Boolean(
    contactDraft &&
      editableContactDetails &&
      (contactDraft.email !== editableContactDetails.email ||
        contactDraft.phone !== editableContactDetails.phone),
  );

  const faqDirty = Boolean(
    faqItemsDraft &&
      editableFaqItems &&
      JSON.stringify(faqItemsDraft) !== JSON.stringify(editableFaqItems),
  );

  const testimonialsDirty = Boolean(
    testimonialItemsDraft &&
      editableTestimonialItems &&
      JSON.stringify(testimonialItemsDraft) !== JSON.stringify(editableTestimonialItems),
  );

  const teamDirty = Boolean(
    teamMembersDraft &&
      editableTeamMembers &&
      JSON.stringify(teamMembersDraft) !== JSON.stringify(editableTeamMembers),
  );

  const statsDirty = Boolean(
    statItemsDraft &&
      editableStatItems &&
      JSON.stringify(statItemsDraft) !== JSON.stringify(editableStatItems),
  );

  const processDirty = Boolean(
    processStepsDraft &&
      editableProcessSteps &&
      JSON.stringify(processStepsDraft) !== JSON.stringify(editableProcessSteps),
  );

  const productsDirty = Boolean(
    productItemsDraft &&
      editableProductItems &&
      JSON.stringify(productItemsDraft) !== JSON.stringify(editableProductItems),
  );

  const pricingDirty = Boolean(
    pricingCardsDraft &&
      editablePricingCards &&
      JSON.stringify(pricingCardsDraft) !== JSON.stringify(editablePricingCards),
  );

  const pricingFeaturesDirty = Boolean(
    pricingFeatureCardsDraft &&
      editablePricingFeatureCards &&
      JSON.stringify(pricingFeatureCardsDraft) !== JSON.stringify(editablePricingFeatureCards),
  );

  const categoryDirty = Boolean(
    categoryItemsDraft &&
      editableCategoryItems &&
      JSON.stringify(categoryItemsDraft) !== JSON.stringify(editableCategoryItems),
  );

  const navDirty = Boolean(
    navItemsDraft &&
      editableNavItems &&
      JSON.stringify(navItemsDraft) !== JSON.stringify(editableNavItems),
  );

  const buttonLabelsDirty = Boolean(
    buttonLabelsDraft &&
      editableButtonLabels &&
      JSON.stringify(buttonLabelsDraft) !== JSON.stringify(editableButtonLabels),
  );

  const blogPostsDirty = Boolean(
    blogPostsDraft &&
      editableBlogPosts &&
      JSON.stringify(blogPostsDraft) !== JSON.stringify(editableBlogPosts),
  );

  const footerLinksDirty = Boolean(
    footerLinkGroupsDraft &&
      editableFooterLinkGroups &&
      JSON.stringify(footerLinkGroupsDraft) !== JSON.stringify(editableFooterLinkGroups),
  );

  const rawCodeDirty = Boolean(selectedFile && rawCodeDraft !== (selectedFile.content || ""));

  const handleSaveMetadata = useCallback(async () => {
    if (!selectedFile || !metadataDraft) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateStaticMetadataDraft(currentContent, metadataDraft);

    setIsMetadataSaving(true);
    setMetadataSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Metadata sparad i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara metadata";
      setMetadataSaveError(message);
      toast.error(message);
    } finally {
      setIsMetadataSaving(false);
    }
  }, [selectedFile, metadataDraft, saveSelectedFileContent]);

  const handleSaveHeroContent = useCallback(async () => {
    if (!selectedFile || !heroDraft || !editableHeroContent) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateHeroContentDraft(currentContent, editableHeroContent, heroDraft);

    setIsHeroSaving(true);
    setHeroSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Hero-innehåll sparat i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara hero-innehåll";
      setHeroSaveError(message);
      toast.error(message);
    } finally {
      setIsHeroSaving(false);
    }
  }, [selectedFile, heroDraft, editableHeroContent, saveSelectedFileContent]);

  const handleSaveServiceItems = useCallback(async () => {
    if (!selectedFile || !serviceItemsDraft || !editableServiceItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateServiceItemsDraft(currentContent, serviceItemsDraft);

    setIsServicesSaving(true);
    setServicesSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Tjänstepaket sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara tjänstepaket";
      setServicesSaveError(message);
      toast.error(message);
    } finally {
      setIsServicesSaving(false);
    }
  }, [selectedFile, serviceItemsDraft, editableServiceItems, saveSelectedFileContent]);

  const handleSaveContactDetails = useCallback(async () => {
    if (!selectedFile || !contactDraft || !editableContactDetails) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateContactDetailsDraft(currentContent, editableContactDetails, contactDraft);

    setIsContactSaving(true);
    setContactSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Kontaktuppgifter sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara kontaktuppgifter";
      setContactSaveError(message);
      toast.error(message);
    } finally {
      setIsContactSaving(false);
    }
  }, [selectedFile, contactDraft, editableContactDetails, saveSelectedFileContent]);

  const handleSaveFaqItems = useCallback(async () => {
    if (!selectedFile || !faqItemsDraft || !editableFaqItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateFaqItemsDraft(currentContent, faqItemsDraft);

    setIsFaqSaving(true);
    setFaqSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("FAQ sparad i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara FAQ";
      setFaqSaveError(message);
      toast.error(message);
    } finally {
      setIsFaqSaving(false);
    }
  }, [selectedFile, faqItemsDraft, editableFaqItems, saveSelectedFileContent]);

  const handleSaveTestimonialItems = useCallback(async () => {
    if (!selectedFile || !testimonialItemsDraft || !editableTestimonialItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateTestimonialItemsDraft(currentContent, testimonialItemsDraft);

    setIsTestimonialsSaving(true);
    setTestimonialsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Omdömen sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara omdömen";
      setTestimonialsSaveError(message);
      toast.error(message);
    } finally {
      setIsTestimonialsSaving(false);
    }
  }, [selectedFile, testimonialItemsDraft, editableTestimonialItems, saveSelectedFileContent]);

  const handleSaveTeamMembers = useCallback(async () => {
    if (!selectedFile || !teamMembersDraft || !editableTeamMembers) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateTeamMembersDraft(currentContent, editableTeamMembers, teamMembersDraft);

    setIsTeamSaving(true);
    setTeamSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Teammedlemmar sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara teammedlemmar";
      setTeamSaveError(message);
      toast.error(message);
    } finally {
      setIsTeamSaving(false);
    }
  }, [selectedFile, teamMembersDraft, editableTeamMembers, saveSelectedFileContent]);

  const handleSaveStatItems = useCallback(async () => {
    if (!selectedFile || !statItemsDraft || !editableStatItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateStatItemsDraft(currentContent, statItemsDraft);

    setIsStatsSaving(true);
    setStatsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Nyckeltal sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara nyckeltal";
      setStatsSaveError(message);
      toast.error(message);
    } finally {
      setIsStatsSaving(false);
    }
  }, [selectedFile, statItemsDraft, editableStatItems, saveSelectedFileContent]);

  const handleSaveProcessSteps = useCallback(async () => {
    if (!selectedFile || !processStepsDraft || !editableProcessSteps) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateProcessStepsDraft(currentContent, processStepsDraft);

    setIsProcessSaving(true);
    setProcessSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Processteg sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara processteg";
      setProcessSaveError(message);
      toast.error(message);
    } finally {
      setIsProcessSaving(false);
    }
  }, [selectedFile, processStepsDraft, editableProcessSteps, saveSelectedFileContent]);

  const handleSaveProductItems = useCallback(async () => {
    if (!selectedFile || !productItemsDraft || !editableProductItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateProductItemsDraft(currentContent, productItemsDraft);

    setIsProductsSaving(true);
    setProductsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Produkter sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara produkter";
      setProductsSaveError(message);
      toast.error(message);
    } finally {
      setIsProductsSaving(false);
    }
  }, [selectedFile, productItemsDraft, editableProductItems, saveSelectedFileContent]);

  const handleSavePricingCards = useCallback(async () => {
    if (!selectedFile || !pricingCardsDraft || !editablePricingCards) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updatePricingCardsDraft(currentContent, pricingCardsDraft);

    setIsPricingSaving(true);
    setPricingSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Prisplaner sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara prisplaner";
      setPricingSaveError(message);
      toast.error(message);
    } finally {
      setIsPricingSaving(false);
    }
  }, [selectedFile, pricingCardsDraft, editablePricingCards, saveSelectedFileContent]);

  const handleSavePricingFeatures = useCallback(async () => {
    if (!selectedFile || !pricingFeatureCardsDraft || !editablePricingFeatureCards) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updatePricingFeatureCardsDraft(
      currentContent,
      pricingFeatureCardsDraft,
    );

    setIsPricingFeaturesSaving(true);
    setPricingFeaturesSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Pricing-features sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara pricing-features";
      setPricingFeaturesSaveError(message);
      toast.error(message);
    } finally {
      setIsPricingFeaturesSaving(false);
    }
  }, [
    selectedFile,
    pricingFeatureCardsDraft,
    editablePricingFeatureCards,
    saveSelectedFileContent,
  ]);

  const handleSaveCategoryItems = useCallback(async () => {
    if (!selectedFile || !categoryItemsDraft || !editableCategoryItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateCategoryItemsDraft(currentContent, categoryItemsDraft);

    setIsCategorySaving(true);
    setCategorySaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Kategorier sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara kategorier";
      setCategorySaveError(message);
      toast.error(message);
    } finally {
      setIsCategorySaving(false);
    }
  }, [selectedFile, categoryItemsDraft, editableCategoryItems, saveSelectedFileContent]);

  const handleSaveNavItems = useCallback(async () => {
    if (!selectedFile || !navItemsDraft || !editableNavItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateNavItemsDraft(currentContent, navItemsDraft);

    setIsNavSaving(true);
    setNavSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Navigation sparad i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara navigation";
      setNavSaveError(message);
      toast.error(message);
    } finally {
      setIsNavSaving(false);
    }
  }, [selectedFile, navItemsDraft, editableNavItems, saveSelectedFileContent]);

  const handleSaveButtonLabels = useCallback(async () => {
    if (!selectedFile || !buttonLabelsDraft || !editableButtonLabels) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateButtonLabelsDraft(currentContent, buttonLabelsDraft);

    setIsButtonLabelsSaving(true);
    setButtonLabelsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("CTA-knappar sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara CTA-knappar";
      setButtonLabelsSaveError(message);
      toast.error(message);
    } finally {
      setIsButtonLabelsSaving(false);
    }
  }, [selectedFile, buttonLabelsDraft, editableButtonLabels, saveSelectedFileContent]);

  const handleSaveBlogPosts = useCallback(async () => {
    if (!selectedFile || !blogPostsDraft || !editableBlogPosts) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateBlogPostsDraft(currentContent, blogPostsDraft);

    setIsBlogPostsSaving(true);
    setBlogPostsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Blogginlägg sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara blogginlägg";
      setBlogPostsSaveError(message);
      toast.error(message);
    } finally {
      setIsBlogPostsSaving(false);
    }
  }, [selectedFile, blogPostsDraft, editableBlogPosts, saveSelectedFileContent]);

  const handleSaveFooterLinks = useCallback(async () => {
    if (!selectedFile || !footerLinkGroupsDraft || !editableFooterLinkGroups) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateFooterLinkGroupsDraft(currentContent, footerLinkGroupsDraft);

    setIsFooterLinksSaving(true);
    setFooterLinksSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Footerlänkar sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara footerlänkar";
      setFooterLinksSaveError(message);
      toast.error(message);
    } finally {
      setIsFooterLinksSaving(false);
    }
  }, [
    selectedFile,
    footerLinkGroupsDraft,
    editableFooterLinkGroups,
    saveSelectedFileContent,
  ]);

  const handleSaveRawCode = useCallback(async () => {
    if (!selectedFile) return;
    setIsRawCodeSaving(true);
    setRawCodeSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(rawCodeDraft);
      if (didSave) {
        setRawEditMode(false);
        toast.success("Filändringar sparade i aktiv version.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara filändringar";
      setRawCodeSaveError(message);
      toast.error(message);
    } finally {
      setIsRawCodeSaving(false);
    }
  }, [selectedFile, rawCodeDraft, saveSelectedFileContent, setRawEditMode]);

  return {
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
    rawEditMode,
    setRawEditMode,
    rawCodeDraft,
    setRawCodeDraft,
    rawCodeSaveError,
    setRawCodeSaveError,
    isRawCodeSaving,
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
    rawCodeDirty,
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
    handleSaveRawCode,
  };
}

export type PreviewPanelCodeDraftsBundle = ReturnType<typeof usePreviewPanelCodeDrafts>;
