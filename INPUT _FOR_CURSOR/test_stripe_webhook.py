#!/usr/bin/env python3
"""
Stripe Webhook Test Script
==========================
Detta skript hjälper dig att testa Stripe webhook integrationen för SajtMaskin.

Vad gör detta skript?
1. Simulerar en Stripe checkout.session.completed event
2. Skickar webhook till din lokala server
3. Visar vad som händer i varje steg
4. Verifierar att diamanter läggs till korrekt

FÖRE KÖRNING:
- Se till att din Next.js app körs (npm run dev)
- Se till att stripe listen körs i ett separat terminalfönster
- Ha STRIPE_SECRET_KEY och STRIPE_WEBHOOK_SECRET i din .env.local
"""

import requests
import json
import hmac
import hashlib
import time
from datetime import datetime

# Konfiguration
WEBHOOK_URL = "http://localhost:3000/api/stripe/webhook"
STRIPE_WEBHOOK_SECRET = "whsec_8cdc50d6d1529cd517bd6b09177f06b37ad8ab13a3ab61877a62a34f4589c23f"  # Uppdatera detta från din .env.local


def create_stripe_signature(payload: str, secret: str, timestamp: int) -> str:
    """
    Skapar en Stripe webhook signatur för att verifiera att webhooken kommer från Stripe.
    Detta är samma logik som Stripe använder för att signera webhooks.
    """
    signed_payload = f"{timestamp}.{payload}"
    signature = hmac.new(
        secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


def create_test_checkout_session_event(
    user_id: str = "test-user-123", package_id: str = "10_diamonds", diamonds: int = 10
):
    """
    Skapar en simulerad checkout.session.completed event från Stripe.
    Detta är exakt samma struktur som Stripe skickar när en betalning är klar.
    """
    timestamp = int(time.time())

    # Stripe event struktur
    event = {
        "id": f"evt_test_{int(time.time())}",
        "object": "event",
        "api_version": "2023-10-16",
        "created": timestamp,
        "data": {
            "object": {
                "id": f"cs_test_{int(time.time())}",
                "object": "checkout.session",
                "amount_subtotal": 4900,  # 49 SEK i öre
                "amount_total": 4900,
                "currency": "sek",
                "customer_email": "test@example.com",
                "mode": "payment",
                "payment_intent": f"pi_test_{int(time.time())}",
                "payment_status": "paid",
                "status": "complete",
                "metadata": {
                    "userId": user_id,
                    "packageId": package_id,
                    "diamonds": str(diamonds),
                },
            }
        },
        "livemode": False,
        "pending_webhooks": 1,
        "request": {"id": f"req_test_{int(time.time())}", "idempotency_key": None},
        "type": "checkout.session.completed",
    }

    return event, timestamp


def test_webhook():
    """
    Huvudfunktion som testar webhooken.
    """
    print("=" * 70)
    print("STRIPE WEBHOOK TEST - SajtMaskin")
    print("=" * 70)
    print()

    # Steg 1: Skapa test event
    print("📦 Steg 1: Skapar simulerad Stripe event...")
    event, timestamp = create_test_checkout_session_event(
        user_id="test-user-123", package_id="10_diamonds", diamonds=10
    )
    print(f"   ✓ Event skapat: {event['id']}")
    print(f"   ✓ Event typ: {event['type']}")
    print(f"   ✓ Diamanter: {event['data']['object']['metadata']['diamonds']}")
    print()

    # Steg 2: Konvertera till JSON och skapa signatur
    print("🔐 Steg 2: Signerar webhook...")
    payload = json.dumps(event)

    # Extrahera webhook secret (ta bort 'whsec_' prefix)
    if STRIPE_WEBHOOK_SECRET.startswith("whsec_"):
        secret = STRIPE_WEBHOOK_SECRET[6:]  # Ta bort 'whsec_' prefix
    else:
        secret = STRIPE_WEBHOOK_SECRET

    signature = create_stripe_signature(payload, secret, timestamp)
    print(f"   ✓ Signatur skapad")
    print()

    # Steg 3: Skicka webhook
    print("📤 Steg 3: Skickar webhook till din server...")
    print(f"   URL: {WEBHOOK_URL}")
    print()

    headers = {"Content-Type": "application/json", "Stripe-Signature": signature}

    try:
        response = requests.post(WEBHOOK_URL, data=payload, headers=headers, timeout=10)

        # Steg 4: Visa resultat
        print("📥 Steg 4: Server svarar...")
        print(f"   Status kod: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
        print()

        if response.status_code == 200:
            print("✅ FRAMGÅNG! Webhook accepterad av servern.")
            print()
            print("Vad hände:")
            print("   1. Webhook skickades till /api/stripe/webhook")
            print("   2. Servern verifierade Stripe-signaturen")
            print("   3. Servern kontrollerade att eventet inte redan processats")
            print("   4. Servern lade till diamanter i databasen")
            print("   5. Servern skapade en transaction record")
            print()
            print("⚠️  OBS: Detta är en simulerad webhook.")
            print("   För att testa med riktig Stripe data, använd:")
            print("   stripe trigger checkout.session.completed")
        else:
            print("❌ FEL! Webhook avvisad av servern.")
            print()
            print("Möjliga orsaker:")
            print("   - Stripe webhook secret är felaktig")
            print("   - Servern är inte igång (npm run dev)")
            print("   - User ID finns inte i databasen")
            print("   - Webhook endpoint är felaktig")

    except requests.exceptions.ConnectionError:
        print("❌ FEL! Kunde inte ansluta till servern.")
        print()
        print("Kontrollera att:")
        print("   - Next.js appen körs (npm run dev)")
        print("   - URL är korrekt: http://localhost:3000")
    except Exception as e:
        print(f"❌ FEL! {str(e)}")

    print()
    print("=" * 70)


def main():
    """
    Huvudfunktion med instruktioner.
    """
    print()
    print("INSTRUKTIONER:")
    print("-" * 70)
    print("1. Se till att din Next.js app körs: npm run dev")
    print("2. Se till att stripe listen körs i ett annat terminalfönster:")
    print("   stripe listen --forward-to localhost:3000/api/stripe/webhook")
    print("3. Uppdatera STRIPE_WEBHOOK_SECRET i detta skript om den skiljer sig")
    print("4. Kör detta skript: python test_stripe_webhook.py")
    print()
    print("ALTERNATIV METOD (Rekommenderad):")
    print("-" * 70)
    print("Använd Stripe CLI istället för detta skript:")
    print("   stripe trigger checkout.session.completed")
    print()
    print("Detta är enklare och använder riktig Stripe data.")
    print()

    input("Tryck Enter för att fortsätta med testet...")
    print()

    test_webhook()

    print()
    print("💡 TIPS:")
    print(
        "   - För riktig testning, använd Stripe CLI: stripe trigger checkout.session.completed"
    )
    print("   - Eller gör en faktisk test-betalning på /buy-credits")
    print("   - Kontrollera databasen för att se att diamanter lades till")
    print()


if __name__ == "__main__":
    main()
