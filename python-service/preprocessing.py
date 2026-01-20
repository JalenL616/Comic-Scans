import cv2
import numpy as np
from typing import Optional, Tuple
from pathlib import Path

# SET TO FALSE FOR PRODUCTION
ENABLE_DEBUG = False
DEBUG_DIR = Path(__file__).parent / "debug"

def preprocess_image(image_bytes: bytes) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
    """
    Returns: (full_original, enhanced_full, cropped_region or None)

    Key change: Returns the FULL original image, not cropped.
    Cropping is now optional and returned separately for fallback use.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None: raise ValueError("Could not decode image")

    if ENABLE_DEBUG:
        DEBUG_DIR.mkdir(exist_ok=True)
        cv2.imwrite(str(DEBUG_DIR / "01_original.png"), img)

    h, w = img.shape[:2]

    # 1. Create enhanced version of FULL image (for Tier 2 scanning)
    gray_full = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced_full = clahe.apply(gray_full)

    if ENABLE_DEBUG:
        cv2.imwrite(str(DEBUG_DIR / "02_enhanced_full.png"), enhanced_full)

    # 2. Attempt focused detection for fallback cropping
    cropped = detect_barcode_region(img)

    # Only use crop if it's reasonably sized (not most of the image)
    if cropped is not None and (cropped.shape[0] * cropped.shape[1]) > (h * w * 0.6):
        cropped = None  # Crop is too large, not useful

    if ENABLE_DEBUG and cropped is not None:
        cv2.imwrite(str(DEBUG_DIR / "03_cropped.png"), cropped)

    return img, enhanced_full, cropped

def detect_barcode_region(img: np.ndarray, extra_right_padding: float = 0.3) -> Optional[np.ndarray]:
    """
    Detect barcode region with extra padding on the right side to capture extensions.

    Args:
        img: Input image
        extra_right_padding: Extra padding ratio for right side (default 30% to catch extension)
    """
    try:
        detector = cv2.barcode.BarcodeDetector()
        retval, points = detector.detect(img)

        if retval and points is not None:
            pts = points[0].astype(int)
            x, y, w, h = cv2.boundingRect(pts)

            # Standard padding
            pad_w = int(w * 0.15)
            pad_h = int(h * 0.15)

            # Extra padding on right side for extension barcode
            extra_right = int(w * extra_right_padding)

            x = max(0, x - pad_w)
            y = max(0, y - pad_h)
            new_w = min(img.shape[1] - x, w + pad_w + extra_right)
            new_h = min(img.shape[0] - y, h + (pad_h * 2))

            return img[y:y+new_h, x:x+new_w]
    except:
        pass
    return None

def get_extended_region(img: np.ndarray, main_barcode_location: tuple) -> Optional[np.ndarray]:
    """
    If we found the main barcode but not the extension, get a wider region
    to the right of the main barcode where the extension should be.
    """
    # This could be implemented if we track barcode locations from pyzbar
    # For now, return None (not implemented)
    return None
