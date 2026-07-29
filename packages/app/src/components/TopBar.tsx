import { useEffect, useRef, useState } from "react";
import { PRESETS } from "../presets";
import { TOURS } from "../tours";
import {
  GRAPHICS_EVENT,
  loadGraphicsPrefs,
  publishGraphicsPrefs,
  requestPhotoDownload,
  type GraphicsPrefs,
  type GraphicsTierChoice
} from "../lib/graphics";
import { paramsToUrl } from "../lib/url";
import { useIsMobile } from "../lib/hooks";
import { useStore } from "../state/store";

const EQUATORIAL_EQUIPMENT = [
  ["excavator", "Excavation rover"],
  ["hauler", "Regolith hauler"],
  ["reactor", "MRE reactor"],
  ["castingYard", "Casting yard"],
  ["tanks", "Cryogenic farm"],
  ["station", "Power hub"],
  ["pad", "Landing system"],
  ["habitat", "Surface habitat"]
] as const;

const POLAR_EQUIPMENT = [
  ["excavator", "Polar ice excavator"],
  ["tents", "Sublimation camp"],
  ["receiver", "Receiver + Sabatier"],
  ["tanks", "Polar cryogenic farm"],
  ["towers", "Rim power towers"],
  ["station", "Nuclear power station"],
  ["habitat", "Polar habitat"]
] as const;

export function TopBar(): React.JSX.Element {
  const site = useStore((s) => s.params.site);
  const workspaceMode = useStore((s) => s.workspaceMode);
  const enterAuthoredSite = useStore((s) => s.enterAuthoredSite);
  const enterCustomSite = useStore((s) => s.enterCustomSite);
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
          aria-checked={workspaceMode === "authored" && site === "equatorial"}
          className={`site-btn ${workspaceMode === "authored" && site === "equatorial" ? "active" : ""}`}
          onClick={() => enterAuthoredSite("equatorial")}
        >
          EQUATORIAL
        </button>
        <button
          role="radio"
          aria-checked={workspaceMode === "authored" && site === "polar"}
          className={`site-btn polar ${workspaceMode === "authored" && site === "polar" ? "active" : ""}`}
          onClick={() => enterAuthoredSite("polar")}
        >
          POLAR
        </button>
        <button
          role="radio"
          aria-checked={workspaceMode === "custom"}
          className={`site-btn custom ${workspaceMode === "custom" ? "active" : ""}`}
          onClick={enterCustomSite}
        >
          CUSTOM SITE
        </button>
      </div>

      <div className="topbar-actions">
        {isMobile ? <MobileMenu /> : <DesktopActions />}
      </div>
    </header>
  );
}

