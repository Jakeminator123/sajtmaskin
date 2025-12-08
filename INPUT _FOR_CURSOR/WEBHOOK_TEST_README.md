# Stripe Webhook Test Guide

## 🎯 Vad gör webhooken?

När en användare betalar för diamanter:

1. Stripe behandlar betalningen
2. Stripe skickar en webhook till din server (`/api/stripe/webhook`)
3. Din server verifierar att webhooken kommer från Stripe
4. Din server lägger till diamanter i databasen
5. Användaren får sina diamanter automatiskt

## 🧪 Hur testar man webhooken?

### Metod 1: Stripe CLI (Rekommenderad - Enklast)

```powershell
# I ett terminalfönster, kör:
stripe listen --forward-to localhost:3000/api/stripe/webhook

# I ett annat terminalfönster, kör:
stripe trigger checkout.session.completed
```

Detta simulerar en riktig Stripe webhook med korrekt signering.

### Metod 2: Python-skriptet

```powershell
# 1. Installera requests om du inte har det:
pip install requests

# 2. Uppdatera STRIPE_WEBHOOK_SECRET i test_stripe_webhook.py
#    (kopiera från din .env.local)

# 3. Kör skriptet:
python test_stripe_webhook.py
```

### Metod 3: Faktisk test-betalning

1. Gå till `http://localhost:3000/buy-credits`
2. Välj ett paket
3. Använd test-kort: `4242 4242 4242 4242`
4. Efter betalning ska diamanterna läggas till automatiskt

## 📋 Checklista innan test

- [ ] Next.js appen körs (`npm run dev`)
- [ ] `stripe listen` körs i bakgrunden
- [ ] `STRIPE_WEBHOOK_SECRET` är korrekt i `.env.local`
- [ ] Du är inloggad som en användare i appen

## 🔍 Vad ska hända när webhooken fungerar?

### I Stripe CLI terminalen:

```
2024-XX-XX XX:XX:XX  --> checkout.session.completed [evt_xxx]
2024-XX-XX XX:XX:XX  <-- [200] POST http://localhost:3000/api/stripe/webhook
```

### I Next.js terminalen:

```
[Stripe/webhook] Received event: checkout.session.completed
[Stripe/webhook] Added 10 diamonds to user test-user-123 - new balance: 15
```

### I appen:

- Användaren ser uppdaterat diamantsaldo
- Success-meddelande visas på `/buy-credits` sidan

## ❌ Felsökning

### "Webhook not configured"

- Kontrollera att `STRIPE_WEBHOOK_SECRET` finns i `.env.local`
- Starta om Next.js efter att ha lagt till webhook secret

### "Invalid signature"

- Kontrollera att `stripe listen` körs
- Kontrollera att webhook secret är korrekt
- Se till att använda samma webhook secret som `stripe listen` visar

### "User not found"

- Webhooken försöker lägga till diamanter till ett user ID som inte finns
- Testa med en faktisk betalning istället (användaren skapas automatiskt)

### Inga diamanter läggs till

- Kontrollera databasen direkt
- Kolla Next.js terminalen för felmeddelanden
- Se till att `stripe listen` faktiskt skickar webhooks

## 💡 Tips

- **Bästa sättet att testa:** Använd `stripe trigger checkout.session.completed`
- **För produktion:** Skapa webhook endpoint i Stripe Dashboard med din produktion-URL
- **Debugging:** Kolla både Stripe CLI och Next.js terminaler för att se vad som händer
