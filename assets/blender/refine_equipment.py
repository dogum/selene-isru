"""Shared manufacturing pass for the original equipment generators (CC0-1.0).

Detail is authored in each source mesh's local coordinates, so it follows the
existing pivots, trackers and optional subassemblies without runtime code.
No remeshing, unit conversion, texture downloads or external dependencies.
"""
import math
import bpy
import bmesh
from mathutils import Vector


def block(name, size, location, material, parent, edge=0.008):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if edge:
        bevel = obj.modifiers.new('Small manufactured edge', 'BEVEL')
        bevel.width = min(edge, min(size) * 0.3)
        bevel.segments = 1
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.data.materials.append(material)
    obj.parent = parent
    obj.location = location
    return obj


def rod(name, start, end, radius, material, parent, vertices=8):
    start, end = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(end-start).length)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    obj.parent = parent
    obj.location = (start+end)*0.5
    obj.rotation_euler = (end-start).to_track_quat('Z', 'Y').to_euler()
    return obj


def optimize_static_meshes():
    """Export-only rigid batching; editable .blend is saved BEFORE this pass.

    Every source object stays as a named transform anchor. Never cross parent
    boundaries: tank visibility, trackers, valve pivots and articulated tools
    therefore remain independent. Fill columns are runtime-scaled meshes.
    """
    if bpy.context.scene.get('selene_static_batched'):
        return
    bpy.context.view_layer.update()
    batches = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH' or obj.parent is None or obj.children or 'FillColumn' in obj.name:
            continue
        key = (obj.parent.name, tuple(m.name for m in obj.data.materials))
        batches.setdefault(key, []).append(obj)
    for (parent_name, _), originals in batches.items():
        if len(originals) < 2:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in originals:
            name, parent, world = obj.name, obj.parent, obj.matrix_world.copy()
            extras = dict(obj.items())
            copy = obj.copy()
            copy.data = obj.data.copy()
            copy.name = f'RenderPart_{name}'
            bpy.context.collection.objects.link(copy)
            copy.select_set(True)
            bpy.data.objects.remove(obj, do_unlink=True)
            anchor = bpy.data.objects.new(name, None)
            bpy.context.collection.objects.link(anchor)
            anchor.parent = parent
            anchor.matrix_world = world
            anchor.empty_display_size = 0.08
            for key, value in extras.items():
                anchor[key] = value
        batch = bpy.data.objects.new(f'RenderBatch_{parent_name}', bpy.data.meshes.new('Rigid assembly'))
        bpy.context.collection.objects.link(batch)
        batch.parent = bpy.data.objects[parent_name]
        batch.matrix_world = batch.parent.matrix_world.copy()
        batch.select_set(True)
        bpy.context.view_layer.objects.active = batch
        bpy.ops.object.join()
        for index in reversed(range(len(batch.data.materials))):
            if batch.data.materials[index] is None:
                batch.data.materials.pop(index=index)
        batch.name = f'RenderBatch_{parent_name}_{batch.data.materials[0].name}'
    bpy.context.scene['selene_static_batched'] = True


