import { isGeminiConfigured } from './gemini.js';

export interface VehicleDocExtraction {
  registrationNumber: string | null;
  plateFromPhoto: string | null;
  ownerName: string | null;
  vehicleMakeModel: string | null;
  vehicleType: 'car' | 'bike' | null;
  chassisLast4: string | null;
  confidence: number;
}

export interface VehicleDocExtractor {
  extract(rcImageDataUrl: string, plateImageDataUrl: string): Promise<VehicleDocExtraction>;
}

const VISION_MODELS = (
  process.env.GEMINI_VISION_MODEL?.trim()
    ? [process.env.GEMINI_VISION_MODEL.trim()]
    : ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash']
) as string[];

const EXTRACTION_PROMPT = `You are reading an Indian vehicle Registration Certificate (RC) and a license plate photo.

Image 1: RC document (may be paper card, smart card, or photo of RC).
Image 2: Photo of the vehicle's number plate.

Extract ONLY what you can clearly read. Return valid JSON with this exact shape:
{
  "registrationNumber": "plate on RC e.g. DL8CAA1111 or null",
  "plateFromPhoto": "plate visible in photo 2 e.g. DL8CAA1111 or null",
  "ownerName": "registered owner name on RC or null",
  "vehicleMakeModel": "make/model e.g. Honda City or null",
  "vehicleType": "car or bike or null",
  "chassisLast4": "last 4 chars of chassis number if visible or null",
  "confidence": 0.0 to 1.0 overall read confidence
}

Rules:
- registrationNumber and plateFromPhoto: uppercase, no spaces (e.g. DL8CAA1111)
- confidence below 0.5 if blurry, cropped, or unreadable
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

function parseExtraction(raw: string): VehicleDocExtraction | null {
  const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const vehicleType = data.vehicleType;
    return {
      registrationNumber:
        typeof data.registrationNumber === 'string' ? data.registrationNumber.trim() : null,
      plateFromPhoto: typeof data.plateFromPhoto === 'string' ? data.plateFromPhoto.trim() : null,
      ownerName: typeof data.ownerName === 'string' ? data.ownerName.trim() : null,
      vehicleMakeModel:
        typeof data.vehicleMakeModel === 'string' ? data.vehicleMakeModel.trim() : null,
      vehicleType: vehicleType === 'car' || vehicleType === 'bike' ? vehicleType : null,
      chassisLast4: typeof data.chassisLast4 === 'string' ? data.chassisLast4.trim() : null,
      confidence: clampConfidence(data.confidence),
    };
  } catch {
    return null;
  }
}

class GeminiVehicleDocExtractor implements VehicleDocExtractor {
  async extract(rcImageDataUrl: string, plateImageDataUrl: string): Promise<VehicleDocExtraction> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const rc = parseDataUrl(rcImageDataUrl);
    const plate = parseDataUrl(plateImageDataUrl);
    if (!rc || !plate) {
      throw new Error('Invalid image format — upload JPEG or PNG photos');
    }

    const parts = [
      { text: EXTRACTION_PROMPT },
      { inlineData: { mimeType: rc.mimeType, data: rc.base64 } },
      { inlineData: { mimeType: plate.mimeType, data: plate.base64 } },
    ];

    let lastError = 'Could not read documents';

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
        const parsed = parseExtraction(text);
        if (parsed) return parsed;
        lastError = 'AI returned unreadable data — try clearer photos';
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Network error calling Gemini';
      }
    }

    throw new Error(lastError);
  }
}

let extractor: VehicleDocExtractor | null = null;

export function getVehicleDocExtractor(): VehicleDocExtractor {
  if (!isGeminiConfigured()) {
    throw new Error('Document verification is not configured. Add GEMINI_API_KEY to the server.');
  }
  if (!extractor) extractor = new GeminiVehicleDocExtractor();
  return extractor;
}
