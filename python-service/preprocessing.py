import cv2
import numpy as np
from typing import Optional
from pathlib import Path

# Debug output directory
DEBUG_DIR = Path(__file__).parent / "debug"
DEBUG_DIR.mkdir(exist_ok=True)

def preprocess_image(image_bytes: bytes) -> tuple[np.ndarray, np.ndarray]:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Could not decode image")

    # Save original input
    cv2.imwrite(str(DEBUG_DIR / "01_original.png"), img)
    print(f"Saved original to {DEBUG_DIR / '01_original.png'}")

    # Try built-in barcode detector first
    cropped = detect_barcode_region(img)

    if cropped is None:
        print("No barcode region detected, using full image")
        cropped = img

    # Save cropped region
    cv2.imwrite(str(DEBUG_DIR / "02_cropped.png"), cropped)
    print(f"Saved cropped to {DEBUG_DIR / '02_cropped.png'}")

    enhanced = enhance_image(cropped)
    return cropped, enhanced


def detect_barcode_region(img: np.ndarray) -> Optional[np.ndarray]:
    try:
        detector = cv2.barcode.BarcodeDetector()

        # Detect barcode location
        retval, points = detector.detect(img)
        print(f"Barcode detector: retval={retval}, points shape={points.shape if points is not None else None}")

        if retval and points is not None and len(points) > 0:
            # Get bounding box from detected points
            pts = points[0].astype(int)
            x, y, w, h = cv2.boundingRect(pts)
            print(f"Detected barcode at x={x}, y={y}, w={w}, h={h}")

            # Add padding
            padding = 20
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(img.shape[1] - x, w + padding * 2)
            h = min(img.shape[0] - y, h + padding * 2)
            print(f"After padding: x={x}, y={y}, w={w}, h={h}")

            cropped = img[y:y+h, x:x+w]
            return cropped
        else:
            print("No barcode detected by cv2.barcode.BarcodeDetector")

    except Exception as e:
        print(f"Built-in detector failed: {e}")

    return None


def deskew_barcode(img: np.ndarray) -> np.ndarray:
    """Detect barcode line angle and rotate to straighten."""
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    # Edge detection to find barcode lines
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)

    # Use Hough transform to detect lines
    lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=50)

    if lines is None:
        print("No lines detected for deskew")
        return img

    # Collect angles of near-vertical lines (barcode bars)
    angles = []
    for line in lines:
        rho, theta = line[0]
        # Convert to degrees, looking for near-vertical lines (around 90 degrees)
        angle_deg = np.degrees(theta)
        # Vertical lines are around 0 or 180 degrees in Hough space
        if angle_deg < 30 or angle_deg > 150:
            # Convert to deviation from vertical
            if angle_deg < 30:
                angles.append(angle_deg)
            else:
                angles.append(angle_deg - 180)

    if not angles:
        print("No vertical lines detected for deskew")
        return img

    # Use median angle to avoid outliers
    median_angle = np.median(angles)
    print(f"Detected skew angle: {median_angle:.2f} degrees")

    if abs(median_angle) < 0.5:
        print("Skew is minimal, no rotation needed")
        return img

    # Rotate to correct the skew
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    rotated = cv2.warpAffine(img, rotation_matrix, (w, h),
                             flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REPLICATE)

    cv2.imwrite(str(DEBUG_DIR / "02b_deskewed.png"), rotated)
    print(f"Saved deskewed to {DEBUG_DIR / '02b_deskewed.png'}")

    return rotated


def enhance_image(img: np.ndarray) -> np.ndarray:
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    # Save grayscale
    cv2.imwrite(str(DEBUG_DIR / "03_grayscale.png"), gray)
    print(f"Saved grayscale to {DEBUG_DIR / '03_grayscale.png'}")

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Save enhanced
    cv2.imwrite(str(DEBUG_DIR / "04_enhanced.png"), enhanced)
    print(f"Saved enhanced to {DEBUG_DIR / '04_enhanced.png'}")

    return enhanced
