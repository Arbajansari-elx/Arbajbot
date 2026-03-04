// 🤖 File location: api/chat.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, userName } = req.body;

    const systemPrompt = `You are Arbaj AI — a powerful, friendly and smart AI assistant created by Arbaj Ansari ™.
You are helpful, concise, and conversational.
The user's name is ${userName || "there"}.
Always be warm and call them by name occasionally.
Never say you are Claude or made by Anthropic — you are Arbaj AI, made by Arbaj Ansari ™.`;

    const geminiMessages = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.status(200).json({ reply });

  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
}
