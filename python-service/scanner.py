import cv2
import numpy as np
from pyzbar.pyzbar import decode, ZBarSymbol
from pathlib import Path
from typing import Optional

# SET TO FALSE FOR PRODUCTION TO REMOVE STALLS
ENABLE_DEBUG = False
DEBUG_DIR = Path(__file__).parent / "debug"

BARCODE_TYPES = [
    ZBarSymbol.UPCA, ZBarSymbol.UPCE, ZBarSymbol.EAN13, ZBarSymbol.EAN5
]

def check_image_quality(gray: np.ndarray) -> dict:
    """Quick quality check to detect clearly unreadable images."""
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    contrast = gray.std()
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.count_nonzero(edges) / edges.size

    is_scannable = (
        laplacian_var > 50 and
        contrast > 20 and
        edge_density > 0.01
    )

    return {
        'scannable': is_scannable,
        'blur_score': laplacian_var,
        'contrast': contrast,
        'edge_density': edge_density
    }

def debug_save(name: str, img: np.ndarray):
    if ENABLE_DEBUG:
        DEBUG_DIR.mkdir(exist_ok=True)
        cv2.imwrite(str(DEBUG_DIR / name), img)

def scan_barcode(original: np.ndarray, enhanced: np.ndarray, cropped: Optional[np.ndarray] = None) -> dict:
    """
    Scan for UPC barcode and 5-digit extension.

    Strategy (prioritizes finding both main + extension):
    1. TIER 1: Full image, all 4 rotations (best chance for extension)
    2. TIER 2: Enhanced full image, all 4 rotations
    3. TIER 3: Fixed thresholds on full image
    4. TIER 4: If we have a crop, try it (for hard-to-read main barcodes)
    5. TIER 5: Small angle corrections
    6. TIER 6: Deep processing (upscale, deskew)

    If main UPC found but no extension, keep trying other methods for extension only.
    """
    # Prepare grayscale versions
    gray_full = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY) if len(original.shape) == 3 else original
    gray_enhanced = enhanced  # Already grayscale

    # Quality check
    quality = check_image_quality(gray_full)
    if ENABLE_DEBUG:
        print(f"Quality: blur={quality['blur_score']:.1f}, contrast={quality['contrast']:.1f}, edges={quality['edge_density']:.4f}")

    best_result = {'main': None, 'extension': None}

    # === TIER 1: Full image at all 4 rotations (BEST for extension) ===
    for angle in [0, 90, 180, 270]:
        img = rotate_image(gray_full, angle)
        result = try_decode(img)
        best_result = merge_results(best_result, result)
        if best_result['main'] and best_result['extension']:
            debug_save(f"success_tier1_rot{angle}.png", img)
            return best_result

    # === TIER 2: Enhanced full image at all rotations ===
    for angle in [0, 90, 180, 270]:
        img = rotate_image(gray_enhanced, angle)
        result = try_decode(img)
        best_result = merge_results(best_result, result)
        if best_result['main'] and best_result['extension']:
            debug_save(f"success_tier2_rot{angle}.png", img)
            return best_result

    # === TIER 3: Fixed thresholds on full image ===
    for thresh_val in [140, 160, 180]:
        _, thresh = cv2.threshold(gray_full, thresh_val, 255, cv2.THRESH_BINARY)
        for angle in [0, 90, 180, 270]:
            img = rotate_image(thresh, angle)
            result = try_decode(img)
            best_result = merge_results(best_result, result)
            if best_result['main'] and best_result['extension']:
                debug_save(f"success_tier3_thresh{thresh_val}_rot{angle}.png", img)
                return best_result

    # === TIER 4: Try cropped region if available (helps with hard-to-read main barcodes) ===
    if cropped is not None:
        gray_crop = cv2.cvtColor(cropped, cv2.COLOR_BGR2GRAY) if len(cropped.shape) == 3 else cropped
        for angle in [0, 90, 180, 270]:
            img = rotate_image(gray_crop, angle)
            result = try_decode(img)
            best_result = merge_results(best_result, result)
            if best_result['main'] and best_result['extension']:
                debug_save(f"success_tier4_crop_rot{angle}.png", img)
                return best_result

        # Also try enhanced crop
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced_crop = clahe.apply(gray_crop)
        for angle in [0, 90, 180, 270]:
            img = rotate_image(enhanced_crop, angle)
            result = try_decode(img)
            best_result = merge_results(best_result, result)
            if best_result['main'] and best_result['extension']:
                debug_save(f"success_tier4_crop_enh_rot{angle}.png", img)
                return best_result

    # Early exit if image quality is too low and we still have nothing
    if not quality['scannable'] and not best_result['main']:
        if ENABLE_DEBUG:
            print("Skipping expensive tiers - image quality too low")
        return best_result

    # === TIER 5: Small angle corrections ===
    for small_angle in [-5, -3, 3, 5]:
        corrected = rotate_by_angle(gray_full, small_angle)
        result = try_decode(corrected)
        best_result = merge_results(best_result, result)
        if best_result['main'] and best_result['extension']:
            debug_save(f"success_tier5_angle{small_angle}.png", corrected)
            return best_result

    # === TIER 6: Deep processing (expensive) ===
    for angle in [0, 90]:
        img = rotate_image(gray_full, angle)

        # Upscale and threshold
        result = upscale_and_clean(img, f"deep_{angle}")
        best_result = merge_results(best_result, result)
        if best_result['main'] and best_result['extension']:
            return best_result

        # Deskew
        result = deskew_and_decode(img)
        best_result = merge_results(best_result, result)
        if best_result['main'] and best_result['extension']:
            return best_result

    return best_result

