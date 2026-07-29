import { Component, type ErrorInfo, type ReactNode } from "react";
import { serializeSiteDesign } from "@selene-isru/engine";
import { downloadText } from "../analysis/studyExport";
import { loadCustomSiteDraft } from "../site-design/draft";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[selene] interface error", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    const recoveryDraft = loadCustomSiteDraft();
    return (
      <main className="app-recovery" role="alert">
        <p className="custom-eyebrow">SELENE SAFE RECOVERY</p>
        <h1>The interface needs a restart.</h1>
        <p>
          Your custom site is autosaved locally and was not cleared by this
          error. Export the recovery copy now, or reload the application.
        </p>
        <div className="app-recovery-actions">
          <button onClick={() => window.location.reload()}>
            RELOAD APPLICATION
          </button>
          <button
            disabled={recoveryDraft === null}
            onClick={() => {
              if (recoveryDraft === null) {
                return;
              }
              downloadText(
                "selene-custom-site-recovery.json",
                serializeSiteDesign(recoveryDraft),
                "application/json"
              );
            }}
          >
            EXPORT RECOVERY DESIGN
          </button>
        </div>
        <details>
          <summary>Technical detail</summary>
          <code>{this.state.error.message || "Unknown application error"}</code>
        </details>
      </main>
    );
  }
}
