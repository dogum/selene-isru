"""Generate the original SELENE polar-base equipment library.

Run from the repository root:
    blender --background --factory-startup --python assets/blender/polar_base/generate_polar_base.py

All geometry and materials are built from Blender primitives. No downloaded
mesh, texture, font, paid asset, or restrictively licensed source is used.
The editable .blend sources and optimized web GLBs are rebuilt together.
"""

from __future__ import annotations

import json
import math
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
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(collection):
            collection.remove(item)


def material(name, base, *, metallic=0.0, roughness=0.55, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = base
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = base
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_input = node.inputs.get("Emission Color") or node.inputs.get("Emission")
        if emission_input is not None:
            emission_input.default_value = emission
        strength_input = node.inputs.get("Emission Strength")
        if strength_input is not None:
            strength_input.default_value = emission_strength
    return mat


def palette(prefix):
    return {
        "foundation": material(f"{prefix}_Foundation", (0.075, 0.09, 0.11, 1), metallic=0.18, roughness=0.82),
        "frame": material(f"{prefix}_Frame", (0.11, 0.16, 0.20, 1), metallic=0.78, roughness=0.29),
        "body": material(f"{prefix}_Body", (0.43, 0.50, 0.55, 1), metallic=0.54, roughness=0.38),
        "white": material(f"{prefix}_ThermalWhite", (0.79, 0.83, 0.82, 1), metallic=0.14, roughness=0.52),
        "dark": material(f"{prefix}_DarkService", (0.018, 0.032, 0.052, 1), metallic=0.5, roughness=0.45),
        "cyan": material(f"{prefix}_CryoBlue", (0.035, 0.48, 0.68, 1), metallic=0.18, roughness=0.34),
        "orange": material(f"{prefix}_SafetyOrange", (0.91, 0.27, 0.035, 1), metallic=0.14, roughness=0.4),
        "copper": material(f"{prefix}_Copper", (0.61, 0.25, 0.08, 1), metallic=0.86, roughness=0.25),
        "ice": material(f"{prefix}_Ice", (0.42, 0.67, 0.78, 1), metallic=0.0, roughness=0.38),
        "regolith": material(f"{prefix}_Regolith", (0.20, 0.22, 0.24, 1), metallic=0.0, roughness=0.98),
        "status": material(
            f"{prefix}_StatusLight", (0.015, 0.48, 0.72, 1), metallic=0.05, roughness=0.2,
            emission=(0.01, 0.66, 1.0, 1), emission_strength=3.0,
        ),
        "warm": material(
            f"{prefix}_WarmLight", (0.94, 0.22, 0.04, 1), metallic=0.05, roughness=0.22,
            emission=(1.0, 0.10, 0.01, 1), emission_strength=2.8,
        ),
        "solar": material(f"{prefix}_Photovoltaic", (0.025, 0.08, 0.19, 1), metallic=0.42, roughness=0.24),
    }


def assign(obj, mat):
    if hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def bevel(obj, width, segments=2):
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


def parent_world(obj, parent):
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.36
    if parent is not None:
        parent_world(obj, parent)
    return obj


def box(name, dimensions, location, mat, *, edge=0.04, rotation=(0, 0, 0), parent=None):
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


def cylinder(name, radius, depth, location, mat, *, vertices=24, edge=0.035, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bevel(obj, edge)
    assign(obj, mat)
    smooth(obj)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def sphere(name, scale, location, mat, *, parent=None, segments=28):
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


def cone(name, r1, r2, depth, location, mat, *, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=r1, radius2=r2, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bevel(obj, 0.045)
    assign(obj, mat)
    smooth(obj)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def torus(name, major_radius, minor_radius, location, mat, *, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=32, minor_segments=8, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    smooth(obj)
    if parent is not None:
        parent_world(obj, parent)
    return obj


def strut(name, start, end, radius, mat, parent, *, vertices=12):
    a, b = Vector(start), Vector(end)
    direction = b - a
    obj = cylinder(name, radius, direction.length, tuple((a + b) * 0.5), mat, vertices=vertices, edge=min(0.02, radius * 0.2), parent=parent)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def mark_root(root, asset_id):
    root["selene_asset"] = asset_id
    root["generator"] = "assets/blender/polar_base/generate_polar_base.py"
    root["license"] = "CC0-1.0"
    root["units"] = "meters"


def foundation(root, p, width, depth):
    box(f"{root.name}_Foundation", (width, depth, 0.28), (0, 0, 0.14), p["foundation"], edge=0.1, parent=root)
    box(f"{root.name}_ServiceDeck", (width - 0.65, depth - 0.65, 0.12), (0, 0, 0.35), p["frame"], edge=0.05, parent=root)
    for x in (-width * 0.42, width * 0.42):
        for y in (-depth * 0.4, depth * 0.4):
            cylinder(f"{root.name}_Anchor_{x:+.1f}_{y:+.1f}", 0.12, 0.18, (x, y, 0.48), p["orange"], vertices=12, parent=root)


def track(name, center_y, p, parent):
    box(f"{name}_Shoe", (3.2, 0.55, 0.62), (0, center_y, 0.66), p["dark"], edge=0.16, parent=parent)
    for index in range(13):
        x = -1.42 + index * 0.237
        box(f"{name}_Tread_{index + 1:02d}", (0.18, 0.68, 0.12), (x, center_y, 0.38), p["body"], edge=0.02, parent=parent)
    for x in (-1.15, 0, 1.15):
        cylinder(f"{name}_Bogey_{x:+.1f}", 0.38, 0.62, (x, center_y, 0.7), p["orange"], vertices=18, rotation=(math.pi / 2, 0, 0), parent=parent)


def build_excavator():
    p = palette("POLAR_EXC")
    root = empty("PolarExcavator")
    mark_root(root, "polar-ice-excavator")
    box("PolarExcavator_Chassis", (3.9, 2.45, 0.52), (0, 0, 1.05), p["frame"], edge=0.14, parent=root)
    track("PolarExcavator_TrackL", -1.25, p, root)
    track("PolarExcavator_TrackR", 1.25, p, root)
    box("PolarExcavator_EquipmentDeck", (2.55, 1.7, 0.18), (-0.4, 0, 1.42), p["white"], edge=0.07, parent=root)
    box("PolarExcavator_Cab", (1.35, 1.58, 1.35), (-0.75, 0, 2.18), p["body"], edge=0.18, parent=root)
    box("PolarExcavator_CabGlass", (0.08, 1.16, 0.72), (-0.04, 0, 2.28), p["dark"], edge=0.035, parent=root)
    cylinder("PolarExcavator_LidarMast", 0.07, 0.8, (-0.8, 0.44, 3.25), p["frame"], vertices=12, parent=root)
    cylinder("PolarExcavator_Lidar", 0.24, 0.2, (-0.8, 0.44, 3.68), p["status"], vertices=18, parent=root)
    boom = empty("PolarExcavator_BoomPivot", (0.65, 0, 1.8), root)
    for y in (-0.5, 0.5):
        strut(f"PolarExcavator_Boom_{y:+}", (0.65, y, 1.8), (2.75, y, 1.45), 0.15, p["orange"], boom)
        strut(f"PolarExcavator_Dipper_{y:+}", (2.75, y, 1.45), (3.6, y, 0.65), 0.13, p["frame"], boom)
    auger = empty("PolarExcavator_AugerPivot", (3.65, 0, 0.72), boom)
    cylinder("PolarExcavator_AugerDrum", 0.62, 2.35, (3.65, 0, 0.72), p["ice"], vertices=28, rotation=(math.pi / 2, 0, 0), parent=auger)
    for index in range(10):
        angle = index * math.tau / 10
        x = 3.65 + math.cos(angle) * 0.64
        z = 0.72 + math.sin(angle) * 0.64
        box(f"PolarExcavator_AugerTooth_{index + 1:02d}", (0.18, 2.5, 0.12), (x, 0, z), p["orange"], edge=0.025, rotation=(0, angle, 0), parent=auger)
    for side in (-1, 1):
        box(f"PolarExcavator_WorkLight_{side:+}", (0.18, 0.12, 0.18), (-0.04, side * 0.58, 2.67), p["status"], edge=0.035, parent=root)
    return root


def build_sublimation_camp():
    p = palette("SUB")
    root = empty("SublimationCamp")
    mark_root(root, "polar-sublimation-camp")
    foundation(root, p, 12.8, 8.4)
    for index, (x, y) in enumerate(((-3.5, -1.5), (0, 1.35), (3.5, -1.2)), start=1):
        tent = empty(f"Sublimation_Tent_{index:02d}", (x, y, 0), root)
        cylinder(f"Sublimation_TentSkirt_{index:02d}", 1.75, 0.4, (x, y, 0.62), p["dark"], vertices=32, edge=0.1, parent=tent)
        sphere(f"Sublimation_TentShell_{index:02d}", (1.72, 1.72, 1.3), (x, y, 1.3), p["white"], parent=tent)
        for rib in range(8):
            angle = rib * math.tau / 8
            strut(f"Sublimation_Rib_{index:02d}_{rib + 1:02d}", (x + math.cos(angle) * 1.7, y + math.sin(angle) * 1.7, 0.62), (x, y, 2.62), 0.045, p["frame"], tent, vertices=8)
        cylinder(f"Sublimation_Airlock_{index:02d}", 0.52, 1.25, (x, y - 1.92, 0.98), p["body"], vertices=20, rotation=(math.pi / 2, 0, 0), parent=tent)
        torus(f"Sublimation_DoorSeal_{index:02d}", 0.4, 0.055, (x, y - 2.56, 0.98), p["orange"], rotation=(math.pi / 2, 0, 0), parent=tent)
        cylinder(f"Sublimation_Vent_{index:02d}", 0.14, 0.55, (x + 0.8, y, 2.75), p["status"], vertices=14, parent=tent)
    box("Sublimation_ManifoldSkid", (3.2, 1.75, 1.15), (1.3, 3.0, 1.02), p["frame"], edge=0.1, parent=root)
    for index in range(3):
        cylinder(f"Sublimation_Condenser_{index + 1:02d}", 0.38, 1.2, (0.35 + index * 0.92, 3.0, 1.95), p["cyan"], vertices=20, parent=root)
        valve = empty(f"Sublimation_ValvePivot_{index + 1:02d}", (0.35 + index * 0.92, 2.55, 2.22), root)
        torus(f"Sublimation_ValveWheel_{index + 1:02d}", 0.25, 0.045, (0.35 + index * 0.92, 2.55, 2.22), p["orange"], rotation=(math.pi / 2, 0, 0), parent=valve)
    strut("Sublimation_Header", (-4.7, 2.45, 0.75), (4.7, 2.45, 0.75), 0.14, p["copper"], root, vertices=16)
    box("Sublimation_ControlCabinet", (1.2, 0.75, 1.6), (-4.8, 2.8, 1.18), p["body"], edge=0.1, parent=root)
    box("Sublimation_ControlFace", (0.78, 0.06, 0.96), (-4.8, 2.4, 1.26), p["dark"], edge=0.04, parent=root)
    cylinder("Sublimation_Status", 0.09, 0.05, (-4.8, 2.36, 1.55), p["status"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=root)
    return root


def build_receiver_plant():
    p = palette("RECV")
    root = empty("ReceiverPlant")
    mark_root(root, "polar-beam-receiver-sabatier-plant")
    foundation(root, p, 13.2, 10.2)
    dish = empty("Receiver_DishPivot", (-2.4, -1.2, 0.5), root)
    cylinder("Receiver_AbsorberDeck", 2.65, 0.55, (-2.4, -1.2, 0.7), p["cyan"], vertices=40, edge=0.12, parent=dish)
    torus("Receiver_AbsorberRing", 2.28, 0.16, (-2.4, -1.2, 1.02), p["status"], parent=dish)
    cone("Receiver_FluxCone", 1.2, 0.34, 2.4, (-2.4, -1.2, 2.15), p["white"], parent=dish)
    cylinder("Receiver_Aperture", 0.42, 0.35, (-2.4, -1.2, 3.45), p["warm"], vertices=24, parent=dish)
    for angle_index in range(8):
        angle = angle_index * math.tau / 8
        strut(f"Receiver_Support_{angle_index + 1:02d}", (-2.4 + math.cos(angle) * 2.15, -1.2 + math.sin(angle) * 2.15, 0.45), (-2.4 + math.cos(angle) * 0.55, -1.2 + math.sin(angle) * 0.55, 2.55), 0.08, p["frame"], dish)
    sabatier = empty("Receiver_SabatierRoot", (0, 0, 0), root)
    box("Receiver_ProcessSkid", (5.0, 3.5, 0.32), (3.4, 1.9, 0.54), p["dark"], edge=0.1, parent=sabatier)
    for index, x in enumerate((2.05, 3.4, 4.75), start=1):
        cylinder(f"Receiver_ReactorColumn_{index:02d}", 0.52, 2.8, (x, 1.9, 2.05), p["body"], vertices=28, edge=0.09, parent=sabatier)
        sphere(f"Receiver_ReactorCap_{index:02d}", (0.52, 0.52, 0.34), (x, 1.9, 3.45), p["white"], parent=sabatier)
        torus(f"Receiver_ReactorBand_{index:02d}", 0.53, 0.055, (x, 1.9, 2.2), p["orange"], parent=sabatier)
    strut("Receiver_ProcessHeader", (1.45, 1.9, 3.7), (5.35, 1.9, 3.7), 0.12, p["copper"], sabatier, vertices=16)
    valve = empty("Receiver_SabatierValvePivot", (5.45, 1.9, 3.7), sabatier)
    torus("Receiver_SabatierValve", 0.3, 0.05, (5.45, 1.9, 3.7), p["orange"], rotation=(math.pi / 2, 0, 0), parent=valve)
    for side in (-1, 1):
        box(f"Receiver_Radiator_{side:+}", (2.5, 0.12, 2.2), (3.4 + side * 2.1, 3.85, 2.15), p["dark"], edge=0.05, rotation=(0, side * 0.18, 0), parent=sabatier)
        strut(f"Receiver_RadiatorBoom_{side:+}", (3.4 + side * 0.7, 2.8, 1.8), (3.4 + side * 2.1, 3.85, 2.15), 0.09, p["frame"], sabatier)
    box("Receiver_ControlCab", (1.3, 1.1, 1.75), (-4.7, 2.8, 1.32), p["body"], edge=0.12, parent=root)
    box("Receiver_ControlFace", (0.86, 0.06, 1.0), (-4.7, 2.22, 1.38), p["dark"], edge=0.04, parent=root)
    cylinder("Receiver_Status", 0.1, 0.05, (-4.7, 2.18, 1.7), p["status"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=root)
    return root


def build_cryo_farm():
    p = palette("POLAR_CRYO")
    root = empty("PolarCryogenicFarm")
    mark_root(root, "polar-cryogenic-farm")
    foundation(root, p, 13.6, 8.4)
    positions = [(-4.8, -2.1), (-1.6, -2.1), (1.6, -2.1), (4.8, -2.1), (-4.8, 2.1), (-1.6, 2.1), (1.6, 2.1), (4.8, 2.1)]
    for index, (x, y) in enumerate(positions, start=1):
        tank = empty(f"PolarCryo_Tank_{index:02d}", (x, y, 0), root)
        for sx in (-1, 1):
            for sy in (-1, 1):
                strut(f"PolarCryo_Leg_{index:02d}_{sx:+}_{sy:+}", (x + sx * 0.5, y + sy * 0.5, 0.45), (x + sx * 0.38, y + sy * 0.38, 0.86), 0.07, p["frame"], tank)
        cylinder(f"PolarCryo_Body_{index:02d}", 0.94, 2.3, (x, y, 2.02), p["white"], vertices=30, edge=0.11, parent=tank)
        sphere(f"PolarCryo_Top_{index:02d}", (0.94, 0.94, 0.58), (x, y, 3.17), p["white"], parent=tank)
        sphere(f"PolarCryo_Bottom_{index:02d}", (0.94, 0.94, 0.54), (x, y, 0.88), p["white"], parent=tank)
        torus(f"PolarCryo_Band_{index:02d}", 0.96, 0.07, (x, y, 2.15), p["cyan"], parent=tank)
        cylinder(f"PolarCryo_ValveStem_{index:02d}", 0.13, 0.4, (x, y, 3.88), p["frame"], vertices=14, parent=tank)
        valve = empty(f"PolarCryo_ValvePivot_{index:02d}", (x, y, 4.12), tank)
        torus(f"PolarCryo_Valve_{index:02d}", 0.25, 0.045, (x, y, 4.12), p["orange"], parent=valve)
        box(f"PolarCryo_FillColumn_{index:02d}", (0.15, 0.08, 1.4), (x + 0.96, y - 0.08, 2.05), p["status"], edge=0.025, parent=tank)
    strut("PolarCryo_HeaderA", (-5.7, -0.55, 0.9), (5.7, -0.55, 0.9), 0.14, p["copper"], root, vertices=16)
    strut("PolarCryo_HeaderB", (-5.7, 0.55, 0.9), (5.7, 0.55, 0.9), 0.14, p["cyan"], root, vertices=16)
    box("PolarCryo_ControlSkid", (2.2, 1.4, 1.5), (0, 0, 1.28), p["frame"], edge=0.12, parent=root)
    cylinder("PolarCryo_Status", 0.1, 0.06, (0, -0.75, 1.65), p["status"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=root)
    return root


def build_power_towers():
    p = palette("POLAR_POWER")
    root = empty("PolarPowerTowers")
    mark_root(root, "polar-rim-power-towers")
    for tower_index, (x, y) in enumerate(((-18.0, 3.2), (0, 0), (18.0, 3.2)), start=1):
        tower = empty(f"PolarPower_Tower_{tower_index:02d}", (x, y, 0), root)
        box(f"PolarPower_Foundation_{tower_index:02d}", (3.1, 3.1, 0.3), (x, y, 0.15), p["foundation"], edge=0.1, parent=tower)
        for leg_index, (lx, ly) in enumerate(((-0.7, -0.7), (-0.7, 0.7), (0.7, -0.7), (0.7, 0.7)), start=1):
            strut(f"PolarPower_Leg_{tower_index:02d}_{leg_index:02d}", (x + lx, y + ly, 0.35), (x + lx * 0.35, y + ly * 0.35, 12.8), 0.14, p["frame"], tower, vertices=16)
        for level in range(1, 7):
            z = level * 2.0
            radius = 0.78 - level * 0.05
            for side in (-1, 1):
                strut(f"PolarPower_BraceX_{tower_index:02d}_{level:02d}_{side:+}", (x - radius, y + side * radius, z - 0.8), (x + radius, y + side * radius, z + 0.8), 0.045, p["body"], tower, vertices=8)
                strut(f"PolarPower_BraceY_{tower_index:02d}_{level:02d}_{side:+}", (x + side * radius, y - radius, z - 0.8), (x + side * radius, y + radius, z + 0.8), 0.045, p["body"], tower, vertices=8)
        tracker = empty(f"PolarPower_Tracker_{tower_index:02d}", (x, y, 13.2), tower)
        cylinder(f"PolarPower_Gimbal_{tower_index:02d}", 0.5, 0.55, (x, y, 13.1), p["orange"], vertices=24, parent=tracker)
        for petal in range(3):
            angle = petal * math.tau / 3
            px, py = x + math.cos(angle) * 2.0, y + math.sin(angle) * 2.0
            box(f"PolarPower_Petal_{tower_index:02d}_{petal + 1:02d}", (3.8, 1.45, 0.1), (px, py, 13.55), p["solar"], edge=0.045, rotation=(0.08, -0.18, angle), parent=tracker)
            strut(f"PolarPower_PetalBoom_{tower_index:02d}_{petal + 1:02d}", (x, y, 13.25), (px, py, 13.45), 0.09, p["frame"], tracker)
        cylinder(f"PolarPower_Beacon_{tower_index:02d}", 0.12, 0.3, (x, y, 14.25), p["status"], vertices=16, parent=tracker)
    return root


def build_nuclear_station():
    p = palette("POLAR_NUC")
    root = empty("PolarNuclearStation")
    mark_root(root, "polar-rim-nuclear-station")
    foundation(root, p, 12.5, 8.0)
    cylinder("PolarNuclear_ReactorSkirt", 2.15, 0.75, (0, 0, 0.76), p["dark"], vertices=36, edge=0.12, parent=root)
    cylinder("PolarNuclear_ReactorVessel", 1.72, 3.4, (0, 0, 2.78), p["body"], vertices=40, edge=0.18, parent=root)
    sphere("PolarNuclear_ReactorCrown", (1.72, 1.72, 0.7), (0, 0, 4.48), p["white"], parent=root)
    torus("PolarNuclear_ReactorBand", 1.74, 0.11, (0, 0, 3.0), p["orange"], parent=root)
    cylinder("PolarNuclear_Status", 0.15, 0.35, (0, 0, 5.28), p["status"], vertices=18, parent=root)
    radiators = empty("PolarNuclear_RadiatorRoot", (0, 0, 2.8), root)
    for side in (-1, 1):
        for row in (-1, 1):
            x0, x1, y = side * 1.8, side * 5.4, row * 1.25
            strut(f"PolarNuclear_Boom_{side:+}_{row:+}", (x0, y, 2.8), (x1, y, 2.8), 0.11, p["frame"], radiators)
            box(f"PolarNuclear_Radiator_{side:+}_{row:+}", (3.25, 0.12, 2.1), ((x0 + x1) / 2, y, 2.85), p["dark"], edge=0.05, parent=radiators)
            for fin in range(5):
                fx = min(x0, x1) + 0.38 + fin * 0.62
                strut(f"PolarNuclear_Fin_{side:+}_{row:+}_{fin:02d}", (fx, y - 0.08, 1.92), (fx, y - 0.08, 3.78), 0.022, p["cyan"], radiators, vertices=8)
    for index, x in enumerate((-4.3, -2.7, 2.7, 4.3), start=1):
        box(f"PolarNuclear_Switchgear_{index:02d}", (1.15, 1.0, 1.5), (x, -2.55, 1.18), p["body"], edge=0.1, parent=root)
        cylinder(f"PolarNuclear_Lamp_{index:02d}", 0.07, 0.04, (x, -3.08, 1.45), p["status"], vertices=12, rotation=(math.pi / 2, 0, 0), parent=root)
    return root


def build_habitat():
    p = palette("POLAR_HAB")
    root = empty("PolarHabitat")
    mark_root(root, "polar-surface-habitat")
    foundation(root, p, 12.2, 8.8)
    cylinder("PolarHabitat_PressureShell", 2.45, 7.0, (0, 0, 2.8), p["white"], vertices=40, edge=0.14, rotation=(0, math.pi / 2, 0), parent=root)
    sphere("PolarHabitat_EndcapA", (0.78, 2.45, 2.45), (-3.5, 0, 2.8), p["white"], parent=root)
    sphere("PolarHabitat_EndcapB", (0.78, 2.45, 2.45), (3.5, 0, 2.8), p["white"], parent=root)
    for x in (-2.7, -1.35, 0, 1.35, 2.7):
        torus(f"PolarHabitat_Frame_{x:+}", 2.48, 0.075, (x, 0, 2.8), p["frame"], rotation=(0, math.pi / 2, 0), parent=root)
    for x in (-2.2, 0, 2.2):
        box(f"PolarHabitat_Window_{x:+}", (0.72, 0.08, 0.48), (x, -2.44, 3.0), p["status"], edge=0.12, parent=root)
    cylinder("PolarHabitat_Airlock", 1.0, 1.9, (0, -3.28, 1.68), p["body"], vertices=28, edge=0.12, rotation=(math.pi / 2, 0, 0), parent=root)
    cylinder("PolarHabitat_Door", 0.76, 0.14, (0, -4.24, 1.68), p["dark"], vertices=28, edge=0.08, rotation=(math.pi / 2, 0, 0), parent=root)
    torus("PolarHabitat_DoorSeal", 0.78, 0.07, (0, -4.32, 1.68), p["orange"], rotation=(math.pi / 2, 0, 0), parent=root)
    for index, x in enumerate((-2.8, -1.68, -0.56, 0.56, 1.68, 2.8), start=1):
        shield = empty(f"PolarHabitat_Shield_{index:02d}", (x, 0, 0), root)
        box(f"PolarHabitat_ShieldTile_{index:02d}", (1.06, 4.5, 0.46), (x, 0.18, 5.18), p["regolith"], edge=0.15, parent=shield)
    box("PolarHabitat_Radiator", (3.3, 0.12, 1.6), (-4.55, 1.7, 2.35), p["dark"], edge=0.05, rotation=(0, -0.2, 0), parent=root)
    strut("PolarHabitat_RadiatorBoom", (-3.25, 1.0, 2.5), (-4.55, 1.7, 2.35), 0.09, p["frame"], root)
    cylinder("PolarHabitat_CommsMast", 0.07, 1.6, (3.85, 1.0, 2.45), p["frame"], vertices=12, parent=root)
    sphere("PolarHabitat_CommsDish", (0.48, 0.48, 0.18), (3.85, 1.0, 3.3), p["body"], parent=root, segments=22)
    cylinder("PolarHabitat_Status", 0.12, 0.3, (3.45, -1.2, 4.8), p["status"], vertices=18, parent=root)
    return root


ASSETS = {
    "polar-excavator": build_excavator,
    "sublimation-camp": build_sublimation_camp,
    "receiver-plant": build_receiver_plant,
    "polar-cryogenic-farm": build_cryo_farm,
    "polar-power-towers": build_power_towers,
    "polar-nuclear-station": build_nuclear_station,
    "polar-habitat": build_habitat,
}


def export_glb(path: Path, *, optimized: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", export_yup=True, export_apply=True,
        export_materials="EXPORT", export_extras=True, export_animations=False,
        export_cameras=False, export_lights=False,
        export_meshopt_compression_enable=optimized,
        export_meshopt_extension="EXT_meshopt_compression", export_loglevel=-1,
        check_existing=False,
    )


def main() -> None:
    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    metrics = {}
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
