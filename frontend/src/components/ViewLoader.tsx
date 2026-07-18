import { Loader2 } from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function ViewLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <BrandLogo size="lg" className="opacity-90" />
      <Loader2 className="w-8 h-8 animate-spin text-brand" />
    </div>
  );
}
