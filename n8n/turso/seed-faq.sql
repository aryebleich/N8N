-- =====================================================================
-- Example FAQ rows. Mirrors docs/sample-faq.md entry by entry.
-- Apply with:  turso db shell <db-name> < turso/seed-faq.sql
-- Re-running replaces the 12 seed rows (ids 1-12) and leaves your own
-- rows (id > 12) alone. The FTS5 triggers in schema.sql keep faq_fts in
-- sync automatically.
-- =====================================================================

DELETE FROM faq WHERE id BETWEEN 1 AND 12;

INSERT INTO faq (id, question, answer, tags, active, updated_at) VALUES
(1,
 'How long does shipping take?',
 'Standard shipping takes 3 to 5 business days within the continental US. Express shipping takes 1 to 2 business days. Orders placed before 2 pm Eastern time on a business day ship the same day.',
 'shipping,delivery,how long,arrive,days',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(2,
 'Do you ship internationally?',
 'Yes. We ship to the UK, the EU, Canada, Australia and Japan. International delivery takes 7 to 14 business days. Customs duties and import taxes are charged by the destination country and are paid by the recipient on delivery.',
 'international,shipping,countries,customs,duties',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(3,
 'How do I track my order?',
 'When your order ships we email you a tracking link. You can also sign in to your account and open Orders to see the carrier, tracking number and latest status for every order.',
 'tracking,track,where,order,package,shipped',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(4,
 'What is your return policy?',
 'You can return unused items in their original packaging within 30 days of delivery. Start a return from Orders > Return items in your account and we will email you a prepaid return label. Final-sale items and gift cards cannot be returned.',
 'return,returns,refund,send back,policy',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(5,
 'How long do refunds take?',
 'Once your return reaches our warehouse we inspect it within 2 business days and issue the refund to your original payment method. Your bank may take another 3 to 7 business days to show the credit.',
 'refund,money back,how long,credit',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(6,
 'Can I cancel or change my order?',
 'You can cancel or change an order within 1 hour of placing it from Orders > Cancel order. After that the order is already being packed; let it arrive and start a free return instead.',
 'cancel,cancellation,change order',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(7,
 'How do I change my shipping address?',
 'If the order has not shipped, update the address from Orders > Edit address within 1 hour of ordering. If it has already shipped, use the carrier''s tracking page to request a redirect. For your saved address, go to Account > Addresses.',
 'address,change address,shipping address,wrong address',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(8,
 'I forgot my password. How do I reset it?',
 'Click Sign in > Forgot password and enter your account email. We will send a reset link that is valid for 30 minutes. If it does not arrive, check your spam folder, then try again.',
 'password,reset,login,sign in,account',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(9,
 'Which payment methods do you accept?',
 'We accept Visa, Mastercard, American Express, PayPal, Apple Pay and Google Pay. Business customers can request invoice payment with 30-day terms.',
 'payment,pay,methods,card,paypal,invoice',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(10,
 'What does the warranty cover?',
 'All products carry a 1-year warranty against manufacturing defects. If an item arrives damaged or stops working because of a defect, reply with your order number and a photo and we will send a replacement or refund.',
 'warranty,broken,defective,damaged,repair',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(11,
 'Can I exchange an item for a different size or color?',
 'Yes. Start a return for the item you have and place a new order for the one you want. Exchanges are free within 30 days of delivery.',
 'exchange,size,swap,different,color',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

(12,
 'How do I get an invoice or receipt?',
 'Every order confirmation email is your receipt. For a VAT invoice, sign in and open Orders > Download invoice. Invoices show the VAT number you saved under Account > Billing.',
 'invoice,receipt,vat,tax,billing',
 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
