export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, userName, model, image, webSearch } = req.body;

    let cards = [];
    let webContext = "";

    // ── WEB SEARCH — Tavily (accuracy improvements) ──
    if (webSearch && messages.length > 0) {
      const rawQuery = messages[messages.length - 1]?.content || "";

      // Clean & sharpen query for better results
      const query = rawQuery
        .replace(/\?/g, '')
        .replace(/\b(kya|hai|hota|kaise|please|bata|mujhe|batao|yrr|yaar|bhai)\b/gi, '')
        .trim()
        .slice(0, 200) || rawQuery;

      try {
        const tRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query,
            search_depth: "advanced",   // deeper = more accurate
            max_results: 5,
            include_images: true,
            include_answer: true,
            include_raw_content: false,
          }),
        });

        const tData = await tRes.json();

        if (tData.results?.length) {
          // Sort by score (Tavily gives relevance score)
          const sorted = tData.results
            .filter(r => r.content && r.content.length > 50)
            .sort((a, b) => (b.score || 0) - (a.score || 0));

          // Build clean web context for AI
          webContext = sorted.slice(0, 4).map((r, i) =>
            `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.content?.slice(0, 500)}`
          ).join("\n\n");

          // If Tavily gives direct answer, include it
          if (tData.answer) {
            webContext = `DIRECT ANSWER: ${tData.answer}\n\n` + webContext;
          }

          // Build news cards from top 3
          cards = sorted.slice(0, 3).map((r, idx) => {
            const domain = (() => {
              try { return new URL(r.url).hostname.replace('www.',''); }
              catch(e) { return r.url; }
            })();

            // Extract 2 clean summary sentences
            const sentences = (r.content || "")
              .split(/(?<=[.!?])\s+/)
              .map(s => s.trim())
              .filter(s => s.length > 40 && s.length < 180)
              .slice(0, 2);

            return {
              title: r.title || "",
              source: domain,
              logo: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
              image: tData.images?.[idx] || "",
              url: r.url,
              points: sentences.length ? sentences : [(r.content||"").slice(0, 120)]
            };
          });
        }
      } catch (se) {
        console.warn("Tavily error:", se.message);
      }
    }

    // ── SYSTEM PROMPT ──
    let systemPrompt = `You are Elx AI Pro — a powerful AI assistant created by Arbaj Ansari.
Reply Accurate, solid, confident like ChatGPT. Use bullets for lists. Use emojis occasionally.
Never say you are Claude, Llama, Anthropic, or Meta. You are Elx AI Pro by Arbaj Ansari.
User name: ${userName || "there"}.`;

    if (webContext) {
      systemPrompt += `\n\nLIVE WEB DATA (use ONLY this to answer — do not use old knowledge for this query):\n${webContext}\n\nRules:
- Answer ONLY from the web data above
- Mention key facts with source numbers like [1], [2]
- If data is unclear, say "Web results mein clearly mention nahi hai"
- Be concise — max 5 bullet points`;
    }

    let userMessages = [...messages];
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

    const gRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: image ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, ...userMessages],
        max_tokens: 800,
        temperature: 0.3,  // lower = more factual for web search
      }),
    });

    const gData = await gRes.json();
    if (gData.error) return res.status(400).json({ error: gData.error.message });

    res.status(200).json({
      reply: gData.choices?.[0]?.message?.content || "",
      cards
    });

  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
}

