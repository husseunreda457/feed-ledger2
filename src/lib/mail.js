export async function sendMail({ to, subject, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mail disabled] to=${to}\n${subject}\n${text}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("❌ Mail failed:", data);
  } else {
    console.log("✅ Mail sent successfully:", data);
  }
}
