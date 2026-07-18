import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, Trash2 } from 'lucide-react';
import { api, type Vehicle } from '../lib/api';

interface EditVehicleModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditVehicleModal({ vehicle, onClose, onSaved }: EditVehicleModalProps) {
  const [name, setName] = useState(vehicle.name);
  const [number, setNumber] = useState(vehicle.number);
  const [active, setActive] = useState(vehicle.active);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.updateVehicle(vehicle.id, {
        name: name.trim(),
        number: number.trim(),
        active,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${vehicle.name}? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteVehicle(vehicle.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete vehicle');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/40">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface border border-line rounded-[32px] p-8 relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-ink">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-bold mb-2">Edit Vehicle</h2>
        <p className="text-muted text-sm mb-6">Update name, plate, or pause public contact.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vehicle name"
            required
            className="w-full px-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
          />
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value.toUpperCase())}
            placeholder="License plate"
            required
            className="w-full px-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50 font-mono tracking-wider"
          />

          <button
            type="button"
            onClick={() => setActive((v) => !v)}
            className="w-full p-4 rounded-2xl border border-line bg-surface flex items-center justify-between text-left"
          >
            <div>
              <p className="text-sm font-medium">{active ? 'Active' : 'Inactive'}</p>
              <p className="text-xs text-faint">
                {active ? 'Scanners can contact this vehicle' : 'Hidden from public scan & plate lookup'}
              </p>
            </div>
            <div className={`w-12 h-6 rounded-full relative shrink-0 transition-colors ${active ? 'bg-emerald-500' : 'bg-soft'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-7' : 'left-1'}`} />
            </div>
          </button>

          {error && <p className="text-brand text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || deleting || !name.trim() || !number.trim()}
            className="w-full py-3 bg-brand disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || deleting}
            className="w-full py-3 bg-red-600/20 border border-brand/25 text-brand disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete vehicle
          </button>
        </form>
      </motion.div>
    </div>
  );
}
