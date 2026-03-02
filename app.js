/* ===========================
   NutriAI – app.js
   AI-Powered Diet Recommendation System
   Features: BMR/TDEE, KNN, Content-Based Filtering, Weekly Adaptation
   =========================== */

'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  profile: null,
  currentPlan: null,
  progressLog: JSON.parse(localStorage.getItem('nutriai_progress') || '[]'),
  feedbackHistory: JSON.parse(localStorage.getItem('nutriai_feedback') || '[]'),
  avoidedMeals: JSON.parse(localStorage.getItem('nutriai_avoid') || '[]'),
  currentRating: 0,
  currentDay: 0,
  weekNumber: parseInt(localStorage.getItem('nutriai_week') || '1'),
};

// ─── FOOD DATABASE MOVED TO BACKEND ──────────────────────────────────────────
const BACKEND_URL = '';

// ─── ACTIVITY MULTIPLIERS ────────────────────────────────────────────────────
const ACTIVITY_MAP = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9
};

// ─── GOAL CALORIE ADJUSTMENT ─────────────────────────────────────────────────
const GOAL_ADJUST = { lose: -500, maintain: 0, gain: 300, health: -200 };

// ─── DAYS OF WEEK ────────────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = { breakfast: '🌅 Breakfast', lunch: '☀️ Lunch', dinner: '🌙 Dinner', snack: '🍎 Snack' };

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
function calcBMR(weight, height, age, gender) {
  if (gender === 'male') return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
  if (gender === 'female') return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
  return 500 + (10 * weight) + (6.25 * height) - (5 * age);
}

function calcTDEE(bmr, activity) {
  return bmr * (ACTIVITY_MAP[activity] || 1.375);
}

function calcTargetCals(tdee, goal) {
  return Math.max(1200, tdee + (GOAL_ADJUST[goal] || 0));
}

function calcBMI(weight, height) {
  const h = height / 100;
  return parseFloat((weight / (h * h)).toFixed(1));
}

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: '#3b82f6' };
  if (bmi < 25) return { label: 'Normal', color: '#00d4aa' };
  if (bmi < 30) return { label: 'Overweight', color: '#fbbf24' };
  return { label: 'Obese', color: '#f87171' };
}

function idealWeightRange(height, gender) {
  // Devine formula
  const hIn = (height - 152.4) / 2.54;
  const base = gender === 'female' ? 45.5 : 50;
  const mid = base + 2.3 * hIn;
  return { low: Math.round(mid - 5), high: Math.round(mid + 5) };
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── BUDGET PRESET PICKER ────────────────────────────────────────────────────
const BUDGET_DESC = {
  700: '🟢 Economy: simple home-cooked meals, dals & rice staples',
  1500: '🔵 Standard: balanced variety, some protein-rich options',
  2500: '🟣 Comfortable: good variety with proteins, dairy & fresh produce',
  5000: '🟡 Premium: high-quality produce, exotic proteins & superfoods',
};

function setBudget(amount, btn) {
  document.getElementById('userBudget').value = amount;
  document.querySelectorAll('.budget-tier').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const desc = document.getElementById('budgetDesc');
  if (desc) desc.textContent = BUDGET_DESC[amount] || '';
}

function clearBudgetActive() {
  document.querySelectorAll('.budget-tier').forEach(b => b.classList.remove('active'));
  const desc = document.getElementById('budgetDesc');
  const val = parseInt(document.getElementById('userBudget').value);
  if (desc) {
    if (val < 900) desc.textContent = '🟢 Economy range — simple, filling meals';
    else if (val < 2000) desc.textContent = '🔵 Standard range — balanced daily nutrition';
    else if (val < 3500) desc.textContent = '🟣 Comfortable range — good variety & quality';
    else desc.textContent = '🟡 Premium range — gourmet & high-quality options';
  }
}

// ─── TAB SWITCHER ────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  // Hide hero on non-profile tabs
  const hero = document.getElementById('heroSection');
  hero.style.display = name === 'profile' ? '' : 'none';
  if (name === 'progress') renderProgressChart();
  if (name === 'feedback' && state.currentPlan) renderAvoidMeals();
}




