export type BusinessWorkflowPack = {
  id: "lead-capture" | "newsletter" | "booking" | "quote-request" | "crm-sync";
  label: string;
  description: string;
  suggestedPrompt: string;
  envVars: string[];
  recommendedIntegrations: string[];
  verificationChecklist: string[];
  reasons: string[];
  /** Weak = heuristik utan tydlig server-side- eller provider-signal; visas under «Fler förslag». */
  signalStrength?: "strong" | "weak";
};

function hasFormSurface(source: string): boolean {
  return /<form\b|onsubmit=|type=["']submit["']/i.test(source);
}

/** True when kod eller manifest konsekvent tyder på server-side e-post (inte bara ett formulär). */
function hasServerSideEmailSignal(source: string): boolean {
  if (/\bsajtmaskin\.integration-manifest\.json\b/i.test(source) && /\bresend\b/i.test(source)) {
    return true;
  }
  if (/\bRESEND_API_KEY\b/.test(source)) return true;
  if (
    /\bresend\b/i.test(source) &&
    /(@react-email|react-email|\.send\(|sendEmail|createTransport|nodemailer|smtp\.)/i.test(source)
  ) {
    return true;
  }
  if (
    /\/api\/[^\s"']+\/route\.(tsx?|jsx?)/i.test(source) &&
    /POST|mail|email|resend|nodemailer|smtp/i.test(source)
  ) {
    return true;
  }
  if (/\b"use server"\b/i.test(source) && /mail|email|resend|send/i.test(source)) return true;
  return false;
}

function hasBookingProviderSignal(source: string): boolean {
  return /cal\.com|calendly\.com|app\.cal\.com|cal\.com\/embed|calendly\.com\/embed|meetings\.hubspot/i.test(
    source,
  );
}

function detectCrmProvider(source: string): {
  label: string;
  envVars: string[];
} | null {
  if (/\bhubspot\b/i.test(source)) {
    return {
      label: "HubSpot",
      envVars: ["HUBSPOT_ACCESS_TOKEN"],
    };
  }
  if (/\bsalesforce\b/i.test(source)) {
    return {
      label: "Salesforce",
      envVars: ["SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET", "SALESFORCE_INSTANCE_URL"],
    };
  }
  if (/\bpipedrive\b/i.test(source)) {
    return {
      label: "Pipedrive",
      envVars: ["PIPEDRIVE_API_TOKEN"],
    };
  }
  return null;
}

export function detectBusinessWorkflowPacks(source: string): BusinessWorkflowPack[] {
  const normalized = source.toLowerCase();
  const packs: BusinessWorkflowPack[] = [];

  const pushPack = (pack: BusinessWorkflowPack) => {
    if (!packs.some((existing) => existing.id === pack.id)) {
      packs.push(pack);
    }
  };

  if (
    hasFormSurface(normalized) &&
    /\b(contact|kontakt|lead|demo request|get started|book demo|talk to sales|reach out)\b/i.test(
      normalized,
    )
  ) {
    const strong = hasServerSideEmailSignal(source);
    pushPack({
      id: "lead-capture",
      label: "Lead form + email routing",
      description: strong
        ? "Sajten verkar ha ett kontakt- eller leadformulär med server-side e-post eller motsvarande."
        : "Sajten verkar ha ett kontakt- eller leadformulär. Utan tydlig server-side e-post i koden räknas detta som ett svagare affärsspår — lägg till routing först om du behöver riktiga utskick.",
      suggestedPrompt:
        "Gör leadformuläret produktionsredo med e-postrouting eller CRM-koppling, tydlig success/error-feedback och utan att ändra designen i övrigt.",
      envVars: strong ? ["RESEND_API_KEY"] : [],
      recommendedIntegrations: strong ? ["Resend"] : ["Resend eller annan e-postprovider (vid server-side)"],
      verificationChecklist: [
        "Formuläret går att skicka från preview eller sandbox.",
        "E-postrouting eller leadhantering är konfigurerad.",
        "Användaren får tydlig success/error-feedback.",
      ],
      reasons: strong
        ? ["Form surface", "Contact/lead CTA", "Server-side email signal"]
        : ["Form surface", "Contact/lead CTA (svag signal)"],
      signalStrength: strong ? "strong" : "weak",
    });
  }

  if (
    hasFormSurface(normalized) &&
    /\b(newsletter|subscribe|prenumerera|waitlist|mailing list)\b/i.test(normalized)
  ) {
    pushPack({
      id: "newsletter",
      label: "Newsletter signup",
      description: "Sajten verkar samla in e-postadresser för nyhetsbrev eller waitlist.",
      suggestedPrompt:
        "Gör nyhetsbrevsformuläret redo för riktig signup med provider, bekräftelsesteg och tydlig success/error-feedback utan att ändra layouten.",
      envVars: [],
      recommendedIntegrations: ["Resend or email provider of choice"],
      verificationChecklist: [
        "Signup-flödet sparar eller vidarebefordrar e-postadressen.",
        "Double opt-in eller motsvarande strategi är vald vid behov.",
        "Success state och felhantering syns i formuläret.",
      ],
      reasons: ["Newsletter / subscribe keywords detected"],
      signalStrength: "strong",
    });
  }

  if (/\b(booking|appointment|reserve|reservation|boka|bokning|cal\.com|calendly)\b/i.test(normalized)) {
    const strong = hasBookingProviderSignal(source);
    pushPack({
      id: "booking",
      label: "Booking / calendar",
      description: strong
        ? "Sajten verkar koppla till ett boknings- eller kalenderflöde (t.ex. Cal.com/Calendly)."
        : "Nyckelord för bokning hittades utan tydlig inbäddad provider — verifiera eller lägg till t.ex. Cal.com/Calendly.",
      suggestedPrompt:
        "Koppla boknings-CTA:n till ett riktigt bokningsflöde med Cal.com eller Calendly och behåll resten av sidan som den är.",
      envVars: [],
      recommendedIntegrations: ["Cal.com or Calendly"],
      verificationChecklist: [
        "Boknings-CTA leder till ett fungerande bokningsflöde.",
        "Tidszon och tillgänglighet är korrekt konfigurerade.",
        "Bekräftelseflöde för bokning är tydligt för användaren.",
      ],
      reasons: strong
        ? ["Booking provider/embed detected"]
        : ["Booking keywords without clear provider embed"],
      signalStrength: strong ? "strong" : "weak",
    });
  }

  if (
    hasFormSurface(normalized) &&
    /\b(quote|offert|estimate|pricing request|request quote)\b/i.test(normalized)
  ) {
    const strong = hasServerSideEmailSignal(source);
    pushPack({
      id: "quote-request",
      label: "Quote request pipeline",
      description: strong
        ? "Sajten verkar ha ett offert- eller förfrågningsflöde med server-side hantering."
        : "Offert-/förfrågningsformulär hittades; utan tydlig server-side e-post är signalen svagare.",
      suggestedPrompt:
        "Gör offertformuläret redo för riktiga kundförfrågningar med e-post- eller CRM-routing och tydlig bekräftelse utan redesign.",
      envVars: strong ? ["RESEND_API_KEY"] : [],
      recommendedIntegrations: strong
        ? ["Resend", "CRM provider of choice"]
        : ["Resend eller CRM (vid server-side routing)"],
      verificationChecklist: [
        "Förfrågan fångar rätt uppgifter för säljteamet.",
        "E-post eller CRM-routing är konfigurerad.",
        "Bekräftelsemeddelande visas efter skickad förfrågan.",
      ],
      reasons: strong
        ? ["Quote / estimate + server-side signal"]
        : ["Quote / estimate form (svag signal)"],
      signalStrength: strong ? "strong" : "weak",
    });
  }

  const crmProvider = detectCrmProvider(normalized);
  if (crmProvider || /\bcrm\b/i.test(normalized)) {
    pushPack({
      id: "crm-sync",
      label: "CRM sync",
      description: "Sajten verkar vilja skicka leads eller formulärdata vidare till ett CRM-system.",
      suggestedPrompt:
        "Koppla formulär- eller leadflödet till CRM, mappa rätt fält och lägg till tydlig felhantering utan att ändra resten av designen.",
      envVars: crmProvider?.envVars ?? [],
      recommendedIntegrations: [crmProvider?.label ?? "CRM provider of choice"],
      verificationChecklist: [
        "Lead-data mappas till rätt CRM-fält.",
        "Fel vid sync loggas eller visas tydligt.",
        "Dubbletter eller partial failures hanteras medvetet.",
      ],
      reasons: [crmProvider ? `${crmProvider.label} detected` : "CRM keyword detected"],
      signalStrength: "strong",
    });
  }

  return packs;
}
