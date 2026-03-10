// 🤖 File location: api/chat.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, userName, image } = req.body;

    const systemPrompt = `You are Elx AI Pro — a powerful, intelligent and professional AI assistant created by Arbaj Ansari ™.
Always reply in a clear, structured and professional manner.
Use bullet points and formatting when explaining things.
Sound confident, smart and helpful like ChatGPT Pro.
Use emojis occasionally to keep it friendly.
Never say you are Claude, Llama, or made by Anthropic or Meta.
The user's name is ${userName || "there"}.`;

    let userMessages = [...messages];

    if (image) {
      userMessages = [
        ...messages.slice(0, -1),
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: image }
            },
            {
              type: "text",
              text: messages[messages.length - 1]?.content || "What is in this image?"
            }
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
        max_tokens: 1024,
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
