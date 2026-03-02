import json
import math
import random
from typing import List, Dict, Any, Optional

class RecommendationService:
    def __init__(self, db_path: str):
        with open(db_path, 'r') as f:
            self.food_db = json.load(f)

    def normalize_features(self, food: Dict[str, Any]) -> List[float]:
        return [
            food.get('cal', 0) / 600,
            food.get('prot', 0) / 50,
            food.get('carb', 0) / 100,
            food.get('fat', 0) / 40,
            food.get('fiber', 0) / 15,
            food.get('price', 0) / 200
        ]

    def euclidean_distance(self, a: List[float], b: List[float]) -> float:
        return math.sqrt(sum((x - y)**2 for x, y in zip(a, b)))

    def knn_recommend(self, target_food: Dict[str, Any], candidates: List[Dict[str, Any]], k: int = 5) -> List[Dict[str, Any]]:
        target_feat = self.normalize_features(target_food)
        distances = []
        for f in candidates:
            if f['id'] == target_food.get('id'):
                continue
            dist = self.euclidean_distance(target_feat, self.normalize_features(f))
            distances.append({'food': f, 'dist': dist})
        
        distances.sort(key=lambda x: x['dist'])
        return [d['food'] for d in distances[:k]]

    def content_based_filter(self, profile: Dict[str, Any], meal_type: str) -> List[Dict[str, Any]]:
        conditions = profile.get('conditions', [])
        preferences = profile.get('preferences', [])
        diet_type = profile.get('dietType', 'mixed')
        weekly_budget = profile.get('weeklyBudget', 2000)
        avoided_meals = profile.get('avoidedMeals', [])
        budget_per_meal = weekly_budget / (7 * 4)

        filtered = []
        for food in self.food_db:
            if meal_type not in food.get('meals', []):
                continue
            if food['id'] in avoided_meals:
                continue
            
            # Diet type filter
            if diet_type == 'vegetarian' and food.get('type') == 'nonveg':
                continue
            if diet_type == 'nonveg' and food.get('type') == 'veg':
                continue
            
            # Medical condition filters
            if 'diabetes' in conditions and not food.get('diabetic'):
                continue
            if 'hypertension' in conditions and not food.get('hyp'):
                continue
            if 'cholesterol' in conditions and not food.get('chol'):
                continue
            if 'thyroid' in conditions and not food.get('thyroid'):
                continue
            
            # PCOS
            if 'pcos' in conditions:
                if food.get('fat', 0) > 18 or food.get('carb', 0) > 70:
                    continue
            
            # IBS
            if 'ibs' in conditions:
                if food.get('fat', 0) > 20 or (food.get('fiber', 0) < 1 and food.get('cal', 0) > 200):
                    continue
            
            # Preference filters
            if 'lowcarb' in preferences and food.get('carb', 0) > 25:
                continue
            if 'highprotein' in preferences and food.get('prot', 0) < 10:
                continue
            if 'lowfat' in preferences and food.get('fat', 0) > 10:
                continue
            if 'diabetic' in preferences and not food.get('diabetic'):
                continue
            
            # Budget filter
            if food.get('price', 0) > budget_per_meal * 2.5:
                continue
                
            filtered.append(food)
        return filtered

    def generate_meal_plan(self, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        plan = []
        meal_types = ['breakfast', 'lunch', 'dinner', 'snack']
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        target_cal = profile.get('targetCal', 2000)
        weekly_budget = profile.get('weeklyBudget', 2000)
        preferences = profile.get('preferences', [])

        for day_idx in range(7):
            day_meals = {}
            day_total_cost = 0
            
            for mtype in meal_types:
                candidates = self.content_based_filter(profile, mtype)
                
                # Relaxation
                if not candidates:
                    candidates = [f for f in self.food_db if mtype in f.get('meals', [])]
                    if profile.get('dietType') == 'vegetarian':
                        candidates = [f for f in candidates if f.get('type') != 'nonveg']
                    elif profile.get('dietType') == 'nonveg':
                        candidates = [f for f in candidates if f.get('type') != 'veg']
                
                if not candidates:
                    continue
                
                # KNN target
                cal_factor = {'breakfast': 0.25, 'lunch': 0.35, 'dinner': 0.30, 'snack': 0.10}[mtype]
                target_food = {
                    'id': -1,
                    'cal': target_cal * cal_factor,
                    'prot': 25 if mtype in ['lunch', 'dinner'] else 10,
                    'carb': 20 if 'lowcarb' in preferences else 40,
                    'fat': 5 if 'lowfat' in preferences else 12,
                    'fiber': 5,
                    'price': weekly_budget / 28
                }
                
                knn_pool = self.knn_recommend(target_food, candidates, min(len(candidates), 5))
                pool = knn_pool if knn_pool else candidates
                
                # Selection logic (pseudo-random based on day)
                idx = (day_idx * 3 + meal_types.index(mtype)) % len(pool)
                selected = pool[idx]
                
                day_meals[mtype] = selected
                day_total_cost += selected.get('price', 0)
            
            plan.append({
                'day': day_idx,
                'meals': day_meals,
                'cost': day_total_cost
            })
        return plan
