import logging
import os

import comfy.sd
import comfy.utils
import folder_paths

NODE_NAME = "Anima LoRA Slider Stack"
LOG_PREFIX = f"[{NODE_NAME}]"
# Name of the frontend widget holding every row; must match STACK_WIDGET in the JS.
STACK_INPUT = "lora_stack"


class AnyType(str):
    """A type string that compares equal to every other type (credit: pythongosssss / rgthree)."""

    def __ne__(self, other):
        return False


any_type = AnyType("*")


class FlexibleOptionalInputType(dict):
    """Accepts any optional input key, so the frontend can send a dynamic number of LoRA rows.

    Same approach as rgthree's Power Lora Loader: ComfyUI asks `key in optional` and then reads
    `optional[key][0]` for the type of every input it receives. Declared keys behave normally;
    any other key is reported as present with the wildcard type.
    """

    def __init__(self, type, data=None):
        super().__init__()
        self.type = type
        self.data = data or {}
        for k, v in self.data.items():
            self[k] = v

    def __getitem__(self, key):
        if key in self.data:
            return self.data[key]
        return (self.type,)

    def __contains__(self, key):
        return True


def get_lora_by_filename(name, lora_paths=None):
    """Resolves a LoRA name to an entry of the `loras` folder list, tolerating moved files.

    Tries an exact match first, then without extension, then by bare filename, so a workflow
    shared between machines with different sub-folders still finds the file.
    """
    lora_paths = lora_paths if lora_paths is not None else folder_paths.get_filename_list("loras")
    if name in lora_paths:
        return name

    no_ext = [os.path.splitext(p)[0] for p in lora_paths]
    name_no_ext = os.path.splitext(name)[0]
    if name_no_ext in no_ext:
        return lora_paths[no_ext.index(name_no_ext)]

    basenames = [os.path.basename(p) for p in lora_paths]
    base = os.path.basename(name)
    if base in basenames:
        return lora_paths[basenames.index(base)]

    basenames_no_ext = [os.path.splitext(b)[0] for b in basenames]
    base_no_ext = os.path.splitext(base)[0]
    if base_no_ext in basenames_no_ext:
        return lora_paths[basenames_no_ext.index(base_no_ext)]

    return None


def _to_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _describe(row):
    title = str(row.get("title") or "").strip()
    return f"{title} ({row['lora']})" if title else row["lora"]


def _iter_rows(kwargs):
    """Yields the LoRA row dicts sent by the UI's stack widget, in display order."""
    stack = kwargs.get(STACK_INPUT)
    rows = stack.get("loras") if isinstance(stack, dict) else None
    for row in rows or []:
        if isinstance(row, dict):
            yield row


class AnimaLoraSliderStack:
    """Applies any number of LoRAs to a model (and optionally clip), each with its own slider.

    The rows are built by the frontend and arrive in a single `lora_stack` input:
        {"loras": [{"on": bool, "lora": str, "title": str, "strength": float, "random": bool,
                    "min": float, "max": float, "step": float, "labelMin": str, "labelMax": str},
                   ...]}
    A row is skipped when it is toggled off, has no LoRA picked, or its strength is 0.
    `title` and the slider settings are display-only. With `random` on, the frontend rolls a new
    `strength` before every queued generation, so the backend only ever sees a plain strength.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
            },
            # The UI-built `lora_stack` widget has no declared type, so optional must accept any key.
            "optional": FlexibleOptionalInputType(any_type, {
                "clip": ("CLIP",),
            }),
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    FUNCTION = "load_loras"
    CATEGORY = "loaders"
    DESCRIPTION = (
        "Stack any number of LoRAs, each with an optional title and a configurable slider (min, "
        "max, step and end labels) that can roll a random value for every generation. LoRAs whose "
        "slider sits at 0 are not loaded."
    )

    def __init__(self):
        # Loaded LoRA state dicts keyed by full path, kept between runs so moving a slider
        # doesn't re-read every file from disk. Pruned to the LoRAs used by the latest run.
        self._lora_cache = {}

    def load_loras(self, model, clip=None, **kwargs):
        lora_paths = folder_paths.get_filename_list("loras")
        used = {}

        for row in _iter_rows(kwargs):
            if not row.get("on", True) or not row.get("lora"):
                continue

            strength = _to_float(row.get("strength"), 0.0)
            lo = _to_float(row.get("min"))
            hi = _to_float(row.get("max"))
            if lo is not None and hi is not None and lo <= hi:
                strength = max(lo, min(hi, strength))
            if strength == 0:
                continue

            lora_name = get_lora_by_filename(row["lora"], lora_paths)
            if lora_name is None:
                logging.warning(f"{LOG_PREFIX} LoRA not found, skipping: {_describe(row)}")
                continue

            lora_path = folder_paths.get_full_path("loras", lora_name)
            if lora_path is None:
                logging.warning(f"{LOG_PREFIX} LoRA file missing, skipping: {lora_name}")
                continue
            lora = used.get(lora_path) or self._lora_cache.get(lora_path)
            if lora is None:
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
            used[lora_path] = lora

            model, clip = comfy.sd.load_lora_for_models(
                model, clip, lora, strength, strength if clip is not None else 0
            )

        self._lora_cache = used
        return (model, clip)
