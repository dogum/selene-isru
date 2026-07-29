import { describe, expect, it, vi } from "vitest";
import { CustomAssetModel } from "../src/viewer/assets/CustomAssetModel";

describe("custom asset model fallbacks", () => {
  it("uses a selectable lightweight model when the detail budget is exhausted", () => {
    const ready = vi.fn();
    const model = new CustomAssetModel(
      "equatorial.excavator",
      ready,
      false
    );

    expect(model.renderStatus).toBe("simplified");
    expect(model.group.children.length).toBeGreaterThan(0);
    expect(model.group.userData.assetRenderStatus).toBe("simplified");
    expect(ready).toHaveBeenCalledOnce();
    model.dispose();
  });

  it("retains fallback geometry when a catalog kind has no GLB", async () => {
    const ready = vi.fn();
    const model = new CustomAssetModel("future.unresolved-asset", ready);

    expect(model.renderStatus).toBe("loading");
    await vi.waitFor(() => expect(model.renderStatus).toBe("fallback"));
    expect(model.group.children.length).toBeGreaterThan(0);
    expect(ready).toHaveBeenCalledOnce();
    model.dispose();
  });
});
