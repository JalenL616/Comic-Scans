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
        
        
        original, enhanced = preprocess_image(contents)

        upc = scan_barcode(original, enhanced)
        
        if not upc:
            raise HTTPException(status_code=400, detail="No barcode found")
        
        return {"upc": upc}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))