// ─── MAIN GENERATE FUNCTION ──────────────────────────────────────────────────
function generatePlan() {
  // Collect inputs
  const name = document.getElementById('userName').value.trim();
  const age = parseFloat(document.getElementById('userAge').value);
  const gender = document.getElementById('userGender').value;
  const height = parseFloat(document.getElementById('userHeight').value);
  const weight = parseFloat(document.getElementById('userWeight').value);
  const activity = document.getElementById('activityLevel').value;
  const goal = document.getElementById('userGoal').value;
  const budget = parseFloat(document.getElementById('userBudget').value) || 2000;

  // Validation
  const missing = [];
  if (!name) missing.push('Name');
  if (!age || age < 10 || age > 100) missing.push('Age (10–100)');
  if (!gender) missing.push('Gender');
  if (!height || height < 100) missing.push('Height (>100cm)');
  if (!weight || weight < 20) missing.push('Weight (>20kg)');
  if (!activity) missing.push('Activity Level');
  if (!goal) missing.push('Health Goal');

  if (missing.length > 0) {
    showToast('⚠️ Please fill: ' + missing.join(', '));
    return;
  }

  const dietType = document.querySelector('input[name="dietType"]:checked')?.value || 'mixed';
  const conditions = [...document.querySelectorAll('#conditionsGroup input:checked')].map(i => i.value);
  const preferences = [...document.querySelectorAll('#foodPrefsGroup input:checked')].map(i => i.value);

  // Calculations
  const bmr = calcBMR(weight, height, age, gender);
  const tdee = calcTDEE(bmr, activity);
  const targetCal = calcTargetCals(tdee, goal);
  const bmi = calcBMI(weight, height);
  const bmiCat = bmiCategory(bmi);
  const idealW = idealWeightRange(height, gender);

  const profile = {
    name, age, gender, height, weight, activity, goal, dietType,
    conditions, preferences, weeklyBudget: budget,
    bmr: Math.round(bmr), tdee: Math.round(tdee), targetCal: Math.round(targetCal),
    bmi, bmiCat, idealW, avoidedMeals: state.avoidedMeals
  };

  state.profile = profile;

  // Show loading animation
  showLoading(profile);
}

