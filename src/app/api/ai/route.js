import { NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request) {
  try {
    if (!GEMINI_API_KEY) {
      console.error('[AI API] GEMINI_API_KEY is not configured on the server.');
      return NextResponse.json({ error: 'Gemini API Key is not configured on the server.' }, { status: 500 });
    }

    const body = await request.json();
    const { mode, prompt, text, sourceLang = 'en', targetLang = 'es', context = {} } = body;

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
