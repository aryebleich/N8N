# Sample FAQ (source of truth for `turso/seed-faq.sql`)

This file is the human-readable version of the knowledge base. Each entry
maps to one row in the Turso `faq` table. When you change an answer here,
change the same row in `turso/seed-faq.sql` (or run an `UPDATE` against
Turso directly). The workflow reads only from Turso.

The answers are written for a fictional online store, **Northwind Goods**.
Replace them with your own policies before going live.

| # | Tags |
|---|------|
| 1 | shipping, delivery, how long, arrive, days |
| 2 | international, shipping, countries, customs, duties |
| 3 | tracking, track, where, order, package, shipped |
| 4 | return, returns, refund, send back, policy |
| 5 | refund, money back, how long, credit |
| 6 | cancel, cancellation, change order |
| 7 | address, change address, shipping address, wrong address |
| 8 | password, reset, login, sign in, account |
| 9 | payment, pay, methods, card, paypal, invoice |
| 10 | warranty, broken, defective, damaged, repair |
| 11 | exchange, size, swap, different |
| 12 | invoice, receipt, vat, tax, billing |

---

### 1. How long does shipping take?

Standard shipping takes 3 to 5 business days within the continental US.
Express shipping takes 1 to 2 business days. Orders placed before 2 pm
Eastern time on a business day ship the same day.

### 2. Do you ship internationally?

Yes. We ship to the UK, the EU, Canada, Australia and Japan. International
delivery takes 7 to 14 business days. Customs duties and import taxes are
charged by the destination country and are paid by the recipient on
delivery.

### 3. How do I track my order?

When your order ships we email you a tracking link. You can also sign in
to your account and open **Orders** to see the carrier, tracking number and
latest status for every order.

### 4. What is your return policy?

You can return unused items in their original packaging within 30 days of
delivery. Start a return from **Orders → Return items** in your account and
we will email you a prepaid return label. Final-sale items and gift cards
cannot be returned.

### 5. How long do refunds take?

Once your return reaches our warehouse we inspect it within 2 business
days and issue the refund to your original payment method. Your bank may
take another 3 to 7 business days to show the credit.

### 6. Can I cancel or change my order?

You can cancel or change an order within 1 hour of placing it from
**Orders → Cancel order**. After that the order is already being packed;
let it arrive and start a free return instead.

### 7. How do I change my shipping address?

If the order has not shipped, update the address from **Orders → Edit
address** within 1 hour of ordering. If it has already shipped, use the
carrier's tracking page to request a redirect. For your saved address, go
to **Account → Addresses**.

### 8. I forgot my password. How do I reset it?

Click **Sign in → Forgot password** and enter your account email. We will
send a reset link that is valid for 30 minutes. If it does not arrive,
check your spam folder, then try again.

### 9. Which payment methods do you accept?

We accept Visa, Mastercard, American Express, PayPal, Apple Pay and Google
Pay. Business customers can request invoice payment with 30-day terms.

### 10. What does the warranty cover?

All products carry a 1-year warranty against manufacturing defects. If an
item arrives damaged or stops working because of a defect, reply with your
order number and a photo and we will send a replacement or refund.

### 11. Can I exchange an item for a different size or color?

Yes. Start a return for the item you have and place a new order for the
one you want. Exchanges are free within 30 days of delivery.

### 12. How do I get an invoice or receipt?

Every order confirmation email is your receipt. For a VAT invoice, sign in
and open **Orders → Download invoice**. Invoices show the VAT number you
saved under **Account → Billing**.