async function showLoading(profile) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('active');

  const steps = ['step1', 'step2', 'step3', 'step4', 'step5'];
  const msgs = [
    'Calculating BMR & TDEE...',
    'Running KNN Algorithm on Backend...',
    'Filtering health conditions...',
    'Building 7-Day Meal Plan...',
    'Optimizing for your budget...'
  ];

  let i = 0;
  const interval = setInterval(async () => {
    if (i > 0) {
      document.getElementById(steps[i - 1]).classList.remove('active');
      document.getElementById(steps[i - 1]).classList.add('done');
      document.getElementById(steps[i - 1]).textContent = '✓ ' + msgs[i - 1].replace('...', '');
    }
    if (i < steps.length) {
      document.getElementById(steps[i]).classList.add('active');
      document.getElementById('loadingText').textContent = msgs[i];
      i++;
    } else {
      clearInterval(interval);
      try {
        const response = await fetch(`${BACKEND_URL}/api/generate-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile)
        });

        if (!response.ok) throw new Error('Failed to generate plan');
        const data = await response.json();
        state.currentPlan = data.plan;

        overlay.classList.remove('active');
        // Reset steps
        steps.forEach((s, idx) => {
          const el = document.getElementById(s);
          el.className = 'load-step' + (idx === 0 ? ' active' : '');
          el.textContent = (idx === 0 ? '✓ ' : '⏳ ') + msgs[idx].replace('...', '');
        });
        document.getElementById('loadingText').textContent = 'Initializing AI Engine...';

        renderPlan(profile, state.currentPlan);
        switchTab('plan');
        showToast('✅ Your personalized plan is ready, ' + profile.name + '!');
      } catch (err) {
        console.error(err);
        overlay.classList.remove('active');
        showToast('❌ Error connecting to  backend. Ensure server is running.');
      }
    }
  }, 650);
}

// ─── RENDER PLAN ─────────────────────────────────────────────────────────────
function renderPlan(profile, plan) {
  const container = document.getElementById('planContent');

  const totalWeeklyCost = plan.reduce((s, d) => s + d.cost, 0);
  const avgCal = Math.round(plan.reduce((s, d) =>
    s + Object.values(d.meals).reduce((ms, m) => ms + (m?.cal || 0), 0), 0) / 7);
  const avgProt = Math.round(plan.reduce((s, d) =>
    s + Object.values(d.meals).reduce((ms, m) => ms + (m?.prot || 0), 0), 0) / 7);

  // Macro targets
  const protTarget = Math.round(profile.targetCal * 0.25 / 4);
  const carbTarget = Math.round(profile.targetCal * 0.50 / 4);
  const fatTarget = Math.round(profile.targetCal * 0.25 / 9);

  container.innerHTML = `
    <!-- Metrics Banner -->
    <div class="metrics-banner">
      <div class="metric-card">
        <div class="metric-value">${profile.bmr}</div>
        <div class="metric-label">BMR</div>
        <div class="metric-sub">kcal/day (Basal)</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${profile.tdee}</div>
        <div class="metric-label">TDEE</div>
        <div class="metric-sub">kcal/day (Total)</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${profile.targetCal}</div>
        <div class="metric-label">Target Intake</div>
        <div class="metric-sub">kcal/day for goal</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color:${profile.bmiCat.color};-webkit-text-fill-color:${profile.bmiCat.color}">${profile.bmi}</div>
        <div class="metric-label">BMI</div>
        <div class="metric-sub">${profile.bmiCat.label}${profile.idealW ? ` · Ideal: ${profile.idealW.low}–${profile.idealW.high} kg` : ''}</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">₹${Math.round(totalWeeklyCost)}</div>
        <div class="metric-label">Weekly Cost</div>
        <div class="metric-sub">Budget: ₹${profile.weeklyBudget}</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">~${avgCal}</div>
        <div class="metric-label">Avg Daily Cal</div>
        <div class="metric-sub">${avgProt}g protein</div>
      </div>
    </div>

    <!-- Macro Distribution -->
    <div class="card card-glow" style="margin-bottom:1.5rem">
      <div class="card-header">
        <span class="card-icon">🧪</span>
        <h3>Daily Macro Targets &nbsp;<span class="knn-tag"></span></h3>
      </div>
      <div class="nutrient-bars">
        <div class="nutrient-row">
          <div class="nutrient-header"><span class="nutrient-name">Protein</span><span class="nutrient-pct">${protTarget}g (25%)</span></div>
          <div class="bar-track"><div class="bar-fill bar-protein" style="width:25%"></div></div>
        </div>
        <div class="nutrient-row">
          <div class="nutrient-header"><span class="nutrient-name">Carbohydrates</span><span class="nutrient-pct">${carbTarget}g (50%)</span></div>
          <div class="bar-track"><div class="bar-fill bar-carbs" style="width:50%"></div></div>
        </div>
        <div class="nutrient-row">
          <div class="nutrient-header"><span class="nutrient-name">Fats</span><span class="nutrient-pct">${fatTarget}g (25%)</span></div>
          <div class="bar-track"><div class="bar-fill bar-fat" style="width:25%"></div></div>
        </div>
        <div class="nutrient-row">
          <div class="nutrient-header"><span class="nutrient-name">Fiber (Daily Target)</span><span class="nutrient-pct">25–30g</span></div>
          <div class="bar-track"><div class="bar-fill bar-fiber" style="width:83%"></div></div>
        </div>
      </div>
    </div>

    <!-- Condition Warnings -->
    ${renderConditionWarnings(profile)}

    <!-- 7-Day Tabs -->
    <div class="section-header" style="margin-bottom:1rem">
      <h2 class="section-title">📅 7-Day Personalized Meal Plan</h2>
      <p class="section-sub">Generated using KNN + Content-Based Filtering — Week ${state.weekNumber}</p>
    </div>
    <div class="day-tabs-wrapper" id="dayTabs">
      ${DAYS.map((d, i) => `<button class="day-tab ${i === 0 ? 'active' : ''}" onclick="showDay(${i})">${d.slice(0, 3)}</button>`).join('')}
    </div>
    <div id="dayPlanContainer"></div>

    <!-- Weekly Summary -->
    <div class="weekly-summary">
      <div class="summary-title">📊 Weekly Nutrition Summary</div>
      <div class="summary-grid">
        ${buildWeeklySummary(plan)}
      </div>
    </div>

    <div style="text-align:center;margin-top:1.5rem;display:flex;gap:0.8rem;justify-content:center;flex-wrap:wrap">
      <button class="outline-btn" onclick="switchTab('feedback')">💬 Rate this plan &amp; adapt next week →</button>
      <button class="outline-btn" onclick="exportPlan()">📥 Export Plan (.txt)</button>
    </div>
  `;

  state.currentDay = 0;
  showDay(0);

  // Animate bars after render
  setTimeout(() => {
    document.querySelectorAll('.bar-fill').forEach(bar => {
      const w = bar.style.width;
      bar.style.width = '0';
      setTimeout(() => { bar.style.width = w; }, 100);
    });
  }, 100);
}

function renderConditionWarnings(profile) {
  if (profile.conditions.length === 0) return '';
  const conditionInfo = {
    diabetes: '🩸 <strong>Diabetes:</strong> High-GI foods removed. Low-carb, high-fiber meals prioritized.',
    hypertension: '❤️ <strong>Hypertension:</strong> Low-sodium meals selected. Potassium-rich foods included.',
    cholesterol: '🫀 <strong>High Cholesterol:</strong> Saturated-fat-heavy foods excluded. Omega-3 sources preferred.',
    thyroid: '🦋 <strong>Thyroid:</strong> Goitrogenic raw cruciferous foods moderated.',
    pcos: '🌸 <strong>PCOS:</strong> Anti-inflammatory, low-GI foods prioritized.',
    ibs: '🫃 <strong>IBS:</strong> High-fiber, gentle foods selected. Rich/spicy items avoided.',
  };
  return `
    <div class="card" style="margin-bottom:1.5rem;border-color:rgba(236,72,153,0.3);background:rgba(236,72,153,0.05)">
      <div class="card-header"><span class="card-icon">🏥</span><h3>Health-Aware Filtering Applied</h3></div>
      ${profile.conditions.map(c => `<p style="font-size:0.83rem;color:var(--text-secondary);margin-bottom:0.4rem">${conditionInfo[c] || c}</p>`).join('')}
    </div>
  `;
}

function buildWeeklySummary(plan) {
  let totalCal = 0, totalProt = 0, totalCarb = 0, totalFat = 0, totalFiber = 0, totalCost = 0;
  plan.forEach(d => {
    Object.values(d.meals).forEach(m => {
      if (m) { totalCal += m.cal; totalProt += m.prot; totalCarb += m.carb; totalFat += m.fat; totalFiber += m.fiber; }
    });
    totalCost += d.cost;
  });

  const items = [
    { val: Math.round(totalCal / 7), lbl: 'Avg Calories/Day' },
    { val: Math.round(totalProt / 7) + 'g', lbl: 'Avg Protein/Day' },
    { val: Math.round(totalCarb / 7) + 'g', lbl: 'Avg Carbs/Day' },
    { val: Math.round(totalFat / 7) + 'g', lbl: 'Avg Fat/Day' },
    { val: Math.round(totalFiber / 7) + 'g', lbl: 'Avg Fiber/Day' },
    { val: '₹' + Math.round(totalCost), lbl: 'Total Weekly Cost' },
  ];
  return items.map(i => `<div class="summary-item"><div class="summary-val">${i.val}</div><div class="summary-lbl">${i.lbl}</div></div>`).join('');
}

function showDay(dayIdx) {
  state.currentDay = dayIdx;
  document.querySelectorAll('.day-tab').forEach((t, i) => t.classList.toggle('active', i === dayIdx));
  const day = state.currentPlan[dayIdx];
  const container = document.getElementById('dayPlanContainer');
  const profile = state.profile;

  const dayTotals = Object.values(day.meals).reduce((acc, m) => {
    if (m) { acc.cal += m.cal; acc.prot += m.prot; acc.carb += m.carb; acc.fat += m.fat; }
    return acc;
  }, { cal: 0, prot: 0, carb: 0, fat: 0 });

  const calPct = Math.min(100, Math.round((dayTotals.cal / (profile ? profile.targetCal : dayTotals.cal)) * 100));
  const calColor = calPct > 110 ? '#f87171' : calPct >= 90 ? '#00d4aa' : '#fbbf24';

  container.innerHTML = `
    <div class="day-calorie-bar">
      <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:0.35rem">
        <span style="color:var(--text-secondary)">📊 Daily Calories: <strong style="color:${calColor}">${dayTotals.cal} kcal</strong></span>
        <span style="color:var(--text-muted)">Target: ${profile ? profile.targetCal : '—'} kcal · <strong style="color:${calColor}">${calPct}%</strong></span>
      </div>
      <div class="bar-track"><div class="bar-fill bar-protein" style="width:${calPct}%;background:${calColor}"></div></div>
      <div style="display:flex;gap:1rem;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted)">
        <span>💪 ${dayTotals.prot}g prot</span>
        <span>🌾 ${dayTotals.carb}g carb</span>
        <span>🫒 ${dayTotals.fat}g fat</span>
        <span>💰 ₹${Math.round(day.cost)}</span>
      </div>
    </div>
    <div class="meals-grid">
      ${MEAL_TYPES.map(mtype => {
    const meal = day.meals[mtype];
    if (!meal) return '';
    return renderMealCard(meal, mtype, dayIdx);
  }).join('')}
    </div>
  `;
  // Animate the calorie bar
  setTimeout(() => {
    const bar = container.querySelector('.bar-fill');
    if (bar) { const w = bar.style.width; bar.style.width = '0'; setTimeout(() => { bar.style.width = w; }, 50); }
  }, 50);
}

function renderMealCard(meal, mtype, dayIdx) {
  const badgeClass = `badge-${mtype}`;
  const tagHTML = meal.tags.map(t => `<span class="meal-tag">${t}</span>`).join('');
  const photoStyle = meal.photo
    ? `style="background-image:url('${meal.photo}')"`
    : `class="photo-${meal.cat}"`;
  const dietIcon = meal.type === 'veg' ? '🌱' : meal.type === 'nonveg' ? '🍗' : '🍱';
  const dietLabel = meal.type === 'veg' ? 'Veg' : meal.type === 'nonveg' ? 'Non-Veg' : 'Mixed';
  const swapBtn = (dayIdx !== undefined)
    ? `<button class="swap-btn" onclick="swapMeal(${dayIdx},'${mtype}')" title="Swap this meal">🔄 Swap</button>`
    : '';

  return `
    <div class="meal-card" id="mc-${dayIdx}-${mtype}">
      <div class="meal-photo" ${photoStyle}>
        <div class="meal-photo-overlay">
          <span class="meal-photo-name">${meal.name}</span>
          <span class="meal-photo-cal">🔥 ${meal.cal} kcal</span>
        </div>
      </div>
      <div class="meal-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
          <span class="meal-type-badge ${badgeClass}">${MEAL_LABELS[mtype]}</span>
          ${swapBtn}
        </div>
        <div class="meal-desc">${meal.cat.charAt(0).toUpperCase() + meal.cat.slice(1)} · ${dietIcon} ${dietLabel}</div>
        <div class="macros-row">
          <span class="macro-chip chip-prot">💪 ${meal.prot}g protein</span>
          <span class="macro-chip chip-carb">🌾 ${meal.carb}g carbs</span>
          <span class="macro-chip chip-fat">🫒 ${meal.fat}g fat</span>
          <span class="macro-chip chip-cal">🌿 ${meal.fiber}g fiber</span>
        </div>
        <div class="meal-footer">
          <span class="meal-price">₹${meal.price}/serving</span>
          <div class="meal-tags">${tagHTML}<span class="knn-tag">🤖 KNN</span></div>
        </div>
      </div>
    </div>
  `;
}

// ─── MEAL SWAP ────────────────────────────────────────────────────────────────
async function swapMeal(dayIdx, mtype) {
  if (!state.profile || !state.currentPlan) return;
  const profile = state.profile;
  const day = state.currentPlan[dayIdx];
  const currentMeal = day.meals[mtype];

  try {
    const response = await fetch(`${BACKEND_URL}/api/swap-meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: profile,
        dayIdx: dayIdx,
        mealType: mtype,
        currentMealId: currentMeal ? currentMeal.id : -1
      })
    });

    if (!response.ok) throw new Error('Failed to swap meal');
    const data = await response.json();
    const swapped = data.swapped;

    const oldCost = currentMeal ? currentMeal.price : 0;
    day.meals[mtype] = swapped;
    day.cost = day.cost - oldCost + swapped.price;

    showDay(dayIdx);
    showToast(`🔄 Swapped to: ${swapped.name}`);
  } catch (err) {
    console.error(err);
    showToast('❌ Error swapping meal via AI. Ensure server is running.');
  }
}

