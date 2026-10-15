import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://muddy-1617.github.io",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://muddy-1617.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00");
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed >= today;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!origin || !allowedOrigins.has(origin)) return json({ error: "Origin not allowed." }, 403);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!resendKey || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "The booking service is not fully configured yet." }, 503);
  }

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Please submit valid booking details." }, 400);
  }

  const name = String(input.customer_name ?? "").trim();
  const email = String(input.customer_email ?? "").trim().toLowerCase();
  const phone = String(input.customer_phone ?? "").trim();
  const make = String(input.vehicle_make ?? "").trim();
  const model = String(input.vehicle_model ?? "").trim();
  const service = String(input.service ?? "").trim();
  const date = String(input.booking_date ?? "").trim();
  const time = String(input.booking_time ?? "").trim();
  const message = String(input.message ?? "").trim();

  const services = new Set(["Exterior Wash", "Interior Refresh", "Full Detail"]);
  const times = new Set(["", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 || phone.length > 40 || make.length > 80 ||
      model.length > 80 || message.length > 1000 || !services.has(service) ||
      !validDate(date) || !times.has(time)) {
    return json({ error: "Please check your booking details and try again." }, 400);
  }

  const bookingPayload = {
    customer_name: name,
    customer_email: email,
    customer_phone: phone || null,
    vehicle_make: make || null,
    vehicle_model: model || null,
    service,
    booking_date: date,
    booking_time: time || null,
    message: message || null,
    status: "pending",
  };

  let booking: Record<string, unknown>;
  try {
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/bookings?select=id,created_at,status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(bookingPayload),
    });
    const rows = await insertResponse.json();
    if (!insertResponse.ok || !Array.isArray(rows) || !rows[0]?.id) {
      console.error("Booking insert failed:", JSON.stringify(rows));
      return json({ error: "We couldn't save your booking request. Please try again." }, 500);
    }
    booking = rows[0];
  } catch (error) {
    console.error("Booking insert request failed:", error);
    return json({ error: "A connection issue prevented your booking from being saved." }, 500);
  }

  const readableDate = new Date(date + "T12:00:00").toLocaleDateString("en-CA", {
    year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto",
  });
  const readableTime = time
    ? (() => {
        const [hourText, minuteText] = time.split(":");
        const hour = Number(hourText);
        return `${hour % 12 || 12}:${minuteText} ${hour >= 12 ? "PM" : "AM"}`;
      })()
    : "No preference requested";
  const vehicle = [make, model].filter(Boolean).join(" ") || "Not provided";
  const reference = String(booking.id);
  const notes = message || "None";
  const from = Deno.env.get("BOOKING_EMAIL_FROM") || "ToyoHondu Carwash <onboarding@resend.dev>";

  const html = `
    <div style="margin:0;background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#171923">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <div style="background:#111722;color:#fff;padding:26px 28px">
          <div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#ff7777">TOYOHONDU CARWASH</div>
          <h1 style="margin:12px 0 4px;font-size:25px">We received your booking request</h1>
          <p style="margin:0;color:#cbd5e1">Thanks, ${escapeHtml(name)}. Keep this email for your records.</p>
        </div>
        <div style="padding:26px 28px">
          <p style="margin-top:0">Your request has been saved. <strong>Your appointment is not confirmed yet</strong>; the ToyoHondu team must confirm availability first.</p>
          <div style="padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin:18px 0">
            <div style="font-size:12px;color:#6b7280">BOOKING REFERENCE</div>
            <div style="font-size:15px;font-weight:bold;overflow-wrap:anywhere">${escapeHtml(reference)}</div>
            <div style="margin-top:6px;color:#6b7280;font-size:12px">Status: Pending confirmation</div>
          </div>
          <h2 style="font-size:17px;margin:24px 0 10px">Booking details</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            ${[
              ["Name", name], ["Email", email], ["Phone", phone || "Not provided"],
              ["Vehicle", vehicle], ["Cleaning service", service],
              ["Preferred date", readableDate], ["Preferred time", readableTime],
              ["Additional notes", notes]
            ].map(([label, value]) => `<tr><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:38%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("")}
          </table>
          <p style="font-size:13px;color:#6b7280;margin-top:22px">This email confirms receipt of your request only. It is not a payment receipt, and no payment has been taken through this form.</p>
          <p style="font-size:13px;color:#6b7280">If any detail is incorrect, please contact ToyoHondu Carwash and quote your booking reference.</p>
        </div>
      </div>
    </div>`;

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `ToyoHondu booking request received — ${reference.slice(0, 8)}`,
        html,
      }),
    });
    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Confirmation email failed:", JSON.stringify(emailResult));
      return json({
        success: true,
        booking_saved: true,
        email_sent: false,
        booking_reference: reference,
        message: "Your booking request was saved, but the confirmation email could not be sent. Please check your email address or contact ToyoHondu.",
      }, 200);
    }
  } catch (error) {
    console.error("Confirmation email request failed:", error);
    return json({
      success: true, booking_saved: true, email_sent: false, booking_reference: reference,
      message: "Your booking request was saved, but the confirmation email could not be sent right now.",
    }, 200);
  }

  return json({
    success: true, booking_saved: true, email_sent: true, booking_reference: reference,
    message: "Your booking request was saved and a confirmation receipt was emailed to you. Your appointment is pending confirmation.",
  });
});
