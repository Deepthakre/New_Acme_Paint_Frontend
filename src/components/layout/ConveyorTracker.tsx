import { JOURNEY_STAGES } from '../../lib/constants';
import { IconFactory, IconTruck, IconStorefront, IconCheck } from '../ui/Icons';

interface ConveyorTrackerProps {
  current: string;
}

const STAGE_ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  FACTORY: IconFactory,
  TRANSIT: IconTruck,
  DEALER: IconStorefront,
  SOLD: IconCheck,
};

/**
 * Small horizontal stage tracker used on the Verify page and product
 * detail views. `current` is one of FACTORY | TRANSIT | DEALER | SOLD.
 */
export default function ConveyorTracker({ current }: ConveyorTrackerProps) {
  const idx = JOURNEY_STAGES.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 my-5" role="list" aria-label="Product journey">
      {JOURNEY_STAGES.map((s, i) => {
        const reached = i <= idx;
        const Icon = STAGE_ICONS[s.key];
        return (
          <div key={s.key} className="flex items-center flex-1" role="listitem">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  reached ? 'bg-green border-green text-white shadow-sm shadow-green/25' : 'bg-white border-line text-ink-faint'
                }`}
              >
                {Icon && <Icon className="w-[18px] h-[18px]" />}
              </div>
              <span className={`text-[10px] font-semibold text-center max-w-[76px] leading-tight ${reached ? 'text-ink' : 'text-ink-faint'}`}>
                {s.label}
              </span>
            </div>
            {i < JOURNEY_STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 rounded-full transition-colors ${i < idx ? 'bg-green' : 'bg-line'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