// ─── PROGRESS TRACKER ────────────────────────────────────────────────────────
function initProgressDate() {
  const d = document.getElementById('logDate');
  if (d) d.value = new Date().toISOString().split('T')[0];
}

function logProgress() {
  const w = parseFloat(document.getElementById('logWeight').value);
  const d = document.getElementById('logDate').value;
  if (!w || w < 10 || w > 400) { showToast('⚠️ Enter a valid weight (10–400 kg)'); return; }
  if (!d) { showToast('⚠️ Please select a date'); return; }
  // Prevent duplicate date
  if (state.progressLog.some(e => e.date === d)) {
    showToast('⚠️ Entry for this date already exists');
    return;
  }
  state.progressLog.unshift({ weight: w, date: d, ts: Date.now() });
  state.progressLog.sort((a, b) => b.ts - a.ts); // newest first
  localStorage.setItem('nutriai_progress', JSON.stringify(state.progressLog));
  document.getElementById('logWeight').value = '';
  renderProgressLog();
  renderProgressChart();
  showToast('✅ Weight logged: ' + w + ' kg');
}

function deleteProgressEntry(ts) {
  state.progressLog = state.progressLog.filter(e => e.ts !== ts);
  localStorage.setItem('nutriai_progress', JSON.stringify(state.progressLog));
  renderProgressLog();
  renderProgressChart();
  showToast('🗑️ Entry deleted');
}

