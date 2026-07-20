"""Generate the original SELENE MRE reactor and optimized web GLB.

Run from the repository root:
    blender --background --factory-startup --python assets/blender/mre_reactor/generate_mre_reactor.py

Only Blender primitives and procedural materials are used. No downloaded mesh,
texture, font, paid asset, or restrictively licensed source is required.
"""

from __future__ import annotations

import math
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
BLEND_PATH = SCRIPT_DIR / "mre_reactor.blend"
GLB_PATH = REPO_ROOT / "packages" / "app" / "src" / "assets" / "models" / "mre-reactor.glb"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(collection):
            collection.remove(item)


def make_material(
    name: str,
    base: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness: float,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is None:
        raise RuntimeError("Principled BSDF node is unavailable")
    node.inputs["Base Color"].default_value = base
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_input = node.inputs.get("Emission Color") or node.inputs.get("Emission")
        strength_input = node.inputs.get("Emission Strength")
        if emission_input is not None:
            emission_input.default_value = emission
        if strength_input is not None:
            strength_input.default_value = emission_strength
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(material)


def smooth(obj: bpy.types.Object) -> None:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def apply_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    if width <= 0:
        return
    modifier = obj.modifiers.new("Manufactured edge bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def add_empty(name: str, location: tuple[float, float, float], parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.35
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    bevel: float = 0.04,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_bevel(obj, bevel)
    assign_material(obj, material)
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    vertices: int = 32,
    bevel: float = 0.04,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
    shade_smooth: bool = True,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    apply_bevel(obj, bevel)
    assign_material(obj, material)
    if shade_smooth:
        smooth(obj)
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def add_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    assign_material(obj, material)
    smooth(obj)
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def add_sphere(
    name: str,
    scale: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    smooth(obj)
    parent_keep_world(obj, parent)
    return obj


def add_cone(
    name: str,
    radius_bottom: float,
    radius_top: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=40,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    apply_bevel(obj, 0.055, 3)
    assign_material(obj, material)
    smooth(obj)
    parent_keep_world(obj, parent)
    return obj


def add_strut(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    vertices: int = 12,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    obj = add_cylinder(
        name,
        radius,
        direction.length,
        tuple((a + b) * 0.5),
        material,
        vertices=vertices,
        bevel=min(radius * 0.25, 0.025),
        parent=parent,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def build_reactor() -> bpy.types.Object:
    root = add_empty("MRE_Reactor", (0.0, 0.0, 0.0))
    root["selene_asset"] = "equatorial-mre-reactor"
    root["generator"] = "assets/blender/mre_reactor/generate_mre_reactor.py"
    root["license"] = "CC0-1.0"
    root["units"] = "meters"

    foundation = make_material("MRE_Foundation", (0.115, 0.122, 0.128, 1.0), metallic=0.08, roughness=0.9)
    frame = make_material("MRE_Frame", (0.09, 0.115, 0.14, 1.0), metallic=0.78, roughness=0.29)
    vessel = make_material("MRE_Vessel", (0.22, 0.27, 0.31, 1.0), metallic=0.72, roughness=0.32)
    insulation = make_material("MRE_Insulation", (0.52, 0.56, 0.58, 1.0), metallic=0.28, roughness=0.62)
    coating = make_material("MRE_SafetyOrange", (0.82, 0.22, 0.045, 1.0), metallic=0.2, roughness=0.42)
    copper = make_material("MRE_CopperBus", (0.58, 0.18, 0.045, 1.0), metallic=0.86, roughness=0.27)
    dark = make_material("MRE_DarkService", (0.025, 0.032, 0.042, 1.0), metallic=0.48, roughness=0.5)
    ceramic = make_material("MRE_Ceramic", (0.68, 0.66, 0.59, 1.0), metallic=0.0, roughness=0.78)
    hot = make_material(
        "MRE_HotMelt",
        (0.94, 0.17, 0.025, 1.0),
        metallic=0.08,
        roughness=0.28,
        emission=(1.0, 0.08, 0.005, 1.0),
        emission_strength=2.2,
    )
    status = make_material(
        "MRE_StatusLight",
        (0.025, 0.44, 0.62, 1.0),
        metallic=0.1,
        roughness=0.25,
        emission=(0.02, 0.62, 1.0, 1.0),
        emission_strength=2.8,
    )

    # Foundation and load-spreading feet establish unambiguous ground contact.
    add_cylinder("MRE_FoundationPad", 4.65, 0.34, (0.0, 0.0, 0.17), foundation, vertices=12, bevel=0.09, parent=root)
    add_box("MRE_ServicePlinth", (6.5, 5.4, 0.24), (0.0, 0.0, 0.39), frame, bevel=0.09, parent=root)
    for index in range(6):
        angle = index * math.tau / 6 + math.pi / 6
        x = math.cos(angle) * 3.65
        y = math.sin(angle) * 3.65
        add_cylinder(f"MRE_Foot_{index + 1:02d}", 0.55, 0.24, (x, y, 0.47), frame, vertices=12, bevel=0.05, parent=root)
        add_strut(f"MRE_FrameStrut_{index + 1:02d}", (x, y, 0.58), (math.cos(angle) * 2.0, math.sin(angle) * 2.0, 1.05), 0.09, frame, root)

    add_cylinder("MRE_SupportSkirt", 2.28, 0.9, (0.0, 0.0, 1.02), dark, vertices=40, bevel=0.11, parent=root)
    for index in range(12):
        angle = index * math.tau / 12
        add_box(
            f"MRE_SkirtVent_{index + 1:02d}",
            (0.42, 0.16, 0.28),
            (math.cos(angle) * 2.26, math.sin(angle) * 2.26, 1.03),
            ceramic,
            bevel=0.035,
            rotation=(0.0, 0.0, angle),
            parent=root,
        )

    # Refractory vessel with segmented insulation and manufactured seals.
    add_cylinder("MRE_VesselBody", 2.15, 3.15, (0.0, 0.0, 2.75), vessel, vertices=48, bevel=0.2, parent=root)
    add_sphere("MRE_VesselCrown", (2.16, 2.16, 0.9), (0.0, 0.0, 4.34), vessel, root)
    add_cylinder("MRE_CrownCollar", 1.5, 0.32, (0.0, 0.0, 5.02), frame, vertices=40, bevel=0.07, parent=root)
    add_torus("MRE_UpperSeal", 2.02, 0.095, (0.0, 0.0, 4.08), frame, parent=root)
    add_torus("MRE_LowerSeal", 2.17, 0.12, (0.0, 0.0, 1.45), frame, parent=root)
    add_torus("MRE_ThermalBand", 2.19, 0.13, (0.0, 0.0, 2.22), hot, parent=root)
    for index in range(12):
        angle = index * math.tau / 12
        x = math.cos(angle) * 2.17
        y = math.sin(angle) * 2.17
        add_box(
            f"MRE_InsulationPanel_{index + 1:02d}",
            (0.66, 0.12, 1.08),
            (x, y, 3.0),
            insulation,
            bevel=0.035,
            rotation=(0.0, 0.0, angle),
            parent=root,
        )
        add_cylinder(
            f"MRE_PanelFastener_{index + 1:02d}",
            0.055,
            0.08,
            (math.cos(angle) * 2.24, math.sin(angle) * 2.24, 3.32),
            dark,
            vertices=10,
            bevel=0.01,
            rotation=(math.pi / 2, 0.0, angle),
            parent=root,
        )

    # Feed system and named gate for simulation-driven movement.
    add_cone("MRE_FeedHopper", 0.62, 1.18, 1.05, (0.0, 0.0, 5.62), frame, root)
    add_cylinder("MRE_HopperCap", 1.18, 0.18, (0.0, 0.0, 6.14), coating, vertices=32, bevel=0.055, parent=root)
    feed_gate = add_empty("MRE_FeedGate", (0.0, -0.82, 5.62), root)
    add_box("MRE_FeedGateBlade", (1.12, 0.16, 0.22), (0.0, -0.82, 5.62), coating, bevel=0.035, parent=feed_gate)
    add_cylinder("MRE_FeedMotor", 0.24, 0.48, (0.78, -0.82, 5.62), dark, vertices=20, bevel=0.04, rotation=(0.0, math.pi / 2, 0.0), parent=root)

    # Service deck, rails, ladder, and cabinet supply human scale.
    add_cylinder("MRE_ServiceDeck", 2.85, 0.16, (0.0, 0.0, 2.08), frame, vertices=48, bevel=0.045, parent=root)
    add_torus("MRE_DeckEdge", 2.78, 0.06, (0.0, 0.0, 2.14), coating, parent=root)
    for height in (2.68, 3.15):
        add_torus(f"MRE_Handrail_{height:.2f}", 2.72, 0.035, (0.0, 0.0, height), frame, parent=root)
    for index in range(16):
        angle = index * math.tau / 16
        x = math.cos(angle) * 2.72
        y = math.sin(angle) * 2.72
        add_strut(f"MRE_RailPost_{index + 1:02d}", (x, y, 2.13), (x, y, 3.16), 0.035, frame, root, vertices=8)
    add_box("MRE_AccessHatch", (1.05, 0.18, 1.42), (0.0, -2.19, 3.0), dark, bevel=0.08, parent=root)
    add_box("MRE_HatchInset", (0.68, 0.05, 0.94), (0.0, -2.30, 3.0), coating, bevel=0.045, parent=root)
    add_box("MRE_ControlCabinet", (1.05, 0.72, 1.48), (-3.0, -0.72, 1.25), insulation, bevel=0.08, parent=root)
    add_box("MRE_CabinetFace", (0.72, 0.05, 0.96), (-3.0, -1.105, 1.28), dark, bevel=0.035, parent=root)
    for index in range(3):
        add_cylinder(
            f"MRE_CabinetLamp_{index + 1:02d}",
            0.065,
            0.04,
            (-3.22 + index * 0.22, -1.145, 1.48),
            status if index == 0 else coating,
            vertices=12,
            bevel=0.01,
            rotation=(math.pi / 2, 0.0, 0.0),
            parent=root,
        )
    for side in (-1.0, 1.0):
        add_strut(f"MRE_LadderRail_{'L' if side < 0 else 'R'}", (side * 0.34, -2.98, 0.45), (side * 0.34, -2.98, 2.18), 0.045, frame, root, vertices=10)
    for index in range(7):
        z = 0.58 + index * 0.24
        add_strut(f"MRE_LadderRung_{index + 1:02d}", (-0.34, -2.98, z), (0.34, -2.98, z), 0.035, frame, root, vertices=10)

    # High-current bus bars and product lines communicate function.
    for side in (-1.0, 1.0):
        add_box(
            f"MRE_BusBar_{'L' if side < 0 else 'R'}",
            (0.16, 3.5, 0.24),
            (side * 2.46, 0.0, 1.64),
            copper,
            bevel=0.04,
            parent=root,
        )
        add_strut(
            f"MRE_BusLink_{'L' if side < 0 else 'R'}",
            (side * 2.46, -1.52, 1.64),
            (side * 3.0, -0.72, 1.64),
            0.09,
            copper,
            root,
            vertices=12,
        )
    add_strut("MRE_OxygenLine", (-1.45, 1.72, 4.3), (-3.25, 1.72, 1.1), 0.12, status, root, vertices=16)
    add_cylinder("MRE_OxygenManifold", 0.3, 0.7, (-3.25, 1.72, 0.95), frame, vertices=24, bevel=0.06, parent=root)
    add_strut("MRE_SlagTap", (2.02, -1.05, 1.42), (3.18, -1.65, 0.86), 0.2, ceramic, root, vertices=20)

    tap_valve = add_empty("MRE_TapValve", (2.52, -1.52, 1.36), root)
    add_torus("MRE_TapValveWheel", 0.36, 0.05, (2.52, -1.52, 1.36), coating, rotation=(math.pi / 2, 0.0, 0.0), parent=tap_valve)
    for angle in (0.0, math.pi / 2):
        add_strut(
            f"MRE_ValveSpoke_{angle:.2f}",
            (2.52 - math.cos(angle) * 0.31, -1.52, 1.36 - math.sin(angle) * 0.31),
            (2.52 + math.cos(angle) * 0.31, -1.52, 1.36 + math.sin(angle) * 0.31),
            0.025,
            coating,
            tap_valve,
            vertices=8,
        )
    add_cylinder("MRE_Gauge", 0.31, 0.11, (1.36, -2.1, 3.72), ceramic, vertices=32, bevel=0.035, rotation=(math.pi / 2, 0.0, 0.0), parent=root)
    gauge_needle = add_empty("MRE_GaugeNeedle", (1.36, -2.18, 3.72), root)
    add_box("MRE_GaugeNeedleBlade", (0.035, 0.035, 0.23), (1.36, -2.21, 3.82), coating, bevel=0.01, parent=gauge_needle)
    add_cylinder("MRE_StatusBeaconBase", 0.16, 0.18, (-1.3, -2.03, 4.15), dark, vertices=20, bevel=0.035, parent=root)
    add_cylinder("MRE_StatusBeacon", 0.12, 0.24, (-1.3, -2.03, 4.35), status, vertices=20, bevel=0.055, parent=root)

    for index in range(8):
        angle = index * math.tau / 8 + math.pi / 8
        add_box(
            f"MRE_FoundationMarker_{index + 1:02d}",
            (0.7, 0.16, 0.06),
            (math.cos(angle) * 4.18, math.sin(angle) * 4.18, 0.39),
            coating,
            bevel=0.018,
            rotation=(0.0, 0.0, angle),
            parent=root,
        )

    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj["selene_cast_shadow"] = True
            obj["selene_receive_shadow"] = True
    return root


def export_glb(path: Path, *, optimized: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_extras=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_meshopt_compression_enable=optimized,
        export_meshopt_extension="EXT_meshopt_compression",
        export_loglevel=-1,
        check_existing=False,
    )


def main() -> None:
    reset_scene()
    build_reactor()
    bpy.context.scene["selene_generator_version"] = 1
    bpy.context.scene["selene_license"] = "CC0-1.0"
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

    with tempfile.TemporaryDirectory(prefix="selene-mre-") as temp_dir:
        raw_path = Path(temp_dir) / "mre-reactor-unoptimized.glb"
        export_glb(raw_path, optimized=False)
        export_glb(GLB_PATH, optimized=True)
        print(f"SELENE_MRE_RAW_BYTES={raw_path.stat().st_size}")
    print(f"SELENE_MRE_OPTIMIZED_BYTES={GLB_PATH.stat().st_size}")
    print(f"SELENE_MRE_BLEND={BLEND_PATH}")
    print(f"SELENE_MRE_GLB={GLB_PATH}")


if __name__ == "__main__":
    main()