def finish_equipment():
    """Coherent coatings, real panel construction, valve spokes and edge normals.

    Original mesh names and all control roots remain intact. Small details are
    joined per original parent and material to bound draw calls.
    """
    bpy.context.scene['selene_static_batched'] = False
    bpy.context.view_layer.update()
    originals = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    original_ids = {o.as_pointer() for o in originals}
    mats = list(bpy.data.materials)
    frame = next(m for m in mats if m.name.endswith('_Frame'))
    white = next((m for m in mats if m.name.endswith('_ThermalWhite')), frame)
    for mat in mats:
        node = mat.node_tree.nodes.get('Principled BSDF') if mat.use_nodes else None
        if node is None:
            continue
        if mat.name.endswith('_ThermalWhite'):
            node.inputs['Base Color'].default_value = (0.67, 0.69, 0.68, 1)
            node.inputs['Metallic'].default_value = 0.0
            node.inputs['Roughness'].default_value = 0.62
        elif mat.name.endswith('_Frame'):
            node.inputs['Base Color'].default_value = (0.18, 0.20, 0.21, 1)
            node.inputs['Roughness'].default_value = 0.42
        elif mat.name.endswith('_Foundation'):
            node.inputs['Base Color'].default_value = (0.17, 0.16, 0.15, 1)
            node.inputs['Metallic'].default_value = 0.0
            node.inputs['Roughness'].default_value = 0.95
        elif mat.name.endswith('_SafetyOrange'):
            node.inputs['Base Color'].default_value = (0.63, 0.19, 0.035, 1)
            node.inputs['Metallic'].default_value = 0.0
        elif mat.name.endswith('_Photovoltaic'):
            node.inputs['Base Color'].default_value = (0.015, 0.028, 0.055, 1)
            node.inputs['Metallic'].default_value = 0.25
            node.inputs['Roughness'].default_value = 0.3

    for obj in originals:
        name = obj.name
        if obj.data.name.startswith('Sphere') and any(part in name for part in ('_Top', '_Bottom', '_Endcap', 'Crown', 'CabinDome')):
            # Only the exposed half of dished heads is needed. The pressure
            # barrel covers the equator; remove the hidden interior hemisphere.
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            axis = 0 if '_Endcap' in name else 2
            sign = -1 if '_Bottom' in name or '_EndcapA' in name else 1
            hidden = [v for v in mesh.verts if v.co[axis]*sign < -0.00001]
            bmesh.ops.delete(mesh, geom=hidden, context='VERTS')
            mesh.to_mesh(obj.data)
            mesh.free()
        if ('Hopper' in name and any(part in name for part in ('FeedHopper', 'HopperCap', 'ReceiverHopper'))) or name == 'Casting_ReceiverCollar' or name.startswith('Landing_Engine_'):
            # Open process mouths and nozzle exits: a filled cone reads as a
            # solid plug. Retain the original exterior and give it wall thickness.
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            caps = [f for f in mesh.faces if abs(f.normal.z) > 0.999]
            bmesh.ops.delete(mesh, geom=caps, context='FACES')
            mesh.to_mesh(obj.data)
            mesh.free()
            bpy.context.view_layer.objects.active = obj
            wall = obj.modifiers.new('Fabricated shell wall', 'SOLIDIFY')
            wall.thickness = 0.025
            wall.offset = -1
            bpy.ops.object.modifier_apply(modifier=wall.name)
        # Geometry is already scaled by the generators; local extents preserve
        # tracker orientation and physical dimensions in Blender meters.
        corners = [Vector(c) for c in obj.bound_box]
        lo = Vector(tuple(min(c[i] for c in corners) for i in range(3)))
        hi = Vector(tuple(max(c[i] for c in corners) for i in range(3)))
        size = hi-lo
        if ('SolarPanel_' in name or '_Petal_' in name) and 'Frame' not in name:
            for i in range(1, 9):
                x = lo.x + size.x*i/9
                block(f'Detail_{name}_CellBus_{i}', (0.012, size.y*0.94, 0.006),
                      (x, 0, hi.z+0.004), frame, obj, 0)
            for side in (-1, 1):
                block(f'Detail_{name}_Edge_{side}', (size.x, 0.026, 0.025),
                      (0, side*size.y*0.49, hi.z), frame, obj, 0)
        if 'Radiator' in name and size.x > 1 and size.z > 1 and size.y < 0.3:
            # Ceramic emitting faces, exposed narrow coolant channels, metal rim.
            for i in range(8):
                x = lo.x+size.x*(i+0.5)/8
                for side in (-1, 1):
                    block(f'Detail_{name}_ThermalTile_{i}_{side}',
                          (size.x/8-0.035, 0.012, size.z-0.12),
                          (x, side*(size.y/2+0.012), 0), white, obj, 0)
        if ('ControlFace' in name or 'CabinetFace' in name or 'SwitchgearFace' in name) and size.y < 0.2:
            for x in (lo.x+0.07, hi.x-0.07):
                for z in (lo.z+0.07, hi.z-0.07):
                    rod(f'Detail_{name}_CaptiveBolt', (x, lo.y-0.022, z), (x, lo.y-0.006, z), 0.025, frame, obj)
            for z in (-size.z*0.22, -size.z*0.1, size.z*0.02):
                block(f'Detail_{name}_CircuitLabel', (size.x*0.55, 0.007, 0.025),
                      (0, lo.y-0.008, z), white, obj, 0)
        if 'Valve' in name and ('Wheel' in name or obj.data.name.startswith('Torus')):
            radius = size.x*0.4
            for axis in (0, 1):
                a, b = Vector(), Vector()
                a[axis], b[axis] = -radius, radius
                rod(f'Detail_{name}_Spoke', a, b, 0.018, frame, obj)
        if 'Window' in name:
            glass = obj.data.materials[0].copy()
            glass.name = f'{name}_Glazing'
            node = glass.node_tree.nodes.get('Principled BSDF')
            node.inputs['Base Color'].default_value = (0.045, 0.08, 0.105, 1)
            node.inputs['Emission Color'].default_value = (0.2, 0.24, 0.22, 1)
            node.inputs['Emission Strength'].default_value = 0.25
            node.inputs['Roughness'].default_value = 0.22
            obj.data.materials[0] = glass

    # Load paths and service hardware share existing roots and meter envelopes.
    root = next(o for o in bpy.context.scene.objects if o.parent is None and o.type == 'EMPTY')
    if root.name in ('Habitat', 'PolarHabitat'):
        for x in (-2.7, 2.7):
            for side in (-1, 1):
                rod(f'Detail_ShieldSupport_{x}_{side}', (x, side*2.65, 0.5),
                    (x, side*2.3, 4.95), 0.065, frame, root)
        if root.name == 'PolarHabitat':
            for i in range(3):
                block(f'Detail_AirlockStep_{i}', (1.15, 0.24, 0.09),
                      (0, -4.08-i*0.2, 0.83-i*0.16), frame, root)
    if root.name == 'LandingSystem':
        lander = bpy.data.objects['Landing_Lander']
        for i in range(4):
            angle = i*math.tau/4+math.pi/4
            rod(f'Detail_LandingLegBrace_{i}',
                (math.cos(angle+0.3)*1.9, math.sin(angle+0.3)*1.9, 1.9),
                (math.cos(angle)*3.1, math.sin(angle)*3.1, 0.42), 0.06, frame, lander)
    if root.name == 'ReceiverPlant':
        skid = bpy.data.objects['Receiver_SabatierRoot']
        for i, x in enumerate((2.05, 3.4, 4.75)):
            rod(f'Detail_ProcessRiser_{i}', (x, 1.9, 3.45), (x, 1.9, 3.7), 0.09, frame, skid)

    # Batch only the added, rigid detail, never the existing simulator nodes.
    batches = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and (obj.as_pointer() not in original_ids or obj.name.startswith('Sublimation_Rib_')):
            key = (obj.parent.name, obj.data.materials[0].name)
            batches.setdefault(key, []).append(obj)
    for (parent_name, _), objects in batches.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = f'Detail_{parent_name}'
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        # Cylindrical caps stay flat; bevels and curved shells retain continuity.
        obj.data.set_sharp_from_angle(angle=math.radians(40))
        for face in obj.data.polygons:
            face.use_smooth = True
        bpy.context.view_layer.objects.active = obj
        normal = obj.modifiers.new('Area weighted manufacturing normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        normal.weight = 50
        bpy.ops.object.modifier_apply(modifier=normal.name)
    bpy.context.scene['selene_generator_version'] = 2
