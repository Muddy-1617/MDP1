# ToyoHondu booking confirmation email setup

The live website submits booking requests through the Supabase Edge Function at `booking-confirmation`. It saves the booking as **pending** and then emails the customer a booking-request receipt through Resend.

## One-time email setup

1. Create a Resend account at https://resend.com/ and create an API key at https://resend.com/api-keys.
2. Verify a domain you own in https://resend.com/domains. You need a verified domain to send to customers from your own business email address.
3. In the Resend domain's DNS settings, add the records Resend requests and wait for verification.
4. Open Supabase Edge Function secrets: https://supabase.com/dashboard/project/jmvlvplltrdtbleyxahy/functions/secrets
5. Add these secrets (keep the values private; never put them in `index.html` or a public GitHub file):
   - `RESEND_API_KEY` = your Resend API key
   - `BOOKING_EMAIL_FROM` = a sender on your verified domain, for example `ToyoHondu Carwash <bookings@your-domain.com>`
6. The function uses Supabase's server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables to save the request. Never expose the service-role key in browser code.

## Test

Open https://muddy-1617.github.io/MDP1/, submit a booking using an email address you can access, and check both the on-screen message and your inbox/spam folder. Confirm the new row appears in the Supabase `public.bookings` table.

The email is a **booking-request receipt**, not a payment receipt. The website does not process payment, and the appointment stays pending until the business confirms availability.
