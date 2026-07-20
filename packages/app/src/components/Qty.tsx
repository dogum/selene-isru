import { formatQty } from "../lib/format";
import { useCountUp } from "../lib/hooks";

interface QtyProps {
  value: number;
  unit: string;
  sig?: number;
  /** animate value changes with the 200ms count-up tween */
  animate?: boolean;
  className?: string;
}

/** The one sanctioned way to render `24.7 KWH/KG` (§8.7). */
export function Qty({ value, unit, sig = 3, animate = false, className }: QtyProps): React.JSX.Element {
  const shown = useCountUp(value, animate ? 200 : 0);
  const q = formatQty(shown, unit, sig);
  return (
    <span className={`qty num ${className ?? ""}`}>
      {q.value}
      {q.unit.length > 0 ? <span className="unit">{" "}{q.unit}</span> : null}
    </span>
  );
}
