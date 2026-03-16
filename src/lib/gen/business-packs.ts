export type BusinessWorkflowPack = {
  id: "lead-capture" | "newsletter" | "booking" | "quote-request" | "crm-sync";
  label: string;
  description: string;
  suggestedPrompt: string;
  envVars: string[];
  recommendedIntegrations: string[];
  verificationChecklist: string[];
  reasons: string[];
};

function hasFormSurface(source: string): boolean {
  return /<form\b|onsubmit=|type=["']submit["']/i.test(source);
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
    /\b(contact|kontakt|lead|demo request|get started|book demo|talk to sales|reach out)\b/i.test(normalized)
  ) {
    pushPack({
      id: "lead-capture",
      label: "Lead form + email routing",
      description: "Sajten verkar ha ett kontakt- eller leadformulär som bör skicka e-post eller skapa ett leadflöde.",
      suggestedPrompt:
        "Gör leadformuläret produktionsredo med e-postrouting eller CRM-koppling, tydlig success/error-feedback och utan att ändra designen i övrigt.",
      envVars: ["RESEND_API_KEY"],
      recommendedIntegrations: ["Resend"],
      verificationChecklist: [
        "Formuläret går att skicka från preview eller sandbox.",
        "E-postrouting eller leadhantering är konfigurerad.",
        "Användaren får tydlig success/error-feedback.",
      ],
      reasons: ["Form surface", "Contact/lead CTA detected"],
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
    });
  }

  if (/\b(booking|appointment|reserve|reservation|boka|bokning|cal\.com|calendly)\b/i.test(normalized)) {
    pushPack({
      id: "booking",
      label: "Booking / calendar",
      description: "Sajten verkar behöva bokning eller kalendertider som ett affärsflöde.",
      suggestedPrompt:
        "Koppla boknings-CTA:n till ett riktigt bokningsflöde med Cal.com eller Calendly och behåll resten av sidan som den är.",
      envVars: [],
      recommendedIntegrations: ["Cal.com or Calendly"],
      verificationChecklist: [
        "Boknings-CTA leder till ett fungerande bokningsflöde.",
        "Tidszon och tillgänglighet är korrekt konfigurerade.",
        "Bekräftelseflöde för bokning är tydligt för användaren.",
      ],
      reasons: ["Booking / calendar keywords detected"],
    });
  }

  if (
    hasFormSurface(normalized) &&
    /\b(quote|offert|estimate|pricing request|request quote)\b/i.test(normalized)
  ) {
    pushPack({
      id: "quote-request",
      label: "Quote request pipeline",
      description: "Sajten verkar ha ett offert- eller förfrågningsflöde som bör fånga strukturerad kunddata.",
      suggestedPrompt:
        "Gör offertformuläret redo för riktiga kundförfrågningar med e-post- eller CRM-routing och tydlig bekräftelse utan redesign.",
      envVars: ["RESEND_API_KEY"],
      recommendedIntegrations: ["Resend", "CRM provider of choice"],
      verificationChecklist: [
        "Förfrågan fångar rätt uppgifter för säljteamet.",
        "E-post eller CRM-routing är konfigurerad.",
        "Bekräftelsemeddelande visas efter skickad förfrågan.",
      ],
      reasons: ["Quote / estimate keywords detected"],
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
    });
  }

  return packs;
}
