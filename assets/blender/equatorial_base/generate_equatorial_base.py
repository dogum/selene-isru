"""Generate the original SELENE equatorial-base equipment library.

Run from the repository root:
    blender --background --factory-startup --python assets/blender/equatorial_base/generate_equatorial_base.py

The seven exported assets use only Blender primitives and procedural materials.
No downloaded mesh, texture, font, paid asset, or restrictively licensed source
is required. Every output is rebuilt from this script and released under CC0-1.0.
"""

from __future__ import annotations

import math
import json
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
MODEL_DIR = REPO_ROOT / "packages" / "app" / "src" / "assets" / "models"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(collection):
            collection.remove(item)


def material(
    name: str,
    base: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.55,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = base
    node = mat.node_tree.nodes.get("Principled BSDF")
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
    return mat


def palette(prefix: str) -> dict[str, bpy.types.Material]:
    return {
        "foundation": material(f"{prefix}_Foundation", (0.105, 0.115, 0.125, 1), metallic=0.12, roughness=0.88),
        "frame": material(f"{prefix}_Frame", (0.105, 0.14, 0.17, 1), metallic=0.76, roughness=0.31),
        "body": material(f"{prefix}_Body", (0.47, 0.52, 0.55, 1), metallic=0.58, roughness=0.39),
        "white": material(f"{prefix}_ThermalWhite", (0.74, 0.76, 0.72, 1), metallic=0.18, roughness=0.58),
        "dark": material(f"{prefix}_DarkService", (0.025, 0.035, 0.048, 1), metallic=0.5, roughness=0.5),
        "orange": material(f"{prefix}_SafetyOrange", (0.9, 0.26, 0.035, 1), metallic=0.16, roughness=0.42),
        "copper": material(f"{prefix}_Copper", (0.62, 0.22, 0.055, 1), metallic=0.88, roughness=0.27),
        "regolith": material(f"{prefix}_Regolith", (0.25, 0.235, 0.21, 1), metallic=0.0, roughness=0.98),
        "status": material(
            f"{prefix}_StatusLight",
            (0.02, 0.42, 0.64, 1),
            metallic=0.08,
            roughness=0.23,
            emission=(0.01, 0.6, 1.0, 1),
            emission_strength=2.8,
        ),
        "warm": material(
            f"{prefix}_WarmLight",
            (0.96, 0.22, 0.03, 1),
            metallic=0.08,
            roughness=0.24,
            emission=(1.0, 0.12, 0.01, 1),
            emission_strength=2.4,
        ),
    }


def assign(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    if hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def smooth(obj: bpy.types.Object) -> None:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    if width <= 0:
        return
    mod = obj.modifiers.new("Manufactured edge bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def parent_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def empty(
    name: str,
    location: tuple[float, float, float] = (0, 0, 0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.35
    if parent is not None:
        parent_world(obj, parent)
    return obj


def box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    edge: float = 0.04,
    rotation: tuple[float, float, float] = (0, 0, 0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, edge)
    assign(obj, mat)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    vertices: int = 24,
    edge: float = 0.035,
    rotation: tuple[float, float, float] = (0, 0, 0),
    parent: bpy.types.Object | None = None,
    shade: bool = True,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    bevel(obj, edge)
    assign(obj, mat)
    if shade:
        smooth(obj)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def sphere(
    name: str,
    scale: tuple[float, float, float],
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
    segments: int = 32,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(12, segments // 2), location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    smooth(obj)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def cone(
    name: str,
    radius_bottom: float,
    radius_top: float,
    depth: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=28,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    bevel(obj, 0.045)
    assign(obj, mat)
    smooth(obj)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=32,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    smooth(obj)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def strut(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    vertices: int = 12,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    obj = cylinder(
        name,
        radius,
        direction.length,
        tuple((a + b) * 0.5),
        mat,
        vertices=vertices,
        edge=min(0.02, radius * 0.2),
        parent=parent,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def wheel(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    width: float,
    mats: dict[str, bpy.types.Material],
    parent: bpy.types.Object,
) -> None:
    cylinder(name, radius, width, location, mats["dark"], vertices=20, edge=0.06, rotation=(math.pi / 2, 0, 0), parent=parent)
    cylinder(f"{name}_Hub", radius * 0.38, width + 0.04, location, mats["orange"], vertices=16, edge=0.025, rotation=(math.pi / 2, 0, 0), parent=parent)
    for index in range(10):
        angle = index * math.tau / 10
        x = location[0] + math.cos(angle) * radius * 0.78
        z = location[2] + math.sin(angle) * radius * 0.78
        box(f"{name}_Tread_{index + 1:02d}", (0.18, width + 0.09, 0.1), (x, location[1], z), mats["body"], edge=0.015, rotation=(0, angle, 0), parent=parent)


def mark_root(root: bpy.types.Object, asset_id: str) -> None:
    root["selene_asset"] = asset_id
    root["generator"] = "assets/blender/equatorial_base/generate_equatorial_base.py"
    root["license"] = "CC0-1.0"
    root["units"] = "meters"


def build_excavator() -> bpy.types.Object:
    p = palette("EXC")
    root = empty("Excavator")
    mark_root(root, "equatorial-excavator")
    box("Excavator_Chassis", (3.8, 2.25, 0.48), (0, 0, 0.9), p["frame"], edge=0.13, parent=root)
    box("Excavator_BellyPan", (3.15, 1.75, 0.24), (-0.1, 0, 0.54), p["dark"], edge=0.08, parent=root)
    for axle, x in enumerate((-1.35, 0, 1.35), start=1):
        for side in (-1, 1):
            wheel(f"Excavator_Wheel_{axle}_{'L' if side < 0 else 'R'}", (x, side * 1.15, 0.55), 0.58, 0.38, p, root)
    box("Excavator_Deck", (2.5, 1.85, 0.18), (-0.45, 0, 1.26), p["white"], edge=0.06, parent=root)
    box("Excavator_Cab", (1.35, 1.58, 1.35), (-0.72, 0, 2.0), p["body"], edge=0.18, parent=root)
    box("Excavator_CabWindowFront", (0.06, 1.15, 0.72), (0.0, 0, 2.12), p["dark"], edge=0.04, parent=root)
    box("Excavator_CabWindowSide", (0.9, 0.05, 0.7), (-0.7, -0.82, 2.12), p["dark"], edge=0.04, parent=root)
    cylinder("Excavator_LidarMast", 0.08, 0.95, (-0.8, 0.45, 3.06), p["frame"], vertices=12, parent=root)
    cylinder("Excavator_LidarHead", 0.25, 0.22, (-0.8, 0.45, 3.58), p["status"], vertices=20, parent=root)
    boom = empty("Excavator_BoomPivot", (0.7, 0, 1.62), root)
    strut("Excavator_BoomUpper", (0.7, -0.42, 1.62), (2.7, -0.42, 2.05), 0.16, p["orange"], boom)
    strut("Excavator_BoomLower", (0.7, 0.42, 1.62), (2.7, 0.42, 2.05), 0.16, p["orange"], boom)
    strut("Excavator_HydraulicRam", (0.95, 0, 1.88), (2.2, 0, 1.42), 0.1, p["body"], boom)
    bucket = empty("Excavator_BucketPivot", (2.7, 0, 2.05), boom)
    strut("Excavator_Dipper", (2.7, -0.38, 2.05), (3.55, -0.38, 0.72), 0.14, p["frame"], bucket)
    strut("Excavator_DipperTwin", (2.7, 0.38, 2.05), (3.55, 0.38, 0.72), 0.14, p["frame"], bucket)
    box("Excavator_Bucket", (0.85, 1.55, 0.62), (3.82, 0, 0.54), p["regolith"], edge=0.1, rotation=(0, -0.18, 0), parent=bucket)
    for index, y in enumerate((-0.62, -0.2, 0.2, 0.62), start=1):
        cone(f"Excavator_BucketTooth_{index:02d}", 0.12, 0.035, 0.48, (4.35, y, 0.34), p["body"], rotation=(0, math.pi / 2, 0), parent=bucket)
    for side in (-1, 1):
        box(f"Excavator_WorkLight_{side:+}", (0.16, 0.12, 0.16), (0.06, side * 0.67, 2.63), p["status"], edge=0.035, parent=root)
    return root


def build_hauler() -> bpy.types.Object:
    p = palette("HAUL")
    root = empty("Hauler")
    mark_root(root, "equatorial-hauler")
    box("Hauler_Chassis", (4.4, 2.3, 0.5), (0, 0, 0.9), p["frame"], edge=0.14, parent=root)
    for axle, x in enumerate((-1.55, 0, 1.55), start=1):
        for side in (-1, 1):
            wheel(f"Hauler_Wheel_{axle}_{'L' if side < 0 else 'R'}", (x, side * 1.18, 0.57), 0.59, 0.4, p, root)
    box("Hauler_Cab", (1.35, 1.75, 1.35), (1.35, 0, 1.8), p["white"], edge=0.18, parent=root)
    box("Hauler_CabGlass", (0.07, 1.3, 0.7), (2.04, 0, 1.95), p["dark"], edge=0.035, parent=root)
    bed = empty("Hauler_BedPivot", (-0.65, 0, 1.25), root)
    box("Hauler_BedFloor", (2.75, 1.92, 0.2), (-0.72, 0, 1.42), p["body"], edge=0.08, parent=bed)
    for side in (-1, 1):
        box("Hauler_BedSide_L" if side < 0 else "Hauler_BedSide_R", (2.75, 0.16, 0.82), (-0.72, side * 0.92, 1.78), p["body"], edge=0.07, rotation=(0, -0.08, 0), parent=bed)
    box("Hauler_BedBulkhead", (0.18, 1.92, 0.86), (-2.04, 0, 1.82), p["orange"], edge=0.06, parent=bed)
    empty("Hauler_LoadAnchor", (-0.72, 0, 1.65), bed)
    strut("Hauler_TipRam", (-0.25, 0, 1.15), (-1.4, 0, 1.65), 0.11, p["copper"], root)
    cylinder("Hauler_Antenna", 0.045, 1.1, (1.2, 0.55, 3.02), p["frame"], vertices=10, parent=root)
    sphere("Hauler_AntennaHead", (0.16, 0.16, 0.16), (1.2, 0.55, 3.57), p["status"], parent=root, segments=20)
    return root


def build_casting_yard() -> bpy.types.Object:
    p = palette("CAST")
    root = empty("CastingYard")
    mark_root(root, "equatorial-casting-yard")
    box("Casting_Foundation", (9.4, 6.8, 0.28), (0, 0, 0.14), p["foundation"], edge=0.1, parent=root)
    box("Casting_ServiceApron", (8.6, 6, 0.12), (0, 0, 0.34), p["frame"], edge=0.06, parent=root)
    for x in (-3.7, 3.7):
        for y in (-2.35, 2.35):
            strut(f"Casting_GantryPost_{x:+}_{y:+}", (x, y, 0.4), (x, y, 4.15), 0.13, p["frame"], root)
    for y in (-2.35, 2.35):
        strut(f"Casting_GantryRail_{y:+}", (-3.7, y, 4.1), (3.7, y, 4.1), 0.16, p["orange"], root)
    strut("Casting_GantryBridge", (-0.8, -2.35, 4.28), (-0.8, 2.35, 4.28), 0.18, p["body"], root)
    cylinder("Casting_Hoist", 0.32, 0.48, (-0.8, 0, 3.93), p["dark"], vertices=20, rotation=(math.pi / 2, 0, 0), parent=root)
    strut("Casting_HoistCable", (-0.8, 0, 3.75), (-0.8, 0, 2.25), 0.035, p["copper"], root, vertices=8)
    cone("Casting_ReceiverHopper", 1.15, 0.55, 1.2, (-2.65, -0.45, 1.2), p["body"], parent=root)
    cylinder("Casting_ReceiverCollar", 1.17, 0.2, (-2.65, -0.45, 1.82), p["orange"], vertices=28, parent=root)
    pour = empty("Casting_PourPivot", (-1.75, -0.45, 1.2), root)
    strut("Casting_PourArm", (-1.75, -0.45, 1.2), (0.35, -0.45, 1.15), 0.18, p["orange"], pour)
    cylinder("Casting_PourHead", 0.42, 0.52, (0.4, -0.45, 0.9), p["warm"], vertices=24, parent=pour)
    box("Casting_ConveyorBed", (5.9, 1.55, 0.22), (1.0, 1.55, 0.72), p["dark"], edge=0.06, parent=root)
    for index in range(12):
        x = -1.55 + index * 0.47
        cylinder(f"Casting_Roller_{index + 1:02d}", 0.12, 1.45, (x, 1.55, 0.86), p["body"], vertices=16, rotation=(math.pi / 2, 0, 0), parent=root)
    box("Casting_ControlCabinet", (1.1, 0.75, 1.55), (3.55, -1.85, 1.15), p["white"], edge=0.09, parent=root)
    box("Casting_ControlFace", (0.7, 0.06, 0.9), (3.55, -2.25, 1.22), p["dark"], edge=0.04, parent=root)
    for index in range(3):
        cylinder(f"Casting_Status_{index + 1:02d}", 0.07, 0.04, (3.32 + index * 0.24, -2.29, 1.45), p["status"] if index == 0 else p["orange"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=root)
    return root


def build_cryo_farm() -> bpy.types.Object:
    p = palette("CRYO")
    root = empty("CryogenicFarm")
    mark_root(root, "equatorial-cryogenic-farm")
    box("Cryo_Foundation", (12.8, 7.8, 0.3), (0, 0, 0.15), p["foundation"], edge=0.11, parent=root)
    box("Cryo_ServiceDeck", (12.1, 7.1, 0.14), (0, 0, 0.38), p["frame"], edge=0.06, parent=root)
    tank_positions = [(-4.6, -2.25), (-1.55, -2.25), (1.55, -2.25), (4.6, -2.25), (-4.6, 2.25), (-1.55, 2.25), (1.55, 2.25), (4.6, 2.25)]
    for index, (x, y) in enumerate(tank_positions, start=1):
        tank = empty(f"Cryo_Tank_{index:02d}", (x, y, 0), root)
        for sx in (-1, 1):
            for sy in (-1, 1):
                strut(f"Cryo_Tank_{index:02d}_Leg_{sx:+}_{sy:+}", (x + sx * 0.62, y + sy * 0.62, 0.42), (x + sx * 0.5, y + sy * 0.5, 0.88), 0.07, p["frame"], tank)
        cylinder(f"Cryo_Tank_{index:02d}_Body", 1.02, 2.15, (x, y, 2.0), p["white"], vertices=32, edge=0.11, parent=tank)
        sphere(f"Cryo_Tank_{index:02d}_Top", (1.02, 1.02, 0.62), (x, y, 3.08), p["white"], parent=tank)
        sphere(f"Cryo_Tank_{index:02d}_Bottom", (1.02, 1.02, 0.58), (x, y, 0.95), p["white"], parent=tank)
        torus(f"Cryo_Tank_{index:02d}_BandA", 1.03, 0.065, (x, y, 1.45), p["orange"], parent=tank)
        torus(f"Cryo_Tank_{index:02d}_BandB", 1.03, 0.065, (x, y, 2.55), p["orange"], parent=tank)
        cylinder(f"Cryo_Tank_{index:02d}_Valve", 0.16, 0.35, (x, y, 3.75), p["frame"], vertices=16, parent=tank)
        valve = empty(f"Cryo_Valve_{index:02d}", (x, y, 3.98), tank)
        torus(f"Cryo_ValveWheel_{index:02d}", 0.28, 0.045, (x, y, 3.98), p["orange"], parent=valve)
        box(f"Cryo_FillColumn_{index:02d}", (0.18, 0.08, 1.35), (x + 1.04, y - 0.08, 2.0), p["status"], edge=0.025, parent=tank)
    strut("Cryo_HeaderPipeA", (-5.6, -0.55, 0.88), (5.6, -0.55, 0.88), 0.14, p["copper"], root, vertices=16)
    strut("Cryo_HeaderPipeB", (-5.6, 0.55, 0.88), (5.6, 0.55, 0.88), 0.14, p["body"], root, vertices=16)
    box("Cryo_ControlSkid", (2.0, 1.3, 1.45), (0, 0, 1.25), p["frame"], edge=0.12, parent=root)
    box("Cryo_ControlFace", (1.45, 0.06, 0.85), (0, -0.68, 1.32), p["dark"], edge=0.05, parent=root)
    for index in range(4):
        cylinder(f"Cryo_ControlLamp_{index + 1:02d}", 0.07, 0.04, (-0.45 + index * 0.3, -0.72, 1.55), p["status"] if index < 2 else p["orange"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=root)
    return root


def build_power_hub() -> bpy.types.Object:
    p = palette("POWER")
    root = empty("PowerHub")
    mark_root(root, "equatorial-power-hub")
    box("Power_Foundation", (17, 11.5, 0.32), (0, 0, 0.16), p["foundation"], edge=0.12, parent=root)
    box("Power_BusDeck", (16.2, 10.7, 0.14), (0, 0, 0.4), p["frame"], edge=0.06, parent=root)
    for index, x in enumerate((-5.2, -2.6, 0, 2.6, 5.2), start=1):
        box(f"Power_Switchgear_{index:02d}", (1.8, 1.3, 1.75), (x, 3.8, 1.3), p["body"], edge=0.12, parent=root)
        box(f"Power_SwitchgearFace_{index:02d}", (1.3, 0.06, 1.15), (x, 3.12, 1.36), p["dark"], edge=0.05, parent=root)
        cylinder(f"Power_SwitchgearLamp_{index:02d}", 0.08, 0.04, (x, 3.08, 1.62), p["status"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=root)
    strut("Power_MainBus", (-7.1, 2.55, 0.76), (7.1, 2.55, 0.76), 0.16, p["copper"], root, vertices=16)

    nuclear = empty("Power_NuclearRoot", (0, 0, 0), root)
    cylinder("Power_ReactorSkirt", 2.05, 0.8, (0, -0.9, 0.86), p["dark"], vertices=32, edge=0.12, parent=nuclear)
    cylinder("Power_ReactorVessel", 1.72, 3.25, (0, -0.9, 2.85), p["body"], vertices=40, edge=0.18, parent=nuclear)
    sphere("Power_ReactorCrown", (1.72, 1.72, 0.72), (0, -0.9, 4.46), p["white"], parent=nuclear)
    torus("Power_ReactorBand", 1.74, 0.11, (0, -0.9, 3.15), p["orange"], parent=nuclear)
    cylinder("Power_ReactorBeacon", 0.16, 0.3, (0, -0.9, 5.25), p["status"], vertices=18, parent=nuclear)
    radiators = empty("Power_RadiatorRoot", (0, -0.9, 3.1), nuclear)
    for side in (-1, 1):
        for row in (-1, 1):
            x0 = side * 1.8
            x1 = side * 6.45
            y = -0.9 + row * 1.05
            strut(f"Power_RadiatorBoom_{side:+}_{row:+}", (x0, y, 3.15), (x1, y, 3.15), 0.11, p["frame"], radiators)
            box(f"Power_RadiatorPanel_{side:+}_{row:+}", (4.15, 0.12, 1.8), ((x0 + x1) / 2, y, 3.2), p["dark"], edge=0.06, parent=radiators)
            for fin in range(5):
                fx = min(x0, x1) + 0.5 + fin * 0.78
                strut(f"Power_RadiatorFin_{side:+}_{row:+}_{fin:02d}", (fx, y - 0.08, 2.38), (fx, y - 0.08, 4.02), 0.025, p["orange"], radiators, vertices=8)

    solar = empty("Power_SolarRoot", (0, 0, 0), root)
    rack_positions = [(-5.8, -3.8), (-3.45, -3.8), (-1.15, -3.8), (1.15, -3.8), (3.45, -3.8), (5.8, -3.8), (-5.8, -0.4), (-3.45, -0.4), (-1.15, -0.4), (1.15, -0.4), (3.45, -0.4), (5.8, -0.4)]
    panel_mat = material("POWER_Photovoltaic", (0.035, 0.10, 0.21, 1), metallic=0.38, roughness=0.28)
    for index, (x, y) in enumerate(rack_positions, start=1):
        rack = empty(f"Power_SolarRack_{index:02d}", (x, y, 0), solar)
        strut(f"Power_SolarPost_{index:02d}", (x, y, 0.42), (x, y, 1.3), 0.08, p["frame"], rack)
        panel = empty(f"Power_SolarTracker_{index:02d}", (x, y, 1.3), rack)
        box(f"Power_SolarPanel_{index:02d}", (2.0, 1.22, 0.09), (x, y, 1.85), panel_mat, edge=0.035, rotation=(0, -0.38, 0), parent=panel)
        box(f"Power_SolarPanelFrame_{index:02d}", (2.12, 1.34, 0.04), (x, y + 0.02, 1.82), p["frame"], edge=0.025, rotation=(0, -0.38, 0), parent=panel)
    return root


def build_landing_system() -> bpy.types.Object:
    p = palette("LAND")
    root = empty("LandingSystem")
    mark_root(root, "equatorial-landing-system")
    cylinder("Landing_CentralApron", 5.4, 0.26, (0, 0, 0.13), p["foundation"], vertices=48, edge=0.08, parent=root)
    cylinder("Landing_BlastPlate", 3.1, 0.12, (0, 0, 0.34), p["dark"], vertices=48, edge=0.04, parent=root)
    for index in range(12):
        angle = index * math.tau / 12
        x = math.cos(angle) * 4.75
        y = math.sin(angle) * 4.75
        cylinder(f"Landing_PadBeacon_{index + 1:02d}", 0.09, 0.2, (x, y, 0.48), p["status"] if index % 2 == 0 else p["orange"], vertices=12, parent=root)
    lander = empty("Landing_Lander", (0, 0, 0), root)
    cylinder("Landing_DescentStage", 2.15, 1.15, (0, 0, 1.5), p["frame"], vertices=36, edge=0.15, parent=lander)
    cylinder("Landing_AscentCabin", 1.35, 2.25, (0, 0, 3.18), p["white"], vertices=36, edge=0.18, parent=lander)
    sphere("Landing_CabinDome", (1.35, 1.35, 0.7), (0, 0, 4.31), p["white"], parent=lander)
    torus("Landing_CabinSeal", 1.36, 0.09, (0, 0, 2.38), p["orange"], parent=lander)
    for side in (-1, 1):
        sphere(f"Landing_PropTank_{side:+}", (0.72, 0.72, 1.02), (side * 1.55, 0, 2.3), p["body"], parent=lander)
    for index in range(4):
        angle = index * math.tau / 4 + math.pi / 4
        hip = (math.cos(angle) * 1.65, math.sin(angle) * 1.65, 1.35)
        foot = (math.cos(angle) * 3.3, math.sin(angle) * 3.3, 0.3)
        strut(f"Landing_Leg_{index + 1:02d}", hip, foot, 0.13, p["frame"], lander, vertices=16)
        cylinder(f"Landing_Foot_{index + 1:02d}", 0.45, 0.12, foot, p["body"], vertices=20, edge=0.04, parent=lander)
    for index in range(4):
        angle = index * math.tau / 4
        x = math.cos(angle) * 1.15
        y = math.sin(angle) * 1.15
        cone(f"Landing_Engine_{index + 1:02d}", 0.35, 0.2, 0.65, (x, y, 0.72), p["copper"], rotation=(math.pi, 0, 0), parent=lander)
    box("Landing_Airlock", (0.25, 1.1, 1.25), (1.36, 0, 3.2), p["dark"], edge=0.08, parent=lander)
    ramp = empty("Landing_RampPivot", (1.46, 0, 2.7), lander)
    box("Landing_Ramp", (2.1, 1.0, 0.14), (2.35, 0, 2.25), p["orange"], edge=0.05, rotation=(0, 0.58, 0), parent=ramp)
    cylinder("Landing_AntennaMast", 0.055, 1.3, (-0.55, 0.25, 5.25), p["frame"], vertices=10, parent=lander)
    sphere("Landing_Antenna", (0.38, 0.38, 0.16), (-0.55, 0.25, 5.9), p["body"], parent=lander, segments=24)
    for index in range(3):
        cylinder(f"Landing_Status_{index + 1:02d}", 0.08, 0.05, (0.65, -1.34, 3.55 + index * 0.25), p["status"] if index == 0 else p["orange"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=lander)
    return root


def build_habitat() -> bpy.types.Object:
    p = palette("HAB")
    root = empty("Habitat")
    mark_root(root, "equatorial-habitat")
    box("Habitat_Foundation", (11.2, 8.4, 0.34), (0, 0, 0.17), p["foundation"], edge=0.12, parent=root)
    box("Habitat_ServiceDeck", (10.4, 7.6, 0.14), (0, 0, 0.42), p["frame"], edge=0.06, parent=root)
    cylinder("Habitat_PressureShell", 2.45, 6.7, (0, 0, 2.75), p["white"], vertices=40, edge=0.14, rotation=(0, math.pi / 2, 0), parent=root)
    sphere("Habitat_EndcapA", (0.75, 2.45, 2.45), (-3.35, 0, 2.75), p["white"], parent=root)
    sphere("Habitat_EndcapB", (0.75, 2.45, 2.45), (3.35, 0, 2.75), p["white"], parent=root)
    for x in (-2.4, -1.2, 0, 1.2, 2.4):
        torus(f"Habitat_FrameRing_{x:+}", 2.48, 0.075, (x, 0, 2.75), p["frame"], rotation=(0, math.pi / 2, 0), parent=root)
    for x in (-2.15, 0, 2.15):
        box(f"Habitat_Window_{x:+}", (0.72, 0.08, 0.48), (x, -2.44, 3.05), p["status"], edge=0.12, parent=root)
    cylinder("Habitat_Airlock", 1.0, 1.85, (0, -3.25, 1.65), p["body"], vertices=28, edge=0.12, rotation=(math.pi / 2, 0, 0), parent=root)
    cylinder("Habitat_AirlockDoor", 0.76, 0.14, (0, -4.19, 1.65), p["dark"], vertices=28, edge=0.08, rotation=(math.pi / 2, 0, 0), parent=root)
    torus("Habitat_AirlockSeal", 0.77, 0.07, (0, -4.27, 1.65), p["orange"], rotation=(math.pi / 2, 0, 0), parent=root)
    for side in (-1, 1):
        strut(f"Habitat_StairRail_{side:+}", (side * 0.7, -4.25, 0.45), (side * 0.7, -4.95, 0.85), 0.045, p["frame"], root, vertices=10)
    for index in range(4):
        box(f"Habitat_Step_{index + 1:02d}", (1.25, 0.32, 0.1), (0, -4.3 - index * 0.28, 0.83 - index * 0.16), p["body"], edge=0.03, parent=root)
    shield_x = (-2.75, -1.65, -0.55, 0.55, 1.65, 2.75)
    for index, x in enumerate(shield_x, start=1):
        shield = empty(f"Habitat_Shield_{index:02d}", (x, 0, 0), root)
        box(f"Habitat_ShieldTile_{index:02d}", (1.05, 4.55, 0.48), (x, 0.2, 5.12), p["regolith"], edge=0.16, rotation=(0, 0, 0), parent=shield)
        for side in (-1, 1):
            box(f"Habitat_ShieldFlank_{index:02d}_{side:+}", (1.05, 0.62, 1.3), (x, side * 2.22, 4.45), p["regolith"], edge=0.14, rotation=(side * 0.2, 0, 0), parent=shield)
    box("Habitat_Radiator", (3.4, 0.12, 1.55), (-4.45, 1.8, 2.3), p["dark"], edge=0.06, rotation=(0, -0.2, 0), parent=root)
    strut("Habitat_RadiatorBoom", (-3.25, 1.0, 2.45), (-4.45, 1.8, 2.3), 0.1, p["frame"], root)
    cylinder("Habitat_CommsMast", 0.07, 1.5, (3.7, 1.1, 2.2), p["frame"], vertices=12, parent=root)
    sphere("Habitat_CommsDish", (0.48, 0.48, 0.18), (3.7, 1.1, 3.0), p["body"], parent=root, segments=24)
    cylinder("Habitat_StatusBeacon", 0.12, 0.28, (3.35, -1.2, 4.65), p["status"], vertices=18, parent=root)
    return root


ASSETS = {
    "excavator": build_excavator,
    "hauler": build_hauler,
    "casting-yard": build_casting_yard,
    "cryogenic-farm": build_cryo_farm,
    "power-hub": build_power_hub,
    "landing-system": build_landing_system,
    "habitat": build_habitat,
}


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
    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    metrics: dict[str, dict[str, int]] = {}
    for slug, builder in ASSETS.items():
        reset_scene()
        builder()
        bpy.context.scene["selene_generator_version"] = 1
        bpy.context.scene["selene_license"] = "CC0-1.0"
        bpy.context.scene.unit_settings.system = "METRIC"
        bpy.context.scene.unit_settings.scale_length = 1.0
        blend_path = SCRIPT_DIR / f"{slug}.blend"
        glb_path = MODEL_DIR / f"{slug}.glb"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)
        mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
        triangles = 0
        for obj in mesh_objects:
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
        with tempfile.TemporaryDirectory(prefix=f"selene-{slug}-") as temp_dir:
            raw_path = Path(temp_dir) / f"{slug}-unoptimized.glb"
            export_glb(raw_path, optimized=False)
            export_glb(glb_path, optimized=True)
            metrics[slug] = {
                "blendBytes": blend_path.stat().st_size,
                "rawGlbBytes": raw_path.stat().st_size,
                "optimizedGlbBytes": glb_path.stat().st_size,
                "meshObjects": len(mesh_objects),
                "vertices": vertices,
                "triangles": triangles,
            }
            print(f"SELENE_ASSET={slug} RAW_BYTES={raw_path.stat().st_size} OPTIMIZED_BYTES={glb_path.stat().st_size}")
        print(f"SELENE_BLEND={blend_path}")
        print(f"SELENE_GLB={glb_path}")
    metrics_path = SCRIPT_DIR / "asset-metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(f"SELENE_METRICS={metrics_path}")


if __name__ == "__main__":
    main()
