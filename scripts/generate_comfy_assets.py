import argparse
import json
import shutil
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from PIL import Image

COMFY_URL = "http://127.0.0.1:8188"
COMFY_INPUT_DIR = Path(r"E:\Comfy-Desktop\ComfyUI-Shared\input")
COMFY_OUTPUT_DIR = Path(r"E:\Comfy-Desktop\ComfyUI-Shared\output")
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = PROJECT_ROOT / "public" / "assets"
REF_DIR = PROJECT_ROOT / "reference"

CLIENT_ID = str(uuid.uuid4())


def http_get_json(path: str):
    with urllib.request.urlopen(f"{COMFY_URL}{path}", timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(path: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} on {path}: {body}") from e


def queue_and_wait(prompt_graph: dict, label: str, timeout_sec: int = 900) -> dict:
    print(f"[ComfyUI] Queueing: {label}...")
    res = http_post_json("/prompt", {"prompt": prompt_graph, "client_id": CLIENT_ID})
    if res.get("node_errors"):
        raise RuntimeError(f"ComfyUI node_errors on {label}: {json.dumps(res['node_errors'], ensure_ascii=False)}")
    prompt_id = res["prompt_id"]
    start = time.time()
    while True:
        if time.time() - start > timeout_sec:
            raise TimeoutError(f"Timeout waiting for {label} ({prompt_id})")
        hist = http_get_json(f"/history/{prompt_id}")
        if prompt_id in hist:
            entry = hist[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI execution error on {label}: {json.dumps(status, ensure_ascii=False)}")
            if status.get("completed", False) or entry.get("outputs"):
                elapsed = time.time() - start
                print(f"[ComfyUI] Completed: {label} ({elapsed:.1f}s)")
                return entry
        time.sleep(2.0)


def resolve_comfy_output_file(file_info: dict) -> Path:
    subfolder = file_info.get("subfolder", "")
    filename = file_info["filename"]
    ftype = file_info.get("type", "output")
    base = COMFY_OUTPUT_DIR if ftype == "output" else COMFY_INPUT_DIR
    return (base / subfolder / filename) if subfolder else (base / filename)


def find_first_output(history_entry: dict, keys=("images", "audio", "videos", "gifs", "3d", "model_3d", "files")):
    outputs = history_entry.get("outputs", {})
    for _node_id, node_out in outputs.items():
        for key in keys:
            if key in node_out and node_out[key]:
                return resolve_comfy_output_file(node_out[key][0])
        for _key, val in node_out.items():
            if isinstance(val, list) and val and isinstance(val[0], dict) and "filename" in val[0]:
                return resolve_comfy_output_file(val[0])
    return None


def copy_to_asset(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    size_kb = dst.stat().st_size / 1024.0
    print(f"[Asset] Saved {dst.relative_to(PROJECT_ROOT)} ({size_kb:.1f} KB)")


def generate_image(prompt_text: str, negative_prompt: str, aspect_ratio: str, prefix: str, seed: int, dest_path: Path):
    graph = {
        "13": {
            "inputs": {"aspect_ratio": aspect_ratio, "megapixels": 1.0, "multiple": 8},
            "class_type": "ResolutionSelector",
        },
        "459:451": {
            "inputs": {"unet_name": "qwen_image_2.1_int8_convrot.safetensors", "weight_dtype": "default"},
            "class_type": "UNETLoader",
        },
        "459:453": {
            "inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default"},
            "class_type": "CLIPLoader",
        },
        "459:454": {
            "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"},
            "class_type": "VAELoader",
        },
        "459:480": {
            "inputs": {"device": "auto", "dtype": "default", "model": ["459:451", 0]},
            "class_type": "QwenImage21Cache",
        },
        "459:452": {
            "inputs": {
                "prompt": prompt_text,
                "negative_prompt": negative_prompt,
                "resolution": 1024,
                "clip": ["459:453", 0],
            },
            "class_type": "TextEncodeQwenImage21",
        },
        "459:456": {
            "inputs": {"width": ["13", 0], "height": ["13", 1], "batch_size": 1},
            "class_type": "EmptyLatentImage",
        },
        "459:458": {
            "inputs": {
                "seed": seed,
                "steps": 25,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["459:480", 0],
                "positive": ["459:452", 0],
                "negative": ["459:452", 1],
                "latent_image": ["459:456", 0],
            },
            "class_type": "KSampler",
        },
        "459:457": {
            "inputs": {"samples": ["459:458", 0], "vae": ["459:454", 0]},
            "class_type": "VAEDecode",
        },
        "461": {
            "inputs": {
                "filename_prefix": prefix,
                "format": "png",
                "format.bit_depth": "8-bit",
                "format.input_color_space": "sRGB",
                "images": ["459:457", 0],
            },
            "class_type": "SaveImageAdvanced",
        },
    }
    entry = queue_and_wait(graph, f"Image {dest_path.name}")
    out_file = find_first_output(entry, keys=("images",))
    if not out_file or not out_file.exists():
        raise FileNotFoundError(f"Could not find output image for {dest_path.name}: {entry}")
    copy_to_asset(out_file, dest_path)


def convert_image_to_model_workflow(input_image_name: str, output_prefix: str) -> dict:
    wf = http_get_json("/userdata/workflows%2Fimage_to_model.json")
    info = http_get_json("/object_info")

    link_map = {}
    for link in wf["links"]:
        link_id, origin_id, origin_slot, _target_id, _target_slot, _ltype = link
        link_map[link_id] = [str(origin_id), int(origin_slot)]

    prompt_graph = {}
    control_after_widgets = {"KSampler": {"seed"}, "PrimitiveInt": {"value"}}

    for node in wf["nodes"]:
        ctype = node["type"]
        nid = str(node["id"])
        if ctype in ("Note", "MarkdownNote"):
            continue

        spec = info.get(ctype, {}).get("input", {})
        spec_all = {}
        spec_all.update(spec.get("required", {}))
        spec_all.update(spec.get("optional", {}))

        wv_raw = node.get("widgets_values", [])
        if not isinstance(wv_raw, list):
            wv_raw = [wv_raw] if wv_raw is not None else []

        inputs_dict = {}
        wv_idx = 0
        for inp in node.get("inputs", []):
            iname = inp["name"]
            ilink = inp.get("link")
            has_widget = "widget" in inp and inp["widget"] is not None

            val = None
            if has_widget:
                if wv_idx < len(wv_raw):
                    val = wv_raw[wv_idx]
                    wv_idx += 1
                if ctype in control_after_widgets and iname in control_after_widgets[ctype]:
                    if wv_idx < len(wv_raw) and isinstance(wv_raw[wv_idx], str):
                        wv_idx += 1

            if ilink is not None:
                inputs_dict[iname] = link_map[ilink]
            elif has_widget and (iname in spec_all or "." in iname):
                inputs_dict[iname] = val

        prompt_graph[nid] = {"inputs": inputs_dict, "class_type": ctype}

    for preview_id in ("246", "262", "302", "323"):
        referenced = any(
            isinstance(v, list) and len(v) == 2 and v[0] == preview_id
            for node_obj in prompt_graph.values()
            for v in node_obj["inputs"].values()
        )
        if not referenced and preview_id in prompt_graph:
            del prompt_graph[preview_id]

    prompt_graph["122"]["inputs"]["image"] = input_image_name
    prompt_graph["186"]["inputs"]["target_face_count"] = 24000
    prompt_graph["288"]["inputs"]["value"] = 1024
    prompt_graph["224"]["inputs"]["resolution"] = 1024
    prompt_graph["322"]["inputs"]["filename_prefix"] = output_prefix
    prompt_graph["322"]["inputs"]["width"] = 512
    prompt_graph["322"]["inputs"]["height"] = 512
    return prompt_graph


def prepare_reference_png(src_path: Path, input_name: str) -> Path:
    COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    dst_input = COMFY_INPUT_DIR / input_name
    with Image.open(src_path) as im:
        rgb = Image.new("RGB", im.size, (255, 255, 255))
        if im.mode in ("RGBA", "LA") or ("transparency" in im.info):
            rgba = im.convert("RGBA")
            rgb.paste(rgba, mask=rgba.split()[3])
        else:
            rgb = im.convert("RGB")
        rgb.save(dst_input, format="PNG")
    return dst_input


def generate_3d_model(input_image_path: Path, input_name: str, output_prefix: str, dest_glb: Path):
    prepare_reference_png(input_image_path, input_name)
    graph = convert_image_to_model_workflow(input_name, output_prefix)
    entry = queue_and_wait(graph, f"3D Model {dest_glb.name}", timeout_sec=1200)

    out_file = find_first_output(entry, keys=("3d", "model_3d", "files"))
    if not out_file or not out_file.exists():
        stem = output_prefix.split("/")[-1]
        candidates = sorted(
            (COMFY_OUTPUT_DIR / "qieland").glob(f"{stem}*.glb"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            out_file = candidates[0]
    if not out_file or not out_file.exists():
        raise FileNotFoundError(f"Could not find output GLB for {dest_glb.name}: {entry}")
    copy_to_asset(out_file, dest_glb)


def generate_sfx(description: str, duration: float, seed: int, prefix: str, dest_flac: Path):
    graph = {
        "52:25": {"inputs": {"ckpt_name": "stable_audio_3_medium.safetensors"}, "class_type": "CheckpointLoaderSimple"},
        "52:26": {
            "inputs": {"clip_name": "t5gemma_b_b_ul2.safetensors", "type": "stable_audio", "device": "default"},
            "class_type": "CLIPLoader",
        },
        "52:31": {"inputs": {"value": description}, "class_type": "PrimitiveStringMultiline"},
        "52:35": {"inputs": {"value": False}, "class_type": "PrimitiveBoolean"},
        "52:36": {"inputs": {"value": duration}, "class_type": "PrimitiveFloat"},
        "52:34": {
            "inputs": {"switch": ["52:35", 0], "on_false": ["52:31", 0], "on_true": ["52:31", 0]},
            "class_type": "ComfySwitchNode",
        },
        "52:6": {"inputs": {"text": ["52:34", 0], "clip": ["52:26", 0]}, "class_type": "CLIPTextEncode"},
        "52:7": {"inputs": {"text": "", "clip": ["52:26", 0]}, "class_type": "CLIPTextEncode"},
        "52:11": {"inputs": {"seconds": ["52:36", 0], "batch_size": 1}, "class_type": "EmptyLatentAudio"},
        "52:3": {
            "inputs": {
                "seed": seed,
                "steps": 8,
                "cfg": 1.0,
                "sampler_name": "lcm",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["52:25", 0],
                "positive": ["52:6", 0],
                "negative": ["52:7", 0],
                "latent_image": ["52:11", 0],
            },
            "class_type": "KSampler",
        },
        "52:12": {"inputs": {"samples": ["52:3", 0], "vae": ["52:25", 2]}, "class_type": "VAEDecodeAudio"},
        "57": {"inputs": {"filename_prefix": prefix, "format": "flac", "audio": ["52:12", 0]}, "class_type": "SaveAudioAdvanced"},
    }
    entry = queue_and_wait(graph, f"SFX {dest_flac.name}", timeout_sec=180)
    out_file = find_first_output(entry, keys=("audio",))
    if not out_file or not out_file.exists():
        raise FileNotFoundError(f"Could not find output SFX for {dest_flac.name}: {entry}")
    copy_to_asset(out_file, dest_flac)


def main():
    parser = argparse.ArgumentParser(description="Generate Qieland 4.0 assets from official reference & park design.")
    parser.add_argument("--force", action="store_true", help="Regenerate assets even if target files exist.")
    parser.add_argument("--refresh-map", action="store_true", help="Overwrite park_master_map.png with the Qieland 4.0 asymmetric 5-zone master map.")
    args = parser.parse_args()

    stats = http_get_json("/system_stats")
    print(f"[ComfyUI] Connected! Version {stats['system']['comfyui_version']}, GPU: {stats['devices'][0]['name']}")

    # 0. Copy official reference photos into public/assets/reference/ for UI showcase
    ref_pub_dir = ASSETS_DIR / "reference"
    ref_pub_dir.mkdir(parents=True, exist_ok=True)
    ref_specs = [
        ("VIVACIOUS_VEGETABLE_AUBERGINE__68436.webp", "ref_standard.png", "aubergine_standard.glb"),
        ("VV2A__84205.jpg", "ref_giant.png", "aubergine_giant.glb"),
        ("VV4ABC__60128.jpg", "ref_charm.png", "aubergine_charm.glb"),
    ]
    for src_name, pub_png_name, glb_name in ref_specs:
        src = REF_DIR / src_name
        if src.exists():
            # Save clean PNG preview to public/assets/reference/
            with Image.open(src) as im:
                im.convert("RGB").save(ref_pub_dir / pub_png_name, format="PNG")

    # 1. Park Master Plan Map & Architectural Concept Art (Qwen Image 2.1)
    map_img = ASSETS_DIR / "images" / "park_master_map.png"
    if args.force or args.refresh_map or not map_img.exists():
        generate_image(
            prompt_text=(
                "Hand-illustrated top-down isometric theme park guide map of Qieland 4.0, an asymmetric whimsical aubergine wonderland "
                "with five organically curved themed zones and NO rigid symmetry. A winding emerald lazy river snakes organically around "
                "the inner park crossed by five angled wooden arched bridges at staggered intervals. Slightly northwest on an elevated green "
                "stone terrace stands a nine-tower dusty-plum and olive-green aubergine fairytale castle overlooking a curved fountain courtyard "
                "and a charming Royal Steam Train railway loop circling the island. In the southeast peninsula lies Amuseables Patisserie Bay "
                "with a bakery plaza, spinning teacups, and pink circus carousel; in the northeast rises Aubergine Thrill Peak with purple crystal "
                "caverns, a thrilling roller coaster loop, avocado drop tower, and swinging pirate galleon ship; in the west stretches Bunny's Harvest "
                "Forest with a spinning Dutch windmill, red-roofed barn, glowing giant mushrooms, and grand ferris wheel; on the eastern waterfront sits "
                "Cool Neon Carnival Pier wooden boardwalk with bumper cars and dart tent. Rich storybook watercolor & gouache park map, no text, no labels."
            ),
            negative_prompt="symmetrical grid, mirror symmetry, text, letters, words, numbers, watermark, signature, blurry, dark, realistic photo",
            aspect_ratio="16:9 (Widescreen)",
            prefix="qieland/park_master_map_v4",
            seed=202640,
            dest_path=map_img,
        )

    concept_castle = ASSETS_DIR / "images" / "concept_castle.png"
    if args.force or not concept_castle.exists():
        generate_image(
            prompt_text=(
                "Theme park architectural concept art of the Royal Aubergine Castle and Main Street entrance plaza. "
                "Pastel dusty mauve and cream velvet castle towers topped with olive-green felt calyx leaf domes and golden stars, "
                "ornate three-tier fountain in the foreground plaza, lavender flower beds, striped cafe umbrellas, popcorn carts, "
                "whimsical Disney imagineering concept painting, soft warm sunlight, rich architectural details, no text, no letters."
            ),
            negative_prompt="text, letters, watermark, logo, dark, gritty, horror, blurry",
            aspect_ratio="16:9 (Widescreen)",
            prefix="qieland/concept_castle",
            seed=202622,
            dest_path=concept_castle,
        )

    concept_rides = ASSETS_DIR / "images" / "concept_attractions.png"
    if args.force or not concept_rides.exists():
        generate_image(
            prompt_text=(
                "Whimsical theme park attraction concept illustration showing cute plush vegetable rides: a dusty-purple aubergine "
                "roller coaster curving past flower gardens, a pastel carousel with plush croissant and egg mounts, and a cozy wooden "
                "gondola boat drifting under an arched timber bridge along a crystal blue canal. Soft storybook daylight, vibrant pastel "
                "colors, Disney imagineering watercolor and gouache art style, no text, no watermark."
            ),
            negative_prompt="text, letters, watermark, logo, dark, blurry, deformed",
            aspect_ratio="16:9 (Widescreen)",
            prefix="qieland/concept_attractions",
            seed=202623,
            dest_path=concept_rides,
        )

    # 2. Seamless Ground & Deck Textures (1:1 Square)
    tex_specs = [
        (
            "tex_cobblestone.png",
            "Seamless tileable top-down ground texture of whimsical fairytale plaza cobblestones in warm cream, pale lavender, and soft dusty plum tones, rounded stone pavers with subtle mortar lines, clean flat overhead orthographic PBR albedo texture, even lighting, no shadows, no perspective distortion, no text.",
            301,
        ),
        (
            "tex_grass.png",
            "Seamless tileable top-down ground texture of lush soft stylized theme park meadow grass with tiny clover leaves and delicate scattered white daisies, velvety green felt aesthetic, clean flat overhead orthographic PBR albedo texture, even diffuse lighting, no strong shadows, no text.",
            302,
        ),
        (
            "tex_pathway.png",
            "Seamless tileable top-down texture of warm cream sandstone garden promenade tiles with delicate floral border inlays, clean flat overhead orthographic PBR albedo texture, even diffuse lighting, no shadows, no text.",
            303,
        ),
        (
            "tex_wood.png",
            "Seamless tileable top-down texture of warm honey-oak wooden boardwalk planks for a fairytale theme park bridge deck, subtle wood grain and plank seams, clean flat overhead orthographic PBR albedo texture, even lighting, no shadows, no text.",
            304,
        ),
        (
            "tex_castle_wall.png",
            "Seamless tileable texture of whimsical fairytale castle masonry wall in dusty plum mauve stone blocks and warm cream mortar joints, subtle weathered plaster and embossed decorative stone relief, clean flat orthographic PBR albedo texture, even lighting, no perspective, no text.",
            305,
        ),
        (
            "tex_onion_dome.png",
            "Seamless tileable texture of ornate olive-green fairytale castle onion dome paneling with delicate vertical ribbed seams and subtle antique gold filigree trim lines, velvety metallic sheen aesthetic, clean flat orthographic PBR albedo texture, even lighting, no text.",
            306,
        ),
        (
            "tex_carousel_canopy.png",
            "Seamless tileable texture of pastel berry-pink and warm cream alternating fairytale circus carousel canopy fabric stripes with subtle woven canvas texture and delicate gold border accents, clean flat orthographic PBR albedo texture, even diffuse lighting, no shadows, no text.",
            307,
        ),
        (
            "tex_patisserie_tile.png",
            "Seamless tileable top-down ground texture of Parisian bakery plaza mosaic tiles in warm butter-cream, soft strawberry blush, and pale caramel terracotta diamond checkerboard pavers, clean flat overhead orthographic PBR albedo texture, even lighting, no shadows, no text.",
            308,
        ),
        (
            "tex_forest_moss.png",
            "Seamless tileable top-down ground texture of enchanted fairy woodland floor with lush emerald moss, golden fallen autumn leaves, flat stepping flagstone pebbles, and tiny wild white mushrooms, clean flat overhead orthographic PBR albedo texture, even diffuse lighting, no strong shadows, no text.",
            309,
        ),
    ]
    for fname, prompt_txt, seed in tex_specs:
        dest = ASSETS_DIR / "textures" / fname
        if args.force or not dest.exists():
            generate_image(
                prompt_text=prompt_txt,
                negative_prompt="perspective, horizon, sky, 3d objects, hard shadows, text, watermark, vignette, border",
                aspect_ratio="1:1 (Square)",
                prefix=f"qieland/{fname.replace('.png', '')}",
                seed=seed,
                dest_path=dest,
            )

    # 3. Weather Rain SFX
    rain_sfx = ASSETS_DIR / "audio" / "sfx_rain.flac"
    if args.force or not rain_sfx.exists():
        generate_sfx(
            "Gentle relaxing summer rain shower falling softly on park leaves and cobblestone, soothing ambient rainfall. Length: 4 seconds",
            4.0,
            208,
            "qieland/sfx_rain",
            rain_sfx,
        )

    # 4. Convert all 3 official reference aubergine images to real 3D GLB models!
    for src_name, pub_png_name, glb_name in ref_specs:
        src = REF_DIR / src_name
        dest_glb = ASSETS_DIR / "models" / glb_name
        if src.exists() and (args.force or not dest_glb.exists()):
            stem = glb_name.replace(".glb", "")
            generate_3d_model(
                src,
                f"qieland_{pub_png_name}",
                f"qieland/{stem}",
                dest_glb,
            )

    # 5. Isolated Royal Aubergine Castle Reference -> 3D GLB Model (castle_royal.glb)
    castle_solo = ASSETS_DIR / "images" / "castle_solo_ref.png"
    if args.force or not castle_solo.exists():
        generate_image(
            prompt_text=(
                "3D architectural miniature maquette of a whimsical Disneyland fairytale castle centered against a pure solid white "
                "studio background. Multi-tiered gothic castle built from dusty plum-mauve stone masonry walls and cream stone trim, "
                "nine staggered cylindrical turrets of varying heights crowned with olive-green ribbed onion domes and golden star spires, "
                "a grand arched front doorway, ornate balconies, and glowing gothic windows. Crisp orthographic three-quarter front view, "
                "complete castle fully visible from plinth base to spire tips, clean pure white background, no ground clutter, no trees, no text."
            ),
            negative_prompt="trees, grass, sky, clouds, water, people, text, watermark, blurry, cropped, dark background",
            aspect_ratio="1:1 (Square)",
            prefix="qieland/castle_solo_ref",
            seed=202631,
            dest_path=castle_solo,
        )

    castle_glb = ASSETS_DIR / "models" / "castle_royal.glb"
    if castle_solo.exists() and (args.force or not castle_glb.exists()):
        generate_3d_model(
            castle_solo,
            "qieland_castle_solo_ref.png",
            "qieland/castle_royal",
            castle_glb,
        )

    # 6. Royal Aubergine Steam Train Locomotive Reference -> 3D GLB Model (train_locomotive.glb)
    train_solo = ASSETS_DIR / "images" / "train_solo_ref.png"
    if args.force or not train_solo.exists():
        generate_image(
            prompt_text=(
                "3D miniature toy theme-park steam train locomotive centered against a pure solid white studio background. "
                "Cute chunky vintage fairytale locomotive painted dusty plum purple and antique brass gold with an olive-green flared chimney stack, "
                "arched cab windows, red spoked wheels, and golden cowcatcher fender. Crisp three-quarter front side view, complete single locomotive "
                "on pure white background, no track, no carriages, no ground clutter, no text."
            ),
            negative_prompt="tracks, rails, forest, grass, sky, people, text, watermark, blurry, cropped, dark background",
            aspect_ratio="1:1 (Square)",
            prefix="qieland/train_solo_ref",
            seed=202641,
            dest_path=train_solo,
        )

    train_glb = ASSETS_DIR / "models" / "train_locomotive.glb"
    if train_solo.exists() and (args.force or not train_glb.exists()):
        generate_3d_model(
            train_solo,
            "qieland_train_solo_ref.png",
            "qieland/train_locomotive",
            train_glb,
        )

    print("[ComfyUI] All Qieland 4.0 assets generated successfully!")


if __name__ == "__main__":
    main()
