from .nodes import AnimaLoraSliderStack, NODE_NAME

NODE_CLASS_MAPPINGS = {
    "AnimaLoraSliderStack": AnimaLoraSliderStack,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaLoraSliderStack": NODE_NAME,
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
