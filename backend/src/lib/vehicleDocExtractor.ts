import { isGeminiConfigured } from './gemini.js';

export interface RcExtraction {
  registrationNumber: string | null;
  ownerName: string | null;
  vehicleMakeModel: string | null;
  vehicleType: 'car' | 'bike' | null;
  chassisLast4: string | null;
  confidence: number;
}

export interface PlateExtraction {
  plateFromPhoto: string | null;
  confidence: number;
}

const VISION_MODELS = (
  process.env.GEMINI_VISION_MODEL?.trim()
    ? [process.env.GEMINI_VISION_MODEL.trim()]
    : ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash']
) as string[];

const RC_PROMPT = `You are reading an Indian vehicle Registration Certificate (RC).
Image: RC document (paper card, smart card, or photo of RC).

Extract ONLY what you can clearly read. Return valid JSON:
{
  "registrationNumber": "plate on RC e.g. DL8CAA1111 or null",
  "ownerName": "registered owner name on RC or null",
  "vehicleMakeModel": "make/model e.g. Honda City or null",
  "vehicleType": "car or bike or null",
  "chassisLast4": "last 4 chars of chassis number if visible or null",
  "confidence": 0.0 to 1.0
}

Rules:
- registrationNumber: uppercase, no spaces (e.g. DL8CAA1111)
- confidence below 0.5 if blurry, cropped, or unreadable
- JSON only, no markdown`;

const PLATE_PROMPT = `You are reading a photo of an Indian vehicle license plate.

Extract ONLY the plate number. Return valid JSON:
{
  "plateFromPhoto": "e.g. DL8CAA1111 or null",
  "confidence": 0.0 to 1.0
}

Rules:
- plateFromPhoto: uppercase, no spaces
- confidence below 0.5 if blurry or unreadable
- JSON only, no markdown`;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

async function callGeminiVision(
  prompt: string,
  imageDataUrl: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const image = parseDataUrl(imageDataUrl);
  if (!image) throw new Error('Invalid image format — upload JPEG or PNG photos');

  const parts = [
    { text: prompt },
    { inlineData: { mimeType: image.mimeType, data: image.base64 } },
  ];

  let lastError = 'Could not read image';

  for (const model of VISION_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
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
        continue;
      }

      const data = JSON.parse(raw) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
      const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      try {
        return JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        lastError = 'AI returned unreadable data — try a clearer photo';
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error calling Gemini';
    }
  }

  throw new Error(lastError);
}

export async function extractRcDocument(rcImageDataUrl: string): Promise<RcExtraction> {
  if (!isGeminiConfigured()) {
    throw new Error('Document verification is not configured. Add GEMINI_API_KEY to the server.');
  }
  const data = await callGeminiVision(RC_PROMPT, rcImageDataUrl);
  const vehicleType = data.vehicleType;
  return {
    registrationNumber:
      typeof data.registrationNumber === 'string' ? data.registrationNumber.trim() : null,
    ownerName: typeof data.ownerName === 'string' ? data.ownerName.trim() : null,
    vehicleMakeModel:
      typeof data.vehicleMakeModel === 'string' ? data.vehicleMakeModel.trim() : null,
    vehicleType: vehicleType === 'car' || vehicleType === 'bike' ? vehicleType : null,
    chassisLast4: typeof data.chassisLast4 === 'string' ? data.chassisLast4.trim() : null,
    confidence: clampConfidence(data.confidence),
  };
}

export async function extractPlatePhoto(plateImageDataUrl: string): Promise<PlateExtraction> {
  if (!isGeminiConfigured()) {
    throw new Error('Document verification is not configured. Add GEMINI_API_KEY to the server.');
  }
  const data = await callGeminiVision(PLATE_PROMPT, plateImageDataUrl);
  return {
    plateFromPhoto: typeof data.plateFromPhoto === 'string' ? data.plateFromPhoto.trim() : null,
    confidence: clampConfidence(data.confidence),
  };
}
