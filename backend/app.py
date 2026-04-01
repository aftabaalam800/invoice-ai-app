from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel
import pytesseract
from PIL import Image
import pdf2image
import openai
import os
import uuid
import json
from datetime import datetime
from typing import List, Optional
import hashlib
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

openai.api_key = os.getenv("OPENAI_API_KEY")

class InvoiceData(BaseModel):
    vendor_name: str
    invoice_number: str
    invoice_date: str
    due_date: Optional[str] = None
    total_amount: float
    currency: str = "USD"
    line_items: Optional[List[dict]] = None
    confidence_score: float = 0.0

def extract_text(file_bytes: bytes, filename: str) -> str:
    ext = filename.split('.')[-1].lower()
    
    if ext in ['jpg', 'jpeg', 'png']:
        image = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(image)
    elif ext == 'pdf':
        images = pdf2image.convert_from_bytes(file_bytes)
        text = ""
        for image in images:
            text += pytesseract.image_to_string(image)
    else:
        raise ValueError("Unsupported file format")
    
    return text

def parse_with_llm(ocr_text: str, format_template: Optional[dict] = None) -> dict:
    system_prompt = """
    Extract invoice data into JSON format. Return ONLY valid JSON.
    Fields: vendor_name, invoice_number, invoice_date (YYYY-MM-DD), 
    due_date (YYYY-MM-DD), total_amount (number), currency (3-letter code),
    line_items (array of {description, quantity, unit_price, amount})
    If field missing, use null.
    """
    
    if format_template:
        system_prompt += f"\nUse this format template: {json.dumps(format_template)}"
    
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Extract from:\n{ocr_text[:4000]}"}
        ],
        temperature=0.1
    )
    
    result = response.choices[0].message.content
    result = result.replace("```json", "").replace("```", "").strip()
    return json.loads(result)

def get_format_hash(ocr_text: str) -> str:
    lines = ocr_text.split('\n')[:20]
    structure = ''.join([str(len(l)) for l in lines])
    return hashlib.md5(structure.encode()).hexdigest()[:16]

@app.post("/api/invoices/upload")
async def upload_invoice(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        
        ocr_text = extract_text(contents, file.filename)
        if not ocr_text.strip():
            raise HTTPException(400, "No text found in document")
        
        format_hash = get_format_hash(ocr_text)
        
        similar = supabase.table("invoice_templates")\
            .select("*")\
            .eq("format_hash", format_hash)\
            .execute()
        
        template = similar.data[0] if similar.data else None
        template_config = template.get("parsing_config") if template else None
        
        extracted = parse_with_llm(ocr_text, template_config)
        
        validated = InvoiceData(**extracted)
        
        file_ext = file.filename.split('.')[-1]
        file_path = f"invoices/{uuid.uuid4()}.{file_ext}"
        
        supabase.storage.from_("invoices").upload(
            file_path, 
            contents,
            {"content-type": file.content_type}
        )
        
        file_url = supabase.storage.from_("invoices").get_public_url(file_path)
        
        invoice_data = {
            "id": str(uuid.uuid4()),
            "user_id": "default_user",
            "file_name": file.filename,
            "file_url": file_url,
            "format_hash": format_hash,
            "vendor_name": validated.vendor_name,
            "invoice_number": validated.invoice_number,
            "invoice_date": validated.invoice_date,
            "due_date": validated.due_date,
            "total_amount": validated.total_amount,
            "currency": validated.currency,
            "line_items": json.dumps(validated.line_items),
            "confidence_score": validated.confidence_score,
            "raw_ocr": ocr_text[:1000],
            "created_at": datetime.utcnow().isoformat()
        }
        
        supabase.table("invoices").insert(invoice_data).execute()
        
        if not similar.data:
            supabase.table("invoice_templates").insert({
                "format_hash": format_hash,
                "parsing_config": validated.dict(),
                "usage_count": 1
            }).execute()
        else:
            supabase.table("invoice_templates")\
                .update({"usage_count": template["usage_count"] + 1})\
                .eq("format_hash", format_hash)\
                .execute()
        
        return {
            "id": invoice_data["id"],
            "file_url": file_url,
            "extracted_data": validated.dict(),
            "format_hash": format_hash,
            "created_at": invoice_data["created_at"]
        }
        
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/analytics")
async def get_analytics():
    invoices = supabase.table("invoices").select("*").execute()
    
    data = invoices.data
    
    vendor_totals = {}
    currency_totals = {}
    monthly_trend = {}
    
    for inv in data:
        vendor = inv["vendor_name"]
        amount = float(inv["total_amount"])
        currency = inv["currency"]
        date = inv["invoice_date"][:7] if inv["invoice_date"] else None
        
        vendor_totals[vendor] = vendor_totals.get(vendor, 0) + amount
        currency_totals[currency] = currency_totals.get(currency, 0) + amount
        
        if date:
            monthly_trend[date] = monthly_trend.get(date, 0) + amount
    
    return {
        "total_invoices": len(data),
        "total_spend": sum(float(i["total_amount"]) for i in data),
        "vendor_totals": vendor_totals,
        "currency_totals": currency_totals,
        "monthly_trend": dict(sorted(monthly_trend.items())),
        "invoices_by_vendor": {v: len([i for i in data if i["vendor_name"] == v]) for v in set(i["vendor_name"] for i in data)}
    }

@app.post("/api/invoices/batch")
async def batch_upload(files: List[UploadFile] = File(...)):
    results = []
    for file in files:
        try:
            result = await upload_invoice(file)
            results.append({"file": file.filename, "success": True, "data": result})
        except Exception as e:
            results.append({"file": file.filename, "success": False, "error": str(e)})
    return {"results": results}

@app.get("/api/invoices/check-duplicate/{invoice_number}")
async def check_duplicate(invoice_number: str):
    existing = supabase.table("invoices")\
        .select("*")\
        .eq("invoice_number", invoice_number)\
        .execute()
    return {"is_duplicate": len(existing.data) > 0, "existing": existing.data}