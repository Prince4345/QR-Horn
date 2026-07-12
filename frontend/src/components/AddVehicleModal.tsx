import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { X, Car, Bike, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface AddVehicleModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddVehicleModal({ onClose, onAdded }: AddVehicleModalProps) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [type, setType] = useState<'car' | 'bike'>('car');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.addVehicle({ name: name.trim(), number: number.trim(), type });
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add vehicle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#111] border border-white/10 rounded-[32px] p-8 relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-bold mb-2">Add Vehicle</h2>
        <p className="text-white/50 text-sm mb-6">Register a vehicle and get a QR sticker instantly.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vehicle name (e.g. Honda City)"
            required
            className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50"
          />
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value.toUpperCase())}
            placeholder="License plate (e.g. DL 8C AA 1111)"
            required
            className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50 font-mono tracking-wider"
          />

          <div className="flex gap-3">
            {(['car', 'bike'] as const).map((t) => {
              const Icon = t === 'car' ? Car : Bike;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-3 rounded-2xl border flex items-center justify-center gap-2 capitalize ${
                    type === t ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-slate-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {t}
                </button>
              );
            })}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !number.trim()}
            className="w-full py-3 bg-blue-600 disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add & Generate QR'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
