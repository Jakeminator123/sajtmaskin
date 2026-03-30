"use client";

import {
  readContactDetailsDraft,
  updateContactDetailsDraft,
  type ContactDetailsDraft,
} from "@/lib/builder/contact-editor";
import {
  readHeroContentDraft,
  updateHeroContentDraft,
  type HeroContentDraft,
} from "@/lib/builder/hero-editor";
import {
  readServiceItemsDraft,
  updateServiceItemsDraft,
  type ServiceItemDraft,
} from "@/lib/builder/services-editor";
import {
  readFaqItemsDraft,
  updateFaqItemsDraft,
  type FaqItemDraft,
} from "@/lib/builder/faq-editor";
import {
  readTestimonialItemsDraft,
  updateTestimonialItemsDraft,
  type TestimonialItemDraft,
} from "@/lib/builder/testimonials-editor";
import {
  readTeamMembers,
  updateTeamMembersDraft,
  type TeamMemberDraft,
} from "@/lib/builder/team-editor";
import {
  readStatItemsDraft,
  updateStatItemsDraft,
  type StatItemDraft,
} from "@/lib/builder/stats-editor";
import {
  readProcessStepsDraft,
  updateProcessStepsDraft,
  type ProcessStepDraft,
} from "@/lib/builder/process-editor";
import {
  readProductItemsDraft,
  updateProductItemsDraft,
  type ProductItemDraft,
} from "@/lib/builder/product-editor";
import {
  readPricingCardsDraft,
  updatePricingCardsDraft,
  type PricingCardDraft,
} from "@/lib/builder/pricing-editor";
import {
  readPricingFeatureCardsDraft,
  updatePricingFeatureCardsDraft,
  type PricingFeatureCardDraft,
} from "@/lib/builder/pricing-features-editor";
import {
  readCategoryItemsDraft,
  updateCategoryItemsDraft,
  type CategoryItemDraft,
} from "@/lib/builder/category-editor";
import {
  readNavItemsDraft,
  updateNavItemsDraft,
  type NavItemDraft,
} from "@/lib/builder/nav-items-editor";
import {
  readButtonLabelsDraft,
  updateButtonLabelsDraft,
  type ButtonLabelDraft,
} from "@/lib/builder/button-label-editor";
import {
  readBlogPostsDraft,
  updateBlogPostsDraft,
  type BlogPostDraft,
} from "@/lib/builder/blog-posts-editor";
import {
  readFooterLinkGroupsDraft,
  updateFooterLinkGroupsDraft,
  type FooterLinkGroupDraft,
} from "@/lib/builder/footer-links-editor";
import {
  readStaticMetadataDraft,
  updateStaticMetadataDraft,
  type StaticMetadataDraft,
} from "@/lib/builder/metadata-editor";
import type { FileNode } from "@/lib/builder/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export function usePreviewPanelCodeDrafts(options: {
  selectedFile: FileNode | null;
  saveSelectedFileContent: (nextContent: string) => Promise<boolean>;
}) {
  const { selectedFile, saveSelectedFileContent } = options;

  const [metadataDraft, setMetadataDraft] = useState<StaticMetadataDraft | null>(null);
  const [metadataSaveError, setMetadataSaveError] = useState<string | null>(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [heroDraft, setHeroDraft] = useState<HeroContentDraft | null>(null);
  const [heroSaveError, setHeroSaveError] = useState<string | null>(null);
  const [isHeroSaving, setIsHeroSaving] = useState(false);
  const [serviceItemsDraft, setServiceItemsDraft] = useState<ServiceItemDraft[] | null>(null);
  const [servicesSaveError, setServicesSaveError] = useState<string | null>(null);
  const [isServicesSaving, setIsServicesSaving] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDetailsDraft | null>(null);
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [isContactSaving, setIsContactSaving] = useState(false);
  const [faqItemsDraft, setFaqItemsDraft] = useState<FaqItemDraft[] | null>(null);
  const [faqSaveError, setFaqSaveError] = useState<string | null>(null);
  const [isFaqSaving, setIsFaqSaving] = useState(false);
  const [testimonialItemsDraft, setTestimonialItemsDraft] = useState<TestimonialItemDraft[] | null>(
    null,
  );
  const [testimonialsSaveError, setTestimonialsSaveError] = useState<string | null>(null);
  const [isTestimonialsSaving, setIsTestimonialsSaving] = useState(false);
  const [teamMembersDraft, setTeamMembersDraft] = useState<TeamMemberDraft[] | null>(null);
  const [teamSaveError, setTeamSaveError] = useState<string | null>(null);
  const [isTeamSaving, setIsTeamSaving] = useState(false);
  const [statItemsDraft, setStatItemsDraft] = useState<StatItemDraft[] | null>(null);
  const [statsSaveError, setStatsSaveError] = useState<string | null>(null);
  const [isStatsSaving, setIsStatsSaving] = useState(false);
  const [processStepsDraft, setProcessStepsDraft] = useState<ProcessStepDraft[] | null>(null);
  const [processSaveError, setProcessSaveError] = useState<string | null>(null);
  const [isProcessSaving, setIsProcessSaving] = useState(false);
  const [productItemsDraft, setProductItemsDraft] = useState<ProductItemDraft[] | null>(null);
  const [productsSaveError, setProductsSaveError] = useState<string | null>(null);
  const [isProductsSaving, setIsProductsSaving] = useState(false);
  const [pricingCardsDraft, setPricingCardsDraft] = useState<PricingCardDraft[] | null>(null);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);
  const [isPricingSaving, setIsPricingSaving] = useState(false);
  const [pricingFeatureCardsDraft, setPricingFeatureCardsDraft] =
    useState<PricingFeatureCardDraft[] | null>(null);
  const [pricingFeaturesSaveError, setPricingFeaturesSaveError] = useState<string | null>(null);
  const [isPricingFeaturesSaving, setIsPricingFeaturesSaving] = useState(false);
  const [categoryItemsDraft, setCategoryItemsDraft] = useState<CategoryItemDraft[] | null>(null);
  const [categorySaveError, setCategorySaveError] = useState<string | null>(null);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [navItemsDraft, setNavItemsDraft] = useState<NavItemDraft[] | null>(null);
  const [navSaveError, setNavSaveError] = useState<string | null>(null);
  const [isNavSaving, setIsNavSaving] = useState(false);
  const [buttonLabelsDraft, setButtonLabelsDraft] = useState<ButtonLabelDraft[] | null>(null);
  const [buttonLabelsSaveError, setButtonLabelsSaveError] = useState<string | null>(null);
  const [isButtonLabelsSaving, setIsButtonLabelsSaving] = useState(false);
  const [blogPostsDraft, setBlogPostsDraft] = useState<BlogPostDraft[] | null>(null);
  const [blogPostsSaveError, setBlogPostsSaveError] = useState<string | null>(null);
  const [isBlogPostsSaving, setIsBlogPostsSaving] = useState(false);
  const [footerLinkGroupsDraft, setFooterLinkGroupsDraft] =
    useState<FooterLinkGroupDraft[] | null>(null);
  const [footerLinksSaveError, setFooterLinksSaveError] = useState<string | null>(null);
  const [isFooterLinksSaving, setIsFooterLinksSaving] = useState(false);
  const [rawEditMode, setRawEditMode] = useState(false);
  const [rawCodeDraft, setRawCodeDraft] = useState("");
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

  useEffect(() => {
    setMetadataDraft(editableMetadata ? { ...editableMetadata } : null);
    setMetadataSaveError(null);
  }, [editableMetadata, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setHeroDraft(editableHeroContent ? { ...editableHeroContent } : null);
    setHeroSaveError(null);
  }, [editableHeroContent, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setServiceItemsDraft(
      editableServiceItems ? editableServiceItems.map((item) => ({ ...item })) : null,
    );
    setServicesSaveError(null);
  }, [editableServiceItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setContactDraft(editableContactDetails ? { ...editableContactDetails } : null);
    setContactSaveError(null);
  }, [editableContactDetails, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setFaqItemsDraft(
      editableFaqItems ? editableFaqItems.map((item) => ({ ...item })) : null,
    );
    setFaqSaveError(null);
  }, [editableFaqItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setTestimonialItemsDraft(
      editableTestimonialItems
        ? editableTestimonialItems.map((item) => ({ ...item }))
        : null,
    );
    setTestimonialsSaveError(null);
  }, [editableTestimonialItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setTeamMembersDraft(
      editableTeamMembers ? editableTeamMembers.map((item) => ({ ...item })) : null,
    );
    setTeamSaveError(null);
  }, [editableTeamMembers, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setStatItemsDraft(editableStatItems ? editableStatItems.map((item) => ({ ...item })) : null);
    setStatsSaveError(null);
  }, [editableStatItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setProcessStepsDraft(
      editableProcessSteps ? editableProcessSteps.map((item) => ({ ...item })) : null,
    );
    setProcessSaveError(null);
  }, [editableProcessSteps, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setProductItemsDraft(
      editableProductItems ? editableProductItems.map((item) => ({ ...item })) : null,
    );
    setProductsSaveError(null);
  }, [editableProductItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setPricingCardsDraft(
      editablePricingCards ? editablePricingCards.map((item) => ({ ...item })) : null,
    );
    setPricingSaveError(null);
  }, [editablePricingCards, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setPricingFeatureCardsDraft(
      editablePricingFeatureCards
        ? editablePricingFeatureCards.map((item) => ({
            ...item,
            features: [...item.features],
          }))
        : null,
    );
    setPricingFeaturesSaveError(null);
  }, [editablePricingFeatureCards, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setCategoryItemsDraft(
      editableCategoryItems ? editableCategoryItems.map((item) => ({ ...item })) : null,
    );
    setCategorySaveError(null);
  }, [editableCategoryItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setNavItemsDraft(editableNavItems ? editableNavItems.map((item) => ({ ...item })) : null);
    setNavSaveError(null);
  }, [editableNavItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setButtonLabelsDraft(
      editableButtonLabels ? editableButtonLabels.map((item) => ({ ...item })) : null,
    );
    setButtonLabelsSaveError(null);
  }, [editableButtonLabels, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setBlogPostsDraft(editableBlogPosts ? editableBlogPosts.map((item) => ({ ...item })) : null);
    setBlogPostsSaveError(null);
  }, [editableBlogPosts, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setFooterLinkGroupsDraft(
      editableFooterLinkGroups
        ? editableFooterLinkGroups.map((group) => ({
            ...group,
            items: [...group.items],
          }))
        : null,
    );
    setFooterLinksSaveError(null);
  }, [editableFooterLinkGroups, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setRawEditMode(false);
    setRawCodeDraft(selectedFile?.content || "");
    setRawCodeSaveError(null);
  }, [selectedFile?.path, selectedFile?.content]);

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
  }, [selectedFile, rawCodeDraft, saveSelectedFileContent]);

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
