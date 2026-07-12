const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();

const IMAGE_MODELS = (
  process.env.GEMINI_IMAGE_MODEL?.trim()
    ? [process.env.GEMINI_IMAGE_MODEL.trim()]
    : ['gemini-2.5-flash-image', 'gemini-3.1-flash-image']
) as string[];

const STYLE_PROMPTS: Record<string, string> = {
  'luxury-gold':
    'Transform this image into a luxurious artistic style with rich gold tones on dark background, elegant and premium, suitable for a decorative QR sticker. Keep the main subject recognizable.',
  floral:
    'Transform this image into a soft floral nature aesthetic with forest green and cream tones, botanical artistic style for a QR sticker. Keep the main subject recognizable.',
  sunset:
    'Transform this image into a warm sunset artistic style with orange and sky blue tones, wavy organic feel for a QR sticker. Keep the main subject recognizable.',
  'neon-pop':
    'Transform this image into a vibrant neon pop art style with pink, purple and yellow accents for a QR sticker. Keep the main subject recognizable.',
  ocean:
    'Transform this image into a cool ocean tech aesthetic with deep blues and light cyan for a QR sticker. Keep the main subject recognizable.',
  coffee:
    'Transform this image into a warm coffee shop aesthetic with terracotta and cream tones for a QR sticker. Keep the main subject recognizable.',
  photo:
    'Enhance this image as a full-bleed artistic photo suitable for embedding in a QR code sticker. Increase contrast slightly, keep colors vivid. No text, no black borders.',
  'photo-dots':
    'Stylize this image with vivid colors and good contrast for use in an artistic dot-matrix QR code. Keep subject clear, no text overlays.',
};

const GENERATE_PROMPTS: Record<string, string> = {
  'luxury-gold':
    'Generate a square abstract artistic image for a luxury QR sticker: rich gold ornamental patterns on deep black background, elegant premium feel, high contrast, no text, no QR code, no letters.',
  floral:
    'Generate a square abstract artistic image for a floral nature QR sticker: forest green botanical vines and leaves on soft cream background, delicate organic patterns, no text, no QR code.',
  sunset:
    'Generate a square abstract artistic image for a sunset QR sticker: warm orange and sky blue wavy organic shapes, vibrant and colorful, no text, no QR code.',
  'neon-pop':
    'Generate a square abstract artistic image for a neon pop QR sticker: vibrant pink, purple and yellow geometric pop art, high energy, no text, no QR code.',
  ocean:
    'Generate a square abstract artistic image for an ocean tech QR sticker: deep blues, cyan hexagonal water patterns, futuristic cool tones, no text, no QR code.',
  coffee:
    'Generate a square abstract artistic image for a coffee shop QR sticker: warm terracotta, cream and brown cozy tones, artistic texture, no text, no QR code.',
  photo:
    'Generate a square vivid abstract artistic photo texture suitable for embedding inside a QR code sticker. Bold colors, good contrast, no text, no QR code, no faces.',
  'photo-dots':
    'Generate a square colorful abstract pattern with vivid contrasting colors for a dot-matrix QR sticker texture. Bold and graphic, no text, no QR code.',
  classic:
    'Generate a square minimal abstract pattern with high contrast dark navy and white shapes for a QR sticker background texture. No text, no QR code.',
  dots:
    'Generate a square abstract dot pattern texture in navy blue and light gray for a QR sticker. Circular motif feel, no text, no QR code.',
  rounded:
    'Generate a square abstract soft rounded geometric pattern in purple and lavender for a QR sticker texture. No text, no QR code.',
};

export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } };

type GeminiResult = { dataUrl: string | null; error: string | null };

function extractImageFromResponse(data: {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}): string | null {
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const outMime = part.inlineData.mimeType ?? 'image/png';
      return `data:${outMime};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

async function callGeminiImageApi(
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[],
  aspectRatio: '1:1' | '3:4' = '1:1'
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) {
    return { dataUrl: null, error: 'GEMINI_API_KEY is not set' };
  }

  let lastError = 'AI generation failed';

  for (const model of IMAGE_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio },
            },
          }),
        }
      );

      const raw = await res.text();
      if (!res.ok) {
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string } };
          lastError = parsed.error?.message ?? raw.slice(0, 200);
        } catch {
          lastError = raw.slice(0, 200);
        }
        console.error(`Gemini image API failed (${model}):`, raw);
        continue;
      }

      const data = JSON.parse(raw) as {
        candidates?: { content?: { parts?: GeminiPart[] } }[];
      };

      const dataUrl = extractImageFromResponse(data);
      if (dataUrl) {
        return { dataUrl, error: null };
      }

      lastError = 'Gemini returned no image. Try a different style or upload a photo.';
      console.error(`Gemini image API returned no image (${model}):`, raw.slice(0, 500));
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error calling Gemini';
      console.error(`Gemini image API error (${model}):`, error);
    }
  }

  return { dataUrl: null, error: lastError };
}

export async function generateFullStickerCard(opts: {
  style: string;
  aiPrompt?: string;
  headline?: string;
  tagline?: string;
  referenceBase64?: string;
  referenceMime?: string;
}): Promise<GeminiResult> {
  const { style, aiPrompt, headline, tagline, referenceBase64, referenceMime } = opts;

  const styleHint =
    GENERATE_PROMPTS[style]?.replace(/^Generate a square abstract artistic image for /i, '') ??
    `${style} themed artistic sticker`;

  const textPrompt = `Design a complete portrait vehicle contact sticker card (3:4 aspect ratio).
Create a premium full-bleed artistic sticker like professional decorative QR sticker products.
Theme: ${styleHint}
Visual mood for headline "${headline ?? 'Scan to Contact'}" and tagline "${tagline ?? ''}".
${aiPrompt?.trim() ? `User creative direction: ${aiPrompt.trim()}` : ''}
Requirements:
- Cohesive decorated borders, patterns, icons, gradients covering the ENTIRE card
- Leave a clean light rounded square empty zone in the center (~35% width) for QR overlay — no patterns inside it
- Rich colors, polished professional look
- NO QR code, NO barcode, NO readable text, NO letters, NO numbers in the image
${referenceBase64 ? 'Use the uploaded reference image colors and subject as inspiration woven into the card design.' : ''}`;

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: textPrompt }];
  if (referenceBase64) {
    parts.push({ inlineData: { mimeType: referenceMime || 'image/png', data: referenceBase64 } });
  }

  return callGeminiImageApi(parts, '3:4');
}

export async function generateQrDesignImage(style: string, aiPrompt?: string): Promise<GeminiResult> {
  const prompt =
    GENERATE_PROMPTS[style] ??
    `Generate a square vivid abstract artistic image for a ${style} themed QR code sticker. High contrast, colorful, no text, no QR code.`;
  const full = aiPrompt?.trim() ? `${prompt}\nUser direction: ${aiPrompt.trim()}` : prompt;
  return callGeminiImageApi([{ text: full }], '1:1');
}

export async function stylizeImageForQr(
  imageBase64: string,
  mimeType: string,
  style: string,
  aiPrompt?: string
): Promise<GeminiResult> {
  const base =
    STYLE_PROMPTS[style] ??
    `Stylize this image in an artistic ${style} aesthetic for a decorative QR code sticker. Keep it vivid and recognizable. No text.`;
  const prompt = aiPrompt?.trim() ? `${base}\nUser direction: ${aiPrompt.trim()}` : base;

  const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');

  return callGeminiImageApi(
    [
      { text: prompt },
      { inlineData: { mimeType: mimeType || 'image/png', data: base64Data } },
    ],
    '3:4'
  );
}