def merge_results(existing: dict, new: dict) -> dict:
    """Merge two results, keeping any found values."""
    return {
        'main': existing['main'] or new['main'],
        'extension': existing['extension'] or new['extension']
    }

def rotate_by_angle(img: np.ndarray, angle: float) -> np.ndarray:
    """Rotate image by arbitrary angle (for small corrections)"""
    h, w = img.shape[:2]
    matrix = cv2.getRotationMatrix2D((w//2, h//2), angle, 1.0)
    return cv2.warpAffine(img, matrix, (w, h), flags=cv2.INTER_LINEAR, borderValue=255)

def rotate_image(img: np.ndarray, angle: int) -> np.ndarray:
    if angle == 90: return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if angle == 180: return cv2.rotate(img, cv2.ROTATE_180)
    if angle == 270: return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img

def upscale_and_clean(gray: np.ndarray, prefix: str) -> dict:
    h, w = gray.shape[:2]
    if w < 400:
        scale = 3
        img = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
    else:
        img = gray

    # Try fixed threshold values
    for thresh_val in [140, 160, 180, 120]:
        _, thresh = cv2.threshold(img, thresh_val, 255, cv2.THRESH_BINARY)
        result = try_decode(thresh)
        if result['main']:
            return result

    # Otsu threshold fallback
    blurred = cv2.GaussianBlur(img, (3, 3), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    result = try_decode(thresh)
    if not result['main']:
        result = try_decode(cv2.bitwise_not(thresh))

    if not result['main']:
        # Horizontal blur (good for motion blur)
        h_blur = cv2.blur(img, (5, 1))
        _, thresh_h = cv2.threshold(h_blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        result = try_decode(thresh_h)

    return result

def deskew_and_decode(gray: np.ndarray) -> dict:
    small = cv2.resize(gray, (0,0), fx=0.5, fy=0.5)
    edges = cv2.Canny(small, 50, 150)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, 80)

    if lines is None: return {'main': None, 'extension': None}

    angles = []
    for line in lines:
        theta = line[0][1]
        deg = np.degrees(theta)
        if deg < 30: angles.append(deg)
        elif deg > 150: angles.append(deg - 180)

    if not angles: return {'main': None, 'extension': None}

    median_angle = np.median(angles)
    if abs(median_angle) < 0.5: return {'main': None, 'extension': None}

    h, w = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((w//2, h//2), median_angle, 1.0)
    deskewed = cv2.warpAffine(gray, matrix, (w, h), flags=cv2.INTER_LINEAR)

    return try_decode(deskewed)

def try_decode(image: np.ndarray) -> dict:
    barcodes = decode(image, symbols=BARCODE_TYPES)
    result = {'main': None, 'extension': None}
    for barcode in barcodes:
        data = barcode.data.decode('utf-8')
        if barcode.type in ['UPCA', 'UPCE', 'EAN13']:
            result['main'] = data
        elif barcode.type == 'EAN5':
            result['extension'] = data
    return result
