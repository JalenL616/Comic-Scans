from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from preprocessing import preprocess_image
from scanner import scan_barcode

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Python barcode service running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/scan")
async def scan_upc(image: UploadFile = File(...)):
    try:
        contents = await image.read()

        # Returns: (full_original, enhanced_full, cropped_region or None)
        original, enhanced, cropped = preprocess_image(contents)

        # Pass all three to scanner - it will try full image first, then cropped as fallback
        result = scan_barcode(original, enhanced, cropped)

        if not result['main']:
            raise HTTPException(status_code=400, detail="No barcode found")

        return {
            "upc": result['main'],
            "extension": result['extension']
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))