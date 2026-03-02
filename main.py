from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import random
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from services.recommendation import RecommendationService

app = FastAPI(title="NutriAI API")

# Enable CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize service
db_path = os.path.join(os.path.dirname(__file__), "data", "food_db.json")
rec_service = RecommendationService(db_path)

@app.get("/")
async def root():
    return FileResponse("index.html")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("favicon.ico") if os.path.exists("favicon.ico") else None

@app.get("/api/health")
async def health():
    return {"status": "healthy"}

class UserProfile(BaseModel):
    name: str
    age: int
    gender: str
    height: float
    weight: float
    activity: str
    goal: str
    dietType: str
    conditions: List[str]
    preferences: List[str]
    weeklyBudget: float
    targetCal: int
    avoidedMeals: List[int]

class SwapRequest(BaseModel):
    profile: UserProfile
    dayIdx: int
    mealType: str
    currentMealId: int

@app.post("/api/generate-plan")
async def generate_plan(profile: UserProfile):
    try:
        plan = rec_service.generate_meal_plan(profile.model_dump())
        return {"plan": plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/swap-meal")
async def swap_meal(request: SwapRequest):
    try:
        profile_dict = request.profile.model_dump()
        candidates = rec_service.content_based_filter(profile_dict, request.mealType)
        candidates = [f for f in candidates if f['id'] != request.currentMealId]
        
        if not candidates:
             raise HTTPException(status_code=404, detail="No alternative meals found")
        
        # Target for KNN
        preferences = profile_dict.get('preferences', [])
        target_cal = profile_dict.get('targetCal', 2000)
        cal_factor = {'breakfast': 0.25, 'lunch': 0.35, 'dinner': 0.30, 'snack': 0.10}[request.mealType]
        
        target_food = {
            'id': -1,
            'cal': target_cal * cal_factor,
            'prot': 25 if request.mealType in ['lunch', 'dinner'] else 10,
            'carb': 20 if 'lowcarb' in preferences else 40,
            'fat': 5 if 'lowfat' in preferences else 12,
            'fiber': 5,
            'price': profile_dict.get('weeklyBudget', 2000) / 28
        }
        
        knn_res = rec_service.knn_recommend(target_food, candidates, min(len(candidates), 5))
        
        if knn_res:
            swapped = random.choice(knn_res)
        elif candidates:
            swapped = random.choice(candidates)
        else:
            raise HTTPException(status_code=404, detail="No suitable swap found")
        
        return {"swapped": swapped}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files (must be after ALL API routes to avoid shadowing)
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