function DesktopActions(): React.JSX.Element {
  const workspaceMode = useStore((state) => state.workspaceMode);

  if (workspaceMode === "custom") {
    return (
      <>
        <CustomViewToggle />
        <GraphicsDropdown />
        <button className="topbar-btn" onClick={() => useStore.getState().setUi({ aboutOpen: true })}>
          ABOUT
        </button>
      </>
    );
  }

  return (
    <>
      <LearnButton />
      <BriefButton />
      <EquipmentDropdown />
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

function CustomViewToggle(): React.JSX.Element {
  const viewMode = useStore((state) => state.customSite.viewMode);
  const setCustomViewMode = useStore((state) => state.setCustomViewMode);

  return (
    <div className="custom-view-toggle" role="radiogroup" aria-label="Custom site camera mode">
      <button
        role="radio"
        aria-checked={viewMode === "planner"}
        className={viewMode === "planner" ? "active" : ""}
        onClick={() => setCustomViewMode("planner")}
      >
        PLANNER
      </button>
      <button
        role="radio"
        aria-checked={viewMode === "explore"}
        className={viewMode === "explore" ? "active" : ""}
        onClick={() => setCustomViewMode("explore")}
      >
        EXPLORE
      </button>
    </div>
  );
}

function LearnButton(): React.JSX.Element {
  const active = useStore((s) => s.ui.learningMode);
  const setUi = useStore((s) => s.setUi);

  const toggle = (): void => {
    const next = !active;
    setUi({ learningMode: next });
    if (next) {
      const prefs = loadGraphicsPrefs();
      publishGraphicsPrefs({ ...prefs, brightLighting: true, daylightLock: true });
    }
  };

  return (
    <button
      className={`topbar-btn mode-btn ${active ? "active" : ""}`}
      aria-pressed={active}
      onClick={toggle}
    >
      LEARN
    </button>
  );
}

function BriefButton(): React.JSX.Element {
  return (
    <button
      className="topbar-btn"
      onClick={() => useStore.getState().setUi({ missionBriefOpen: true })}
    >
      BRIEF
    </button>
  );
}

function EquipmentDropdown(): React.JSX.Element {
  const site = useStore((s) => s.params.site);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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

  const equipment = site === "equatorial" ? EQUATORIAL_EQUIPMENT : POLAR_EQUIPMENT;

  return (
    <div className="presets" ref={ref}>
      <button className="topbar-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ASSETS ▾
      </button>
      {open && (
        <div className="presets-menu" role="menu">
          {equipment.map(([key, label]) => (
            <button
              key={key}
              role="menuitem"
              className="presets-item"
              onClick={() => {
                const store = useStore.getState();
                store.setUi({ selectedAsset: key });
                store.flyTo(key);
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
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
    const onGraphics = (event: Event): void => {
      setPrefs((event as CustomEvent<GraphicsPrefs>).detail);
    };
    window.addEventListener(GRAPHICS_EVENT, onGraphics);
    return () => window.removeEventListener(GRAPHICS_EVENT, onGraphics);
  }, []);

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
            Readability fill
          </label>
          <label className="graphics-check">
            <input
              type="checkbox"
              checked={prefs.daylightLock}
              onChange={(e) => update({ daylightLock: e.target.checked })}
            />
            Daylight lock
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
  const site = useStore((s) => s.params.site);
  const workspaceMode = useStore((s) => s.workspaceMode);
  const viewMode = useStore((s) => s.customSite.viewMode);
  const learningMode = useStore((s) => s.ui.learningMode);

  useEffect(() => {
    document.body.classList.toggle("selene-photo-mode", prefs.photoMode);
  }, [prefs.photoMode]);

  useEffect(() => {
    const onGraphics = (event: Event): void => {
      setPrefs((event as CustomEvent<GraphicsPrefs>).detail);
    };
    window.addEventListener(GRAPHICS_EVENT, onGraphics);
    return () => window.removeEventListener(GRAPHICS_EVENT, onGraphics);
  }, []);

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
          {workspaceMode === "custom" ? (
            <>
              <div className="presets-section">VIEW</div>
              {(["planner", "explore"] as const).map((mode) => (
                <button
                  key={mode}
                  role="menuitemradio"
                  aria-checked={viewMode === mode}
                  className="presets-item"
                  onClick={() => {
                    useStore.getState().setCustomViewMode(mode);
                    setOpen(false);
                  }}
                >
                  {mode === "planner"
                    ? "Planner review — top down"
                    : "Explore — orbit"}{viewMode === mode ? " ✓" : ""}
                </button>
              ))}
            </>
          ) : (
            <>
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
              <div className="presets-section">ASSETS</div>
              {(site === "equatorial" ? EQUATORIAL_EQUIPMENT : POLAR_EQUIPMENT).map(([key, label]) => (
                <button
                  key={key}
                  role="menuitem"
                  className="presets-item"
                  onClick={() => {
                    const store = useStore.getState();
                    store.setUi({ selectedAsset: key });
                    store.flyTo(key);
                    setOpen(false);
                  }}
                >
                  {label}
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
            </>
          )}
          <div className="presets-section">APP</div>
          {workspaceMode === "authored" && (
            <>
              <button
                role="menuitem"
                className="presets-item"
                onClick={() => {
                  const store = useStore.getState();
                  const next = !store.ui.learningMode;
                  store.setUi({ learningMode: next });
                  if (next) {
                    publishGraphicsPrefs({ ...loadGraphicsPrefs(), brightLighting: true, daylightLock: true });
                  }
                  setOpen(false);
                }}
              >
                Learning mode — {learningMode ? "on" : "off"}
              </button>
              <button
                role="menuitem"
                className="presets-item"
                onClick={() => {
                  useStore.getState().setUi({ missionBriefOpen: true });
                  setOpen(false);
                }}
              >
                Mission brief
              </button>
              <button
                role="menuitem"
                className="presets-item"
                onClick={() => {
                  useStore.getState().setUi({ mobileTab: "study", sheetDetent: "full" });
                  setOpen(false);
                }}
              >
                Trade study
              </button>
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
            </>
          )}
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
            onClick={() => updateGraphics({ daylightLock: !prefs.daylightLock })}
          >
            Daylight lock — {prefs.daylightLock ? "on" : "off"}
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
