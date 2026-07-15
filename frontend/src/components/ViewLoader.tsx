import { Loader2 } from 'lucide-react';

export default function ViewLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
    </div>
  );
}
