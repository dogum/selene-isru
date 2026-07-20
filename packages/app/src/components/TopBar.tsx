import { useEffect, useRef, useState } from "react";
import { PRESETS } from "../presets";
import { TOURS } from "../tours";
import {
  loadGraphicsPrefs,
  publishGraphicsPrefs,
  requestPhotoDownload,
  type GraphicsPrefs,
  type GraphicsTierChoice
} from "../lib/graphics";
import { paramsToUrl } from "../lib/url";
import { useIsMobile } from "../lib/hooks";
import { useStore } from "../state/store";

export function TopBar(): React.JSX.Element {
  const site = useStore((s) => s.params.site);
  const setParam = useStore((s) => s.setParam);
  const isMobile = useIsMobile();

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <span className="topbar-mark" aria-hidden="true" />
        SELENE-ISRU
        {!isMobile && <span className="topbar-sub">LUNAR TRADE-SPACE SIMULATOR</span>}
      </div>

      <div className="topbar-site" role="radiogroup" aria-label="Site mode">
        <button
          role="radio"
          aria-checked={site === "equatorial"}
          className={`site-btn ${site === "equatorial" ? "active" : ""}`}
          onClick={() => setParam("site", "equatorial")}
        >
          EQUATORIAL
        </button>
        <button
          role="radio"
          aria-checked={site === "polar"}
          className={`site-btn polar ${site === "polar" ? "active" : ""}`}
          onClick={() => setParam("site", "polar")}
        >
          POLAR
        </button>
      </div>

      <div className="topbar-actions">
        {isMobile ? <MobileMenu /> : <DesktopActions />}
      </div>
    </header>
  );
}

function DesktopActions(): React.JSX.Element {
  return (
    <>
      <TourDropdown />
      <PresetsDropdown />
      <GraphicsDropdown />
      <ShareButton />
      <button className="topbar-btn" onClick={() => useStore.getState().setUi({ aboutOpen: true })}>
        ABOUT
      </button>
    </>
  );
}

function GraphicsDropdown(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<GraphicsPrefs>(() => loadGraphicsPrefs());
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.classList.toggle("selene-photo-mode", prefs.photoMode);
  }, [prefs.photoMode]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const update = (patch: Partial<GraphicsPrefs>): void => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    publishGraphicsPrefs(next);
  };

  return (
    <div className="presets" ref={ref}>
      <button className="topbar-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        GRAPHICS ▾
      </button>
      {open && (
        <div className="presets-menu graphics-menu" role="menu">
          <label className="graphics-row">
            <span>Tier</span>
            <select
              value={prefs.tier}
              onChange={(e) => update({ tier: e.target.value as GraphicsTierChoice })}
              aria-label="Graphics tier"
            >
              <option value="auto">Auto</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </label>
          <label className="graphics-check">
            <input type="checkbox" checked={prefs.bloom} onChange={(e) => update({ bloom: e.target.checked })} />
            Bloom
          </label>
          <label className="graphics-check">
            <input
              type="checkbox"
              checked={prefs.brightLighting}
              onChange={(e) => update({ brightLighting: e.target.checked })}
            />
            Bright lighting
          </label>
          <label className="graphics-check">
            <input type="checkbox" checked={prefs.hud} onChange={(e) => update({ hud: e.target.checked })} />
            Dev HUD
          </label>
          <label className="graphics-check">
            <input
              type="checkbox"
              checked={prefs.photoMode}
              onChange={(e) => update({ photoMode: e.target.checked })}
            />
            Photo mode
          </label>
          <button className="presets-item" onClick={() => requestPhotoDownload()}>
            Download PNG
          </button>
        </div>
      )}
    </div>
  );
}

function TourDropdown(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const startTour = useStore((s) => s.startTour);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  return (
    <div className="presets" ref={ref}>
      <button className="topbar-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        TOURS ▾
      </button>
      {open && (
        <div className="presets-menu" role="menu">
          {TOURS.map((tour) => (
            <button
              key={tour.id}
              role="menuitem"
              className="presets-item"
              onClick={() => {
                startTour(tour.id);
                setOpen(false);
              }}
            >
              {tour.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PresetsDropdown(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const applyPatch = useStore((s) => s.applyPatch);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  return (
    <div className="presets" ref={ref}>
      <button className="topbar-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        PRESETS ▾
      </button>
      {open && (
        <div className="presets-menu" role="menu">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              className="presets-item"
              onClick={() => {
                applyPatch(p.patch);
                setOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShareButton(): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`topbar-btn ${copied ? "copied" : ""}`}
      onClick={() => {
        const url = paramsToUrl(useStore.getState().params);
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
    >
      {copied ? "COPIED" : "SHARE"}
    </button>
  );
}

function MobileMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<GraphicsPrefs>(() => loadGraphicsPrefs());
  const ref = useRef<HTMLDivElement | null>(null);
  const applyPatch = useStore((s) => s.applyPatch);

  useEffect(() => {
    document.body.classList.toggle("selene-photo-mode", prefs.photoMode);
  }, [prefs.photoMode]);

  const updateGraphics = (patch: Partial<GraphicsPrefs>): void => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    publishGraphicsPrefs(next);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  return (
    <div className="presets" ref={ref}>
      <button className="topbar-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="presets-menu" role="menu">
          <div className="presets-section">TOURS</div>
          {TOURS.map((tour) => (
            <button
              key={tour.id}
              role="menuitem"
              className="presets-item"
              onClick={() => {
                useStore.getState().startTour(tour.id);
                setOpen(false);
              }}
            >
              {tour.label}
            </button>
          ))}
          <div className="presets-section">PRESETS</div>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              className="presets-item"
              onClick={() => {
                applyPatch(p.patch);
                setOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
          <div className="presets-section">APP</div>
          <button
            role="menuitem"
            className="presets-item"
            onClick={() => {
              const url = paramsToUrl(useStore.getState().params);
              void navigator.clipboard.writeText(url);
              setOpen(false);
            }}
          >
            Share — copy link
          </button>
          <button
            role="menuitem"
            className="presets-item"
            onClick={() => {
              useStore.getState().setUi({ aboutOpen: true });
              setOpen(false);
            }}
          >
            About
          </button>
          <div className="presets-section">GRAPHICS</div>
          <button
            role="menuitem"
            className="presets-item"
            onClick={() => updateGraphics({ tier: prefs.tier === "auto" ? "medium" : "auto" })}
          >
            Tier — {prefs.tier}
          </button>
          <button
            role="menuitem"
            className="presets-item"
            onClick={() => updateGraphics({ bloom: !prefs.bloom })}
          >
            Bloom — {prefs.bloom ? "on" : "off"}
          </button>
          <button
            role="menuitem"
            className="presets-item"
            onClick={() => updateGraphics({ photoMode: !prefs.photoMode })}
          >
            Photo mode — {prefs.photoMode ? "on" : "off"}
          </button>
          <button role="menuitem" className="presets-item" onClick={() => requestPhotoDownload()}>
            Download PNG
          </button>
        </div>
      )}
    </div>
  );
}
