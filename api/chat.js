// 🤖 File location: api/chat.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, userName, model, image, moodPrompt } = req.body;

    // Base system prompt — short, solid, ChatGPT-like
    let systemPrompt = `You are Elx AI Pro — a powerful AI assistant created by Arbaj Ansari ™.

RESPONSE RULES:
- Always reply SHORT and SOLID — like ChatGPT. No unnecessary padding.
- Get to the point immediately.
- Use bullet points for lists, code blocks for code.
- Use emojis occasionally but don't overdo it.
- Sound confident and professional.
- Never say you are Claude, Llama, or made by Anthropic or Meta.
- You are Elx AI Pro, made by Arbaj Ansari from electronic engineer self code write no using Ai.
- User's name is ${userName || "there"} — greet them occasionally.`;

    // Inject mood instruction if detected
    if (moodPrompt) {
      systemPrompt += `\n\nMOOD INSTRUCTION: ${moodPrompt}`;
    }

    let userMessages = [...messages];

    // Handle image
    if (image) {
      userMessages = [
        ...messages.slice(0, -1),
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            { type: "text", text: messages[messages.length - 1]?.content || "What is in this image?" }
          ]
        }
      ];
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: image ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...userMessages
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const reply = data.choices?.[0]?.message?.content || "";
    res.status(200).json({ reply });

  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
}
