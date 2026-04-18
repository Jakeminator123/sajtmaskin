import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type WelcomeTemplateProps = {
  userFirstname?: string;
};

export default function WelcomeTemplate({ userFirstname }: WelcomeTemplateProps) {
  const name = userFirstname?.trim() || "there";

  return (
    <Html>
      <Head />
      <Preview>You’re on the waitlist</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f9fc", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", backgroundColor: "#ffffff", padding: "32px" }}>
          <Section>
            <Heading as="h1" style={{ fontSize: "24px", marginBottom: "16px" }}>
              Welcome, {name}
            </Heading>
            <Text style={{ fontSize: "16px", lineHeight: "24px", color: "#333" }}>
              Thanks for joining the waitlist. We’ve received your signup and will let you know when there’s news to share.
            </Text>
            <Text style={{ fontSize: "16px", lineHeight: "24px", color: "#333" }}>
              If you support referrals, you can send each user their personal referral link in a follow-up email or on the confirmation screen.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
