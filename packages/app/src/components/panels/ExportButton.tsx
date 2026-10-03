import { downloadText } from "../../analysis/studyExport";
import { BUILD_INFO } from "../../lib/build";
import { fileStem } from "../../analysis/caseExport";
import { useStore } from "../../state/store";

interface ExportButtonProps {
  label: string;
  /** what the file holds, e.g. "energy-flows"; the case name and build are appended */
  what: string;
  /** built on click so exports never cost a render */
  build: () => string;
  title?: string;
}

/** Download the data behind a panel as CSV, named for the case and the build that made it. */
export function ExportButton({ label, what, build, title }: ExportButtonProps): React.JSX.Element {
  const caseName = useStore((s) => s.ui.currentScenarioName);
  return (
    <button
      type="button"
      className="topbar-btn panel-export"
      title={title ?? `Download ${label.toLowerCase()} for this case`}
      onClick={() => downloadText(`selene-${what}-${fileStem(caseName)}-${BUILD_INFO.commit}.csv`, build(), "text/csv")}
    >
      {label}
    </button>
  );
}
