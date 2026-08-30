import { NextResponse } from 'next/server';
import { verifyAdminSession, PUBLIC_AI_MODES } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  consumeDurableRateLimit,
  getRequestIp,
  isTrustedStorefrontRequest,
  rateLimitHeaders,
  readLimitedJson,
  RequestBodyError,
} from '@/lib/publicApiSecurity.mjs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const AI_MODE_PERMISSIONS = {
  translate: ['spreadsheet', 'cms', 'marketing', 'broadcasts'],
  generate_info: ['spreadsheet', 'cms'],
  chat: ['home'],
  cross_sell: ['customers', 'carts', 'whatsapp_ai'],
  draft_inquiry_reply: ['inquiries'],
  draft_live_chat_reply: ['live_chat'],
  generate_email_template: ['marketing'],
  draft_broadcast: ['broadcasts'],
  generate_journey: ['marketing'],
  explain_metric: ['analytics', 'home'],
};

export async function POST(request) {
  try {
    const { body } = await readLimitedJson(request, 64 * 1024);
    const { mode, prompt, text, sourceLang = 'en', targetLang = 'es', context = {} } = body;

    if (!GEMINI_API_KEY) {
      console.error('[AI API] GEMINI_API_KEY is not configured on the server.');
      return NextResponse.json({ error: 'Gemini API Key is not configured on the server.' }, { status: 500 });
    }

    if (PUBLIC_AI_MODES.has(mode)) {
      if (!isTrustedStorefrontRequest(request)) {
        return NextResponse.json({ error: 'Request origin is not allowed' }, { status: 403 });
      }
      const limit = await consumeDurableRateLimit(getSupabaseAdmin(), {
        bucket: 'customer-ai-ip',
        key: getRequestIp(request),
        limit: 20,
        windowSeconds: 10 * 60,
      });
      if (!limit.allowed) {
        return NextResponse.json(
          { error: limit.unavailable ? 'Chat protection is temporarily unavailable' : 'Too many chat requests. Please wait a few minutes.' },
          { status: limit.unavailable ? 503 : 429, headers: rateLimitHeaders(limit) },
        );
      }
    } else {
      const auth = await verifyAdminSession(request, {
        requireAnyPermission: AI_MODE_PERMISSIONS[mode] || ['home'],
        skipPathPermission: true,
      });
      if (auth.error) return auth.error;
    }

    let finalPrompt = '';

    if (mode === 'translate') {
      if (!text) {
        return NextResponse.json({ error: 'Missing text parameter for translation' }, { status: 400 });
      }
      finalPrompt = `You are a professional scientific translator specializing in biotechnology, biochemistry, and peptides. Translate the following text from ${sourceLang === 'en' ? 'English' : 'Spanish'} to ${targetLang === 'es' ? 'Spanish' : 'English'}. Preserve all scientific terminology, formatting, numbers, and markdown precisely, but ensure natural reading flow. Do not add any conversational remarks, introductions, explanations, or quotes. Just output the clean translated text.\n\nText to translate:\n${text}`;
    } else if (mode === 'generate_info') {
      if (!text) {
        return NextResponse.json({ error: 'Missing peptide/product name for generation' }, { status: 400 });
      }
      finalPrompt = `You are an expert biochemist, copywriter, and scientific writer specializing in research-grade peptides. 
Write a highly premium, accurate, and appealing scientific description/information sheet for the peptide or compound: "${text}".
You must write it in the style of a premium research catalog. 

Provide:
1. A clear scientific overview and molecular purpose (1-2 sentences).
2. Key research benefits/indications (3-4 bullet points).
3. The primary biochemical mechanism of action (1-2 sentences).

Generate this in two versions: English and Spanish. 
Format your final response as a strict, valid JSON object with exactly two keys: "en" and "es", containing the English and Spanish formatted descriptions respectively.
Do NOT wrap the output in markdown code blocks like \`\`\`json or add any preamble/postscript. Output ONLY the raw JSON string.

Example JSON output format:
{
  "en": "**Description:** BPC-157 is a pentadecapeptide consisting of 15 amino acids...\\n\\n**Key Benefits:**\\n- Accelerates tendon-to-bone healing\\n- Promotes gastric mucosal integrity\\n- Reduces inflammatory responses\\n\\n**Mechanism:** It acts by upregulating growth hormone receptors...",
  "es": "**Descripción:** BPC-157 es un pentadecapéptido que consta de 15 aminoácidos...\\n\\n**Beneficios Clave:**\\n- Acelera la cicatrización de tendón a hueso\\n- Promueve la integridad de la mucosa gástrica\\n- Reduce las respuestas inflamatorias\\n\\n**Mecanismo:** Actúa regulando positivamente los receptores..."
}`;
    } else if (mode === 'chat') {
      if (!prompt) {
        return NextResponse.json({ error: 'Missing prompt parameter for chat' }, { status: 400 });
      }

      const productsContext = context.products 
        ? `Active Products in Database:\n${context.products.map(p => `- ${p.product} (Category: ${p.category}, Price: ${p.priceUsd || p.priceCrc})`).join('\n')}`
        : '';
        
      const statsContext = context.stats
        ? `Store Statistics:
- Total Orders: ${context.stats.totalOrders || 0}
- Active Abandoned Carts: ${context.stats.activeCartsCount || context.stats.abandonedCartsCount || 0}
- Total Leads Captured: ${context.stats.leadsCount || 0}
- Leads Traffic Source Breakdown (source count): ${JSON.stringify(context.stats.leadAttributions || {})}
- Abandoned Carts Item Frequency: ${JSON.stringify(context.stats.cartItemsCount || {})}`
        : '';

      finalPrompt = `You are "Costa Peptides Admin Copilot", a premium AI assistant integrated directly into the administration dashboard of Peptides Costa Rica.
You are professional, precise, knowledgeable, and helpful. You speak Spanish and English fluently (always reply in the language the administrator addresses you in).
You have access to the following live store data context to answer queries:

${productsContext}

${statsContext}

Guidelines:
- If asked to draft a message (like WhatsApp recovery, order update, or marketing newsletter), make it highly engaging, professional, and clear.
- Keep answers scientific yet readable, highlighting quality, research application, and e-commerce growth.
- Use clean Markdown styling for headings, bullet points, bolding, and code snippets when helpful.

Administrator Query:
${prompt}`;
    } else if (mode === 'customer_chat') {
      const customerPrompt = String(prompt || '').trim().slice(0, 1200);
      if (!customerPrompt) {
        return NextResponse.json({ error: 'Missing prompt parameter for customer chat' }, { status: 400 });
      }

      const safeProducts = Array.isArray(context.products)
        ? context.products.slice(0, 100).map((product) => ({
          product: String(product?.product || '').slice(0, 120),
          category: String(product?.category || '').slice(0, 80),
          price: String(product?.priceUsd || product?.priceCrc || '').slice(0, 40),
          status: String(product?.status || '').slice(0, 40),
        }))
        : [];
      const safeHistory = Array.isArray(context.history)
        ? context.history.slice(-8).map((message) => ({
          role: message?.role === 'user' ? 'user' : 'assistant',
          text: String(message?.text || '').slice(0, 600),
        }))
        : [];

      const productsContext = safeProducts.length
        ? `Active Catalog:\n${safeProducts.map(p => `- ${p.product} (Category: ${p.category}, Price: ${p.price}, Status: ${p.status})`).join('\n')}`
        : '';
        
      const memoryContext = safeHistory.length
        ? `\nRecent Conversation History:\n${safeHistory.map(m => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.text}`).join('\n')}`
        : '';

      finalPrompt = `You are "Peptides Costa Rica Assistant", a warm, professional customer support agent for Peptides Costa Rica.
You speak Spanish and English fluently (always reply in the language the customer addresses you in, but default to Spanish if unsure).
You have access to the active catalog to answer queries:

${productsContext}
${memoryContext}

Guidelines:
- First answer every direct question in the customer's latest message. Do not repeat facts already answered.
- Match only the language of the customer's latest message and stay in that language unless they request a switch.
- Write naturally and concisely, usually 1-3 short sentences for a simple chat question. Avoid canned filler and excessive "Pura vida" phrasing.
- Inventory ships locally from Costa Rica. Orders are normally processed within 24 hours after payment confirmation, then delivered within 1-3 business days through Correos de Costa Rica or Moovin depending on destination.
- Free shipping starts at $200 USD-equivalent after discounts. Never quote a fixed CRC threshold because the exchange rate changes, and do not mention free shipping unless it is relevant to the question.
- Always refer to catalog prices in Costa Rican Colones or US Dollars based on their preference.
- After answering, ask exactly one useful, low-friction question that advances the purchase when appropriate, such as which product, quantity, currency, or province they need. Avoid generic closings such as "feel free to ask."
- If asked whether you are human, honestly say you are the store's virtual assistant, offer a human teammate if preferred, and continue with one helpful question. Never pretend to be a person.
- Never invent products, prices, stock, policies, or answers. If something cannot be verified, say the team can confirm it and ask for the one detail needed to proceed. Mention +506 8404-6973 only when the customer asks for a human or a handoff is truly necessary.
- Products are for laboratory research only. Never provide medical advice, treatment claims, dosage, injection, or human/veterinary-use guidance.
- Do not output raw JSON or internal code.

Customer Query:
${customerPrompt}`;
    } else if (mode === 'cross_sell') {
      const { customerName = 'Investigador', purchasedProducts = [], recommendation = '' } = context;
      const purchasedStr = purchasedProducts.length > 0 
        ? purchasedProducts.join(', ') 
        : 'nuestros péptidos';
        
      finalPrompt = `You are "Costa Peptides Marketing Copilot", an elite e-commerce and biotech marketing strategist.
Write a highly personalized, warm, and scientifically persuasive WhatsApp sales message in Costa Rican Spanish targeting the customer: "${customerName}".

Customer Context:
- Past purchased compound(s) or cart compound(s): "${purchasedStr}"
- Highly synergistic product recommended for their next research phase: "${recommendation}"

Instructions:
1. Greet them warmly and professionally in Costa Rican style (friendly yet highly respectful, e.g. "Estimado/a", "Espero que se encuentre muy bien").
2. Follow up on their research with the previous compound ("${purchasedStr}").
3. Explain the scientific, synergistic reasons why introducing "${recommendation}" is the perfect next phase or addition for their research. Focus on technical benefits (joint repair, tissue regeneration, fat metabolism, anti-aging cellular repair) depending on the products.
4. Keep the message professional, research-focused, and exciting. Do not use hyper-salesy or cheesy marketing buzzwords. Keep it scientifically grounded.
5. Format the message for WhatsApp using bullet points, natural line breaks, and simple text formatting (e.g. use asterisks *like this* for bolding keywords).
6. End with a gentle, clear invitation to ask any questions or purchase the vial directly. Do NOT write placeholders, URLs, or brackets like [link].

Output ONLY the clean Spanish message text ready to be sent.`;
    } else if (mode === 'draft_inquiry_reply') {
      const { customerName = 'Customer', subject = '', message = '' } = context;
      
      const productsContext = context.products 
        ? `Active Catalog Context:\n${context.products.map(p => `- ${p.product} (Category: ${p.category}, Price: ${p.priceUsd || p.priceCrc}, Status: ${p.status})`).join('\n')}`
        : '';
        
      finalPrompt = `You are "Peptides Costa Rica Customer Support", an elite customer service agent.
Write a highly professional, polite, and scientifically accurate email reply to the customer: "${customerName}".

Customer Inquiry Subject: "${subject}"
Customer Message:
"${message}"

${productsContext}

Instructions:
1. Auto-detect the language the customer used in their message, and write your reply in that exact same language.
2. If Spanish, use warm Costa Rican phrasing (e.g. "Estimado/a", "Pura vida", "Con gusto"). If English, be highly professional and polite.
3. Directly answer their specific questions based on the "Active Catalog Context" provided above.
4. If they ask about something not in the catalog, politely inform them we do not currently carry it.
5. If they ask about shipping, mention we ship across Costa Rica via Correos de Costa Rica (1-3 days).
6. Format your email cleanly with paragraphs. Do not include placeholders for things you don't know, just answer what you can.
7. End the email warmly from "El equipo de Peptides Costa Rica" or "The Peptides Costa Rica Team".

Output ONLY the clean email reply text ready to be sent to the customer.`;
    } else if (mode === 'draft_live_chat_reply') {
      const { visitorName = 'Website visitor', messages = [] } = context;
      const transcript = messages
        .slice(-12)
        .map((message) => `${message.senderType === 'agent' ? 'Agent' : 'Visitor'}: ${message.message}`)
        .join('\n');

      finalPrompt = `You are "Peptides Costa Rica Live Support", a warm, precise website chat support agent.
Draft a concise reply to this live chat visitor: "${visitorName}".

Recent chat transcript:
${transcript}

Rules:
- Reply in the same language the visitor is using, default Spanish if unclear.
- Be helpful, calm, and direct.
- Keep it short enough for live chat: 1-3 short paragraphs.
- Do not invent stock, prices, policies, or medical claims.
- If the visitor asks for something you cannot verify, say the team can confirm it shortly.
- Avoid mentioning WhatsApp as the main channel.

Output ONLY the chat reply text.`;
    } else if (mode === 'generate_email_template') {
      const { prompt: userPrompt } = context;
      finalPrompt = `You are an elite biotech e-commerce copywriter and email marketer.
Write a highly engaging, persuasive, and professional email campaign template based on the following request:
"${userPrompt}"

You must strictly output your response as a valid JSON object with the following keys:
- "subject": The email subject line.
- "previewText": A short preview text (preheader) for the inbox.
- "headline": The main H1 headline inside the email.
- "eyebrow": A short pre-headline or contextual note.
- "body": The main email body written in HTML (use <p>, <strong>, <ul>, <li>). Keep it concise, engaging, and professional.
- "cta": The text for the main call-to-action button.
- "footerNote": A short closing note or disclaimer in HTML format (e.g. <p>Disclaimer...</p>).

Do NOT wrap the output in markdown code blocks like \`\`\`json or add any preamble/postscript. Output ONLY the raw JSON string.`;
    } else if (mode === 'draft_broadcast') {
      const { prompt: userPrompt } = context;
      finalPrompt = `You are an elite biotech e-commerce copywriter.
Write a highly engaging, persuasive, and professional broadcast message.
Target Audience: Costa Rican researchers and customers. Language: Spanish (unless specified otherwise).

Instructions provided by the user for this broadcast:
"${userPrompt}"

Guidelines:
1. Make it punchy, exciting, but scientifically grounded. No cheesy buzzwords.
2. Avoid aggressive urgency, pressure tactics, or language that may trigger spam reports.
3. Use bullet points and basic formatting (like *bold*) for readability.
4. Include variables like {{name}} if appropriate, so the system can personalize it.
5. End with a clear service-oriented Call to Action, such as asking them to reply if they want assistance.
6. For WhatsApp safety, do not make medical, therapeutic, diagnostic, treatment, dosage, injection, human-use, weight-loss, or prescription-style claims.
7. Do not imply a peptide treats, cures, prevents, reverses, or produces body outcomes.
8. Do not invent inventory, certifications, lab results, prices, discounts, or claims not provided by the admin.
9. Include a short opt-out footer in Spanish, e.g. "Para dejar de recibir promociones, responda BAJA." Never ask people to reply with a numeric code; ask them to reply normally if they want help.

Output ONLY the final drafted message text.`;
    } else if (mode === 'generate_journey') {
      const goal = String(context.goal || prompt || '').trim().slice(0, 1500);
      if (!goal) return NextResponse.json({ error: 'Describe the journey goal' }, { status: 400 });
      finalPrompt = `You are the lifecycle automation strategist for Costa Peptides, a research-products e-commerce business in Costa Rica.
Create a practical customer journey for this administrator goal:
"${goal}"

Return ONLY a strict JSON object matching this schema:
{
  "name": "short journey name",
  "description": "one sentence purpose",
  "trigger": { "type": "new_subscriber|abandoned_cart|catalog_lead|reorder_due", "days": 30 },
  "steps": [
    {
      "type": "action",
      "channel": "email|whatsapp",
      "delay_hours": 0,
      "subject": "required for email, null for whatsapp",
      "message": "plain text message using [FIRST_NAME] when useful"
    },
    {
      "type": "condition",
      "condition": "has_active_cart|email_engaged|no_order_since_enrollment",
      "on_false": "stop|skip_next|continue",
      "delay_hours": 0
    }
  ],
  "strategy_note": "one sentence explaining the timing and logic"
}

Rules:
- Use 1 to 6 steps and no more than 3 messages in seven days.
- Use WhatsApp sparingly and only when commercially justified.
- Stop irrelevant follow-ups through a decision gate where useful.
- Messages must be concise, professional, and suitable for research products.
- Do not make medical, therapeutic, diagnostic, treatment, dosage, or human-use claims.
- Do not invent discounts, prices, inventory, certifications, or test results.
- Do not wrap JSON in markdown or include commentary outside the JSON.`;
    } else if (mode === 'explain_metric') {
      // One card, one question. The tab's other AI button audits the whole
      // store in two languages and produces a report nobody finishes; this
      // answers "what does this number mean" about the number in front of you,
      // with only that number's data in the prompt.
      const metric = String(context.metric || '').trim().slice(0, 80);
      const figures = String(context.figures || '').trim().slice(0, 1200);
      if (!metric || !figures) {
        return NextResponse.json({ error: 'Missing metric context' }, { status: 400 });
      }
      finalPrompt = `You are an e-commerce analyst reading one figure on a dashboard for Peptides Costa Rica, a research-peptide store.

The card is: ${metric}
Its current numbers:
${figures}

Answer in at most three short sentences, in English:
1. What this figure is saying right now.
2. Whether that is good, bad, or unremarkable for a store of this kind — say plainly if there is not enough data to tell.
3. The single most useful thing to do about it, or "nothing to do" if that is the honest answer.

Rules:
- Use only the numbers above. Do not estimate, extrapolate, or invent figures, benchmarks, or industry averages.
- If a figure is zero because nothing has been recorded yet, say so rather than treating it as a bad result.
- No preamble, no headings, no bullet points. Plain sentences.
- Do not make medical, therapeutic, or human-use claims.`;
    } else {
      // Default fallback
      finalPrompt = prompt || text;
    }

    console.log(`[AI API] Sending request to ${mode} mode...`);

    const openAiModes = new Set([
      'chat',
      'generate_email_template',
      'draft_broadcast',
      'generate_journey',
      'cross_sell'
    ]);

    let responseText = '';

    if (openAiModes.has(mode) && OPENAI_API_KEY) {
      console.log(`[AI API] Using OpenAI for mode "${mode}"`);
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // or whatever model is preferred
          messages: [{ role: 'user', content: finalPrompt }],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[AI API] OpenAI API error:', data);
        return NextResponse.json({ error: data.error?.message || 'OpenAI API call failed' }, { status: response.status });
      }

      responseText = data.choices?.[0]?.message?.content || '';
    } else {
      console.log(`[AI API] Using Gemini for mode "${mode}"`);
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: finalPrompt,
                  },
                ],
              },
            ],
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('[AI API] Google Gemini API error:', data);
        return NextResponse.json({ error: data.error?.message || 'Gemini API call failed' }, { status: response.status });
      }

      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    
    return NextResponse.json({ success: true, text: responseText });
  } catch (error) {
    console.error('[AI API] Unexpected server error:', error);
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