function renderProgressLog() {
  const log = document.getElementById('progressLog');
  if (!state.progressLog.length) {
    log.innerHTML = '<p class="empty-log">No entries yet. Start logging!</p>';
    return;
  }
  log.innerHTML = state.progressLog.slice(0, 15).map((e, i) => {
    const prev = state.progressLog[i + 1];
    const delta = prev ? (e.weight - prev.weight).toFixed(1) : null;
    const deltaHTML = delta !== null
      ? `<span class="entry-delta ${parseFloat(delta) < 0 ? 'delta-neg' : 'delta-pos'}">${parseFloat(delta) > 0 ? '+' : ''}${delta} kg</span>`
      : '<span class="entry-delta" style="color:var(--text-muted)">—</span>';
    return `
      <div class="progress-entry">
        <span class="entry-date">📅 ${e.date}</span>
        <span class="entry-weight">⚖️ ${e.weight} kg</span>
        ${deltaHTML}
        <button class="del-btn" onclick="deleteProgressEntry(${e.ts})" title="Delete entry">✕</button>
      </div>`;
  }).join('');
}

function renderProgressChart() {
  const canvas = document.getElementById('progressChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth || 400;
  const H = canvas.height = 220;

  ctx.clearRect(0, 0, W, H);

  const data = [...state.progressLog].reverse().slice(-10);
  if (data.length < 2) {
    ctx.fillStyle = '#4a5568';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Log at least 2 entries to see chart', W / 2, H / 2);
    return;
  }

  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights) - 2;
  const maxW = Math.max(...weights) + 2;
  const pad = { top: 20, right: 20, bottom: 40, left: 50 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const xStep = cW / (data.length - 1);
  const yScale = cH / (maxW - minW);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const val = (maxW - ((maxW - minW) / 4) * i).toFixed(1);
    ctx.fillStyle = '#4a5568'; ctx.font = '11px Inter'; ctx.textAlign = 'right';
    ctx.fillText(val + 'kg', pad.left - 5, y + 4);
  }

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  gradient.addColorStop(0, 'rgba(0,212,170,0.3)');
  gradient.addColorStop(1, 'rgba(0,212,170,0)');

  // Area
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + (maxW - d.weight) * yScale;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (data.length - 1) * xStep, H - pad.bottom);
  ctx.lineTo(pad.left, H - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  data.forEach((d, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + (maxW - d.weight) * yScale;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points
  data.forEach((d, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + (maxW - d.weight) * yScale;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00d4aa';
    ctx.fill();
    ctx.strokeStyle = '#070b14';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // X labels (dates)
  ctx.fillStyle = '#4a5568'; ctx.font = '10px Inter'; ctx.textAlign = 'center';
  data.forEach((d, i) => {
    const x = pad.left + i * xStep;
    const label = d.date.slice(5); // MM-DD
    ctx.fillText(label, x, H - pad.bottom + 18);
  });
}

// ─── FEEDBACK ────────────────────────────────────────────────────────────────
function setRating(val) {
  state.currentRating = val;
  document.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('active', i < val);
  });
}

function renderAvoidMeals() {
  const container = document.getElementById('avoidMeals');
  if (!state.currentPlan) return;
  const allMeals = new Map();
  state.currentPlan.forEach(day => {
    Object.values(day.meals).forEach(m => { if (m) allMeals.set(m.id, m); });
  });
  container.innerHTML = [...allMeals.values()].map(m => `
    <span class="avoid-chip ${state.avoidedMeals.includes(m.id) ? 'selected' : ''}"
          onclick="toggleAvoid(${m.id}, this)">${m.name}</span>
  `).join('');
}

function toggleAvoid(id, el) {
  const idx = state.avoidedMeals.indexOf(id);
  if (idx === -1) state.avoidedMeals.push(id);
  else state.avoidedMeals.splice(idx, 1);
  el.classList.toggle('selected', state.avoidedMeals.includes(id));
  localStorage.setItem('nutriai_avoid', JSON.stringify(state.avoidedMeals));
}

function submitFeedback() {
  if (state.currentRating === 0) { showToast('⭐ Please rate the plan first'); return; }
  const text = document.getElementById('feedbackText').value.trim();
  const week = state.weekNumber;

  const entry = {
    week,
    rating: state.currentRating,
    comment: text,
    avoided: [...state.avoidedMeals],
    date: new Date().toLocaleDateString('en-IN'),
    ts: Date.now()
  };

  state.feedbackHistory.unshift(entry);
  localStorage.setItem('nutriai_feedback', JSON.stringify(state.feedbackHistory));

  // Increment week
  state.weekNumber++;
  localStorage.setItem('nutriai_week', state.weekNumber.toString());

  renderFeedbackHistory();
  setRating(0);
  document.getElementById('feedbackText').value = '';

  // Regenerate plan with avoided meals factored in
  if (state.profile) {
    state.profile.avoidedMeals = [...state.avoidedMeals];
    const newPlan = generateMealPlan(state.profile);
    state.currentPlan = newPlan;
    renderPlan(state.profile, newPlan);
    showToast(`🔄 Plan adapted for Week ${state.weekNumber}! Avoided meals excluded.`);
    switchTab('plan');
  } else {
    showToast('✅ Feedback saved! It will adapt your next plan.');
  }
}

function renderFeedbackHistory() {
  const container = document.getElementById('feedbackHistory');
  if (!state.feedbackHistory.length) {
    container.innerHTML = '<p class="empty-log">No feedback submitted yet.</p>';
    return;
  }
  container.innerHTML = state.feedbackHistory.map(e => `
    <div class="feedback-entry">
      <div class="feedback-meta">
        <span class="feedback-week">📅 Week ${e.week} · ${e.date}</span>
        <span class="feedback-stars">${'★'.repeat(e.rating)}${'☆'.repeat(5 - e.rating)}</span>
      </div>
      ${e.comment ? `<p class="feedback-comment">"${e.comment}"</p>` : ''}
      ${e.avoided.length > 0 ? `<p class="feedback-comment" style="color:var(--accent-pink);margin-top:0.3rem">🚫 Removed ${e.avoided.length} meal(s)</p>` : ''}
    </div>
  `).join('');
}

// ─── EXPORT PLAN ─────────────────────────────────────────────────────────────
function exportPlan() {
  if (!state.profile || !state.currentPlan) {
    showToast('⚠️ Generate a plan first');
    return;
  }
  const p = state.profile;
  let txt = `NutriAI – Personalized Meal Plan (Week ${state.weekNumber})\n`;
  txt += `Generated: ${new Date().toLocaleDateString('en-IN')}\n`;
  txt += `User: ${p.name} | Age: ${p.age} | BMI: ${p.bmi} (${p.bmiCat.label})\n`;
  txt += `BMR: ${p.bmr} kcal | TDEE: ${p.tdee} kcal | Target: ${p.targetCal} kcal/day\n`;
  txt += `Goal: ${p.goal} | Diet: ${p.dietType} | Budget: ₹${p.weeklyBudget}/week\n`;
  txt += '\n' + '='.repeat(50) + '\n\n';
  state.currentPlan.forEach((day, i) => {
    txt += `${DAYS[i].toUpperCase()}\n`;
    MEAL_TYPES.forEach(mt => {
      const m = day.meals[mt];
      if (m) txt += `  ${MEAL_LABELS[mt].replace(/[^\w ]/g, '').trim()}: ${m.name} (${m.cal} kcal, ₹${m.price})\n`;
    });
    txt += `  Day Total Cost: ₹${Math.round(day.cost)}\n\n`;
  });
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `NutriAI_Plan_Week${state.weekNumber}.txt`;
  a.click(); URL.revokeObjectURL(url);
  showToast('📥 Plan exported!');
}

// ─── INITIALIZATION ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initProgressDate();
  renderProgressLog();
  renderFeedbackHistory();

  // Restore avoided meals UI if plan exists
  if (state.currentPlan) renderAvoidMeals();

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    nav.classList.toggle('scrolled', window.scrollY > 30);
  });

  // Set today's default date and prevent future dates
  const today = new Date().toISOString().split('T')[0];
  const logDate = document.getElementById('logDate');
  if (logDate) { logDate.max = today; logDate.value = today; }

  // Reset loading step labels
  document.querySelectorAll('.load-step').forEach((el, i) => {
    if (i > 0) el.textContent = '⏳ ' + el.textContent.replace('✓ ', '').replace('⏳ ', '');
  });

  console.log('%c🤖 NutriAI Loaded!', 'color:#00d4aa;font-size:16px;font-weight:bold');
  console.log('%cKNN + Content-Based Filtering + PCOS/IBS Support Active', 'color:#7c3aed;font-size:12px');
});
