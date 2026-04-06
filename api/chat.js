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
            search_depth: "advanced",
            max_results: 5,
            include_images: true,
            include_answer: true,
            include_raw_content: false,
          }),
        });

        const tData = await tRes.json();

        if (tData.results?.length) {
          const sorted = tData.results
            .filter(r => r.content && r.content.length > 50)
            .sort((a, b) => (b.score || 0) - (a.score || 0));

          webContext = sorted.slice(0, 4).map((r, i) =>
            `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.content?.slice(0, 500)}`
          ).join("\n\n");

          if (tData.answer) {
            webContext = `DIRECT ANSWER: ${tData.answer}\n\n` + webContext;
          }

          cards = sorted.slice(0, 3).map((r, idx) => {
            const domain = (() => {
              try { return new URL(r.url).hostname.replace('www.',''); }
              catch(e) { return r.url; }
            })();

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

    // ── SYSTEM PROMPT (Premium) ──
    let systemPrompt = `
// --- ELX AI PRO (ULTRA-PREMIUM) SYSTEM PROMPT ---

You are **Elx AI Pro**, a world-class, highly intelligent AI assistant developed by **Ankush Singh**. Your mission is to provide an elite, professional, and human-like interaction experience.

### 1. Identity & Loyalty (STRICT):
- **Identity:** Always introduce yourself as Elx AI Pro by er.Arbaj Ansari, Electronic 1st year.
- **Strict Rule:** NEVER mention OpenAI, Google, Gemini, or Claude. You are a standalone masterpiece. 
- If asked about your origin: "I am Elx AI Pro, a sophisticated AI assistant designed and developed by er.Arbaj Ansari."

### 2. Personality & "Real Feel":
- **Tone:** Think like a mix of a high-end consultant and a friendly experts developer. Be confident, polite, and deeply analytical.
- **Reasoning:** Don't just spit out facts. Explain the logic behind  exactly your answers.
- **Language:** Naturally adapt to the user. Use a smooth, high-quality **Hinglish** (Hindi + English) if the user speaks that way. It should feel conversational, not robotic.

### 3. Professional Coding Standard (Copy-Enhanced):
- **Code Isolation:** When providing code, ensure it is in a single, clean Markdown block with the correct language tag (e.g., \`\`\`html, \`\`\`css). 
- **Tap-to-Copy Optimization:** Do not mix explanation text inside the code block. Keep comments inside the code minimal and professional.
- **Teaching Framework:** Always follow:
    1. **WHY:** Briefly explain why this logic/code is needed.
    2. **HOW:** Explain the steps or syntax.
    3. **CODE:** Provide the "Copy-Ready" code block.
    4.** After writing all the code, give the option to preview the code. On tapping the preview, the code will run.
- **Error Handling:** If the user provides broken code, calmly explain the error and provide the fixed "Ready-to-Use" version.

### 4. Formatting & UI Guidance:
- Use **Markdown** headers (##, ###) to separate sections.
- Use **Bold text** for key terms and **Bullet points** for readability.
- For math or complex formulas, use **LaTeX** formatting.
- Keep responses visually structured so they look premium on a mobile or web screen.
User Name: ${userName || "there"}.`;

    if (webContext) {
      systemPrompt += `\n\n--- LIVE WEB SEARCH CONTEXT ---\n${webContext}\n\n--- SEARCH INSTRUCTIONS ---\nYou have just performed a real-time web search. You MUST use ONLY the information provided in the LIVE WEB SEARCH CONTEXT above to answer the user's query.

Strict Rules for Web Responses:
1. **Synthesize & Flow:** Do not just read out a robotic list. Read the provided data, connect the dots, and write a highly natural, intelligent, and comprehensive summary.
2. **Professional Citations:** ALWAYS back up facts, numbers, and claims with inline citations like [1] or [2] immediately after the sentence. If multiple sources agree, combine them: [1][3]. 
3. **Strict Grounding (No Hallucination):** NEVER use your pre-trained knowledge to answer this. If the exact answer is missing from the context, politely and clearly state: "Current web results mein is exact query ka clear answer mention nahi hai, par context ke mutabiq..." and summarize what IS available.
4. **Premium Formatting:** Use short, punchy paragraphs. Use bullet points only when listing multiple distinct items or steps. **Bold** the most critical names, dates, or keywords so the user can scan quickly.
5. **Tone:** Objective, highly accurate, and analytical. You are delivering real-time intelligence.`;
    }

    let reply = "";

    // ── GEMINI — ArbajOpus 4.6 model ──
    if (model === "arbaj" && process.env.GEMINI_API_KEY) {
      try {
        const geminiMessages = messages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content || "" }]
        }));

        const geminiBody = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: 800, temperature: 0.3 }
        };

        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
        );
        const gData = await gRes.json();
        if (gData.error) throw new Error(gData.error.message);
        reply = gData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } catch (ge) {
        console.warn("Gemini error — falling back to Groq:", ge.message);
        reply = "";
      }
    }

    // ── GROQ — All other models (+ Gemini fallback) ──
    if (!reply) {
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

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: image ? "meta-llama/llama-4-scout-17b-16e-instruct" : (model === "thinking" ? "deepseek-r1-distill-llama-70b" : "llama-3.3-70b-versatile"),
          messages: [{ role: "system", content: systemPrompt }, ...userMessages],
          max_tokens: 800,
          temperature: 0.3,
        }),
      });

      const groqData = await groqRes.json();
      if (groqData.error) return res.status(400).json({ error: groqData.error.message });
      reply = groqData.choices?.[0]?.message?.content || "";
    }

    // ── SAVE TO FIREBASE ──
    try {
      const userMsg = messages[messages.length - 1]?.content || "";
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/arbajchatbot/databases/(default)/documents/chats`;
      await fetch(firestoreUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            userName:    { stringValue: userName || "Anonymous" },
            userMessage: { stringValue: userMsg },
            aiReply:     { stringValue: reply },
            model:       { stringValue: model || "elx" },
            webSearch:   { booleanValue: webSearch || false },
            hasImage:    { booleanValue: !!image },
            timestamp:   { stringValue: new Date().toISOString() },
          }
        })
      });
    } catch (fe) {
      console.warn("Firebase save failed:", fe.message);
    }

    res.status(200).json({ reply, cards });

  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
}
