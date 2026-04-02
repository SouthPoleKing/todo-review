// ===================== habits.js =====================
// 界面三：目标与习惯打卡 + 图表

const Habits = (() => {
  const $ = id => document.getElementById(id);
  let selectedDate  = Storage.today();
  let editingHabitId = null;
  let editingGoalId  = null;
  let chartRange     = 'week';
  let habitChartInst = null, taskChartInst = null, goalChartInst = null;

  // ── Mini Calendar ─────────────────────────────────────
  function buildCalendar() {
    const container = $('habitsCalendar');
    let cur = new Date();

    function render() {
      const year = cur.getFullYear(), month = cur.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayStr = Storage.today();

      const checkinDates = new Set(Storage.checkins.all().map(c => c.date));

      const dow = ['日','一','二','三','四','五','六'];
      let html = `
        <div class="cal-header">
          <button class="cal-nav" id="habCalPrev">‹</button>
          <span class="cal-title">${year}年${month+1}月</span>
          <button class="cal-nav" id="habCalNext">›</button>
        </div>
        <div class="cal-grid">
          ${dow.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
      `;
      let day = 1;
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 7; j++) {
          const idx = i*7+j;
          if (idx < firstDay || day > daysInMonth) {
            html += `<div class="cal-day other-month"></div>`;
          } else {
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isToday    = ds === todayStr;
            const isSelected = ds === selectedDate;
            const hasDot     = checkinDates.has(ds);
            html += `<div class="cal-day ${isToday?'today':''} ${isSelected&&!isToday?'selected':''}"
                          data-date="${ds}">
                       ${day}${hasDot ? '<div class="cal-dot"></div>' : ''}
                     </div>`;
            day++;
          }
        }
        if (day > daysInMonth) break;
      }
      html += '</div>';
      container.innerHTML = html;

      $('habCalPrev').addEventListener('click', () => { cur.setMonth(cur.getMonth()-1); render(); });
      $('habCalNext').addEventListener('click', () => { cur.setMonth(cur.getMonth()+1); render(); });
      container.querySelectorAll('.cal-day[data-date]').forEach(el => {
        el.addEventListener('click', () => {
          selectedDate = el.dataset.date;
          render();
          renderHabits();
        });
      });
    }
    render();
  }

  // ── Habit List ────────────────────────────────────────
  function renderHabits() {
    const habits = Storage.habits.all();
    const list   = $('habitList');
    if (!habits.length) {
      list.innerHTML = '<div class="empty-hint">点击 ＋ 添加习惯</div>';
      return;
    }
    list.innerHTML = habits.map(h => {
      const done   = Storage.checkins.byHabitDate(h.id, selectedDate).length > 0;
      const streak = calcStreak(h.id);
      return `
        <div class="habit-row ${done ? 'done-today' : ''}">
          <span class="habit-emoji">${h.icon || '⭐'}</span>
          <div class="habit-info">
            <div class="habit-info-name">${h.name}</div>
            <div class="habit-info-streak">连续 ${streak} 天 🔥</div>
          </div>
          <button class="habit-checkin-btn" data-hid="${h.id}">${done ? '✓ 已打卡' : '打卡'}</button>
          <button class="habit-edit-btn" data-hid="${h.id}">✏️</button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.habit-checkin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hid  = btn.dataset.hid;
        if (selectedDate !== Storage.today()) {
          alert('只能对今日进行打卡');
          return;
        }
        const done = Storage.checkins.byHabitDate(hid, selectedDate).length > 0;
        if (done) {
          // 撤销
          const items = Storage.checkins.byHabitDate(hid, selectedDate);
          items.forEach(c => Storage.checkins.remove(c.id));
        } else {
          const note = '';
          Storage.checkins.add(hid, note);
          const now = new Date();
          const t   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          const h2  = Storage.habits.get(hid);
          const end = `${String(now.getHours()).padStart(2,'0')}:${String(Math.min(now.getMinutes()+30,59)).padStart(2,'0')}`;
          Storage.timeline.add({
            date: Storage.today(), startTime: t, endTime: end,
            title: h2.name, color: h2.color||'#43d18a', type: 'habit', refId: hid,
          });
        }
        renderHabits();
        renderCharts();
        if (window.Review) Review.refresh();
      });
    });

    list.querySelectorAll('.habit-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openHabitModal(btn.dataset.hid));
    });
  }

  function calcStreak(habitId) {
    let streak = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0,10);
      if (Storage.checkins.byHabitDate(habitId, ds).length > 0) {
        streak++;
        d.setDate(d.getDate()-1);
      } else break;
    }
    return streak;
  }

  // ── Habit Modal ───────────────────────────────────────
  $('addHabitBtn').addEventListener('click', () => openHabitModal(null));

  function openHabitModal(id) {
    editingHabitId = id;
    const h = id ? Storage.habits.get(id) : null;
    $('habitModalTitle').textContent = h ? '编辑习惯' : '添加习惯';
    $('habitName').value  = h ? h.name  : '';
    $('habitIcon').value  = h ? h.icon  : '⭐';
    $('habitColor').value = h ? h.color : '#6c63ff';
    $('habitFreq').value  = h ? h.frequency : 'daily';
    $('deleteHabitBtn').style.display = h ? '' : 'none';
    $('habitModal').classList.add('open');
  }

  $('saveHabitBtn').addEventListener('click', () => {
    const name = $('habitName').value.trim();
    if (!name) { $('habitName').focus(); return; }
    const data = { name, icon: $('habitIcon').value||'⭐', color: $('habitColor').value, frequency: $('habitFreq').value };
    if (editingHabitId) Storage.habits.update(editingHabitId, data);
    else Storage.habits.add(data);
    $('habitModal').classList.remove('open');
    refresh();
  });

  $('cancelHabitBtn').addEventListener('click', () => $('habitModal').classList.remove('open'));

  $('deleteHabitBtn').addEventListener('click', () => {
    if (editingHabitId && confirm('删除此习惯？')) {
      Storage.habits.remove(editingHabitId);
      $('habitModal').classList.remove('open');
      refresh();
    }
  });

  // ── Goal List ─────────────────────────────────────────
  function renderGoals() {
    const goals = Storage.goals.all();
    const list  = $('goalList');
    if (!goals.length) {
      list.innerHTML = '<div class="empty-hint">点击 ＋ 添加长期目标</div>';
      return;
    }
    list.innerHTML = goals.map(g => {
      const deadlineStr = g.deadline ? `截止 ${g.deadline}` : '';
      return `
        <div class="goal-item">
          <div class="goal-header">
            <span class="goal-name">${g.name}</span>
            <span class="goal-deadline">${deadlineStr}</span>
            <button class="goal-edit-btn" data-gid="${g.id}">✏️</button>
          </div>
          ${g.description ? `<div class="goal-desc">${g.description}</div>` : ''}
          <div class="goal-progress-wrap">
            <div class="goal-progress-track">
              <div class="goal-progress-fill" style="width:${g.progress||0}%"></div>
            </div>
            <span class="goal-progress-pct">${g.progress||0}%</span>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.goal-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openGoalModal(btn.dataset.gid));
    });
  }

  // ── Goal Modal ────────────────────────────────────────
  $('addGoalBtn').addEventListener('click', () => openGoalModal(null));

  function openGoalModal(id) {
    editingGoalId = id;
    const g = id ? Storage.goals.get(id) : null;
    $('goalModalTitle').textContent = g ? '编辑目标' : '添加目标';
    $('goalName').value     = g ? g.name        : '';
    $('goalDesc').value     = g ? g.description : '';
    $('goalDeadline').value = g ? g.deadline     : '';
    const slider = $('goalProgress');
    slider.value = g ? (g.progress||0) : 0;
    $('goalProgressLabel').textContent = slider.value + '%';
    updateGoalSliderBg(slider);
    $('deleteGoalBtn').style.display = g ? '' : 'none';
    $('goalModal').classList.add('open');
  }

  function updateGoalSliderBg(slider) {
    slider.style.background = `linear-gradient(to right, var(--primary) ${slider.value}%, var(--border) ${slider.value}%)`;
  }

  $('goalProgress').addEventListener('input', function() {
    $('goalProgressLabel').textContent = this.value + '%';
    updateGoalSliderBg(this);
  });

  $('saveGoalBtn').addEventListener('click', () => {
    const name = $('goalName').value.trim();
    if (!name) { $('goalName').focus(); return; }
    const data = {
      name, description: $('goalDesc').value,
      deadline: $('goalDeadline').value,
      progress: Number($('goalProgress').value),
    };
    if (editingGoalId) Storage.goals.update(editingGoalId, data);
    else Storage.goals.add(data);
    $('goalModal').classList.remove('open');
    refresh();
  });

  $('cancelGoalBtn').addEventListener('click', () => $('goalModal').classList.remove('open'));

  $('deleteGoalBtn').addEventListener('click', () => {
    if (editingGoalId && confirm('删除此目标？')) {
      Storage.goals.remove(editingGoalId);
      $('goalModal').classList.remove('open');
      refresh();
    }
  });

  // ── Chart range tabs ──────────────────────────────────
  document.querySelectorAll('.chart-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartRange = btn.dataset.range;
      renderCharts();
    });
  });

  // ── Charts ────────────────────────────────────────────
  function getDateRange(range) {
    const end   = new Date();
    const start = new Date();
    if (range === 'week')  start.setDate(end.getDate() - 6);
    if (range === 'month') start.setDate(end.getDate() - 29);
    if (range === 'year')  start.setFullYear(end.getFullYear() - 1);
    return Storage.dateRange(start.toISOString().slice(0,10), end.toISOString().slice(0,10));
  }

  function renderCharts() {
    const dates  = getDateRange(chartRange);
    const habits = Storage.habits.all();

    // ── Habit completion chart (line/bar per habit) ──
    {
      const datasets = habits.map(h => ({
        label: h.name,
        data: dates.map(d => Storage.checkins.byHabitDate(h.id, d).length > 0 ? 1 : 0),
        backgroundColor: h.color + '88',
        borderColor: h.color,
        borderWidth: 2,
        fill: false,
        tension: .3,
        pointRadius: 3,
      }));

      let labels = dates;
      if (chartRange === 'year') {
        // Group by month
        const months = {};
        dates.forEach(d => {
          const m = d.slice(0,7);
          months[m] = months[m] || {};
          habits.forEach(h => {
            months[m][h.id] = (months[m][h.id]||0) + (Storage.checkins.byHabitDate(h.id, d).length > 0 ? 1 : 0);
          });
        });
        labels = Object.keys(months);
        datasets.forEach((ds, idx) => {
          ds.data = labels.map(m => months[m][habits[idx]?.id] || 0);
        });
      }

      const ctx = document.getElementById('habitChart');
      if (habitChartInst) habitChartInst.destroy();
      habitChartInst = new Chart(ctx, {
        type: chartRange === 'year' ? 'bar' : 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top' }, title: { display: true, text: '习惯打卡情况' } },
          scales: {
            y: { beginAtZero: true, max: chartRange === 'year' ? undefined : 1, ticks: { stepSize: 1 } },
          },
        },
      });
    }

    // ── Task completion chart ──
    {
      let labels, doneCounts, totalCounts;
      if (chartRange === 'year') {
        const months = {};
        dates.forEach(d => {
          const m = d.slice(0,7);
          months[m] = months[m] || { done: 0, total: 0 };
          const ts = Storage.tasks.byDate(d);
          months[m].total += ts.length;
          months[m].done  += ts.filter(t => t.done).length;
        });
        labels      = Object.keys(months);
        doneCounts  = labels.map(m => months[m].done);
        totalCounts = labels.map(m => months[m].total);
      } else {
        labels      = dates;
        doneCounts  = dates.map(d => Storage.tasks.byDate(d).filter(t => t.done).length);
        totalCounts = dates.map(d => Storage.tasks.byDate(d).length);
      }

      const ctx2 = document.getElementById('taskProgressChart');
      if (taskChartInst) taskChartInst.destroy();
      taskChartInst = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: '完成任务', data: doneCounts,  backgroundColor: '#43d18a88', borderColor: '#43d18a', borderWidth: 2 },
            { label: '计划任务', data: totalCounts, backgroundColor: '#6c63ff44', borderColor: '#6c63ff', borderWidth: 2 },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top' }, title: { display: true, text: '任务完成情况' } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
      });
    }

    // ── Goal progress chart ──
    {
      const goals = Storage.goals.all();
      const ctx3  = document.getElementById('goalProgressChart');
      if (goalChartInst) goalChartInst.destroy();
      if (!goals.length) return;
      goalChartInst = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: goals.map(g => g.name),
          datasets: [{
            label: '目标进度 %',
            data: goals.map(g => g.progress || 0),
            backgroundColor: goals.map((_, i) => ['#6c63ff88','#ff658488','#43d18a88','#ffc04588'][i%4]),
            borderColor:     goals.map((_, i) => ['#6c63ff','#ff6584','#43d18a','#ffc045'][i%4]),
            borderWidth: 2,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: { legend: { display: false }, title: { display: true, text: '长期目标进度' } },
          scales: { x: { beginAtZero: true, max: 100 } },
        },
      });
    }
  }

  // ── Refresh ───────────────────────────────────────────
  function refresh() {
    buildCalendar();
    renderHabits();
    renderGoals();
    renderCharts();
  }

  refresh();
  return { refresh };
})();
