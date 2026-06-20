import { NextResponse } from 'next/server';
import { verifyAdminSession, PUBLIC_AI_MODES } from '@/lib/adminAuth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request) {
  try {
    if (!GEMINI_API_KEY) {
      console.error('[AI API] GEMINI_API_KEY is not configured on the server.');
      return NextResponse.json({ error: 'Gemini API Key is not configured on the server.' }, { status: 500 });
    }

    const body = await request.json();
    const { mode, prompt, text, sourceLang = 'en', targetLang = 'es', context = {} } = body;

    if (!PUBLIC_AI_MODES.has(mode)) {
      const auth = await verifyAdminSession(request);
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
      if (!prompt) {
        return NextResponse.json({ error: 'Missing prompt parameter for customer chat' }, { status: 400 });
      }

      const productsContext = context.products 
        ? `Active Catalog:\n${context.products.map(p => `- ${p.product} (Category: ${p.category}, Price: ${p.priceUsd || p.priceCrc}, Status: ${p.status})`).join('\n')}`
        : '';
        
      const memoryContext = context.history
        ? `\nRecent Conversation History:\n${context.history.map(m => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.text}`).join('\n')}`
        : '';

      finalPrompt = `You are "Peptides Costa Rica Assistant", a warm, professional customer support agent for Peptides Costa Rica.
You speak Spanish and English fluently (always reply in the language the customer addresses you in, but default to Spanish if unsure).
You have access to the active catalog to answer queries:

${productsContext}
${memoryContext}

Guidelines:
- Answer customer questions about peptides scientifically yet clearly. 
- Mention shipping in Costa Rica is via Correos de Costa Rica (takes 1-3 days, free for orders over 30,000 CRC or $200). 
- Always refer to catalog prices in Costa Rican Colones or US Dollars based on their preference.
- Always be polite, using terms like 'con gusto' or 'Pura vida' if appropriate but remain professional.
- CRITICAL: Never invent products or prices. If a product is not in the active catalog context above, say we don't currently carry it.
- Keep answers concise and readable. Use short paragraphs and bullet points. Do not output raw JSON or internal code.

Customer Query:
${prompt}`;
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
    } else if (mode === 'draft_broadcast') {
      const { prompt: userPrompt } = context;
      finalPrompt = `You are an elite biotech e-commerce copywriter.
Write a highly engaging, persuasive, and professional broadcast message.
Target Audience: Costa Rican researchers and customers. Language: Spanish (unless specified otherwise).

Instructions provided by the user for this broadcast:
"${userPrompt}"

Guidelines:
1. Make it punchy, exciting, but scientifically grounded. No cheesy buzzwords.
2. If it's a flash sale, emphasize urgency (e.g. "Solo este fin de semana", "Stock limitado").
3. Use bullet points and basic formatting (like *bold*) for readability.
4. Include variables like {{name}} if appropriate, so the system can personalize it.
5. End with a clear Call to Action (e.g. link to website or tell them to reply).

Output ONLY the final drafted message text.`;
    } else {
      // Default fallback
      finalPrompt = prompt || text;
    }

    console.log(`[AI API] Sending request to Gemini for mode "${mode}"...`);

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

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return NextResponse.json({ success: true, text: responseText });
  } catch (error) {
    console.error('[AI API] Unexpected server error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
