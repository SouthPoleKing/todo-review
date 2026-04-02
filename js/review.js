// ===================== review.js =====================
// 界面二：每日复盘

const Review = (() => {
  const $ = id => document.getElementById(id);
  let selectedDate = Storage.today();
  let editingEventId = null;

  // ── Mini Calendar ─────────────────────────────────────
  function buildCalendar(containerId, onSelect) {
    const container = $(containerId);
    let cur = new Date();

    function render() {
      const year = cur.getFullYear(), month = cur.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayStr = Storage.today();

      // Collect dates that have tasks or checkins
      const activeDates = new Set([
        ...Storage.tasks.all().map(t => t.date),
        ...Storage.checkins.all().map(c => c.date),
      ]);

      const dow = ['日','一','二','三','四','五','六'];
      let html = `
        <div class="cal-header">
          <button class="cal-nav" id="${containerId}Prev">‹</button>
          <span class="cal-title">${year}年${month+1}月</span>
          <button class="cal-nav" id="${containerId}Next">›</button>
        </div>
        <div class="cal-grid">
          ${dow.map(d => `<div class="cal-dow">${d}</div>`).join('')}
      `;

      let day = 1;
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 7; j++) {
          const idx = i * 7 + j;
          if (idx < firstDay || day > daysInMonth) {
            html += `<div class="cal-day other-month"></div>`;
          } else {
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isToday    = ds === todayStr;
            const isSelected = ds === selectedDate;
            const hasDot     = activeDates.has(ds);
            html += `<div class="cal-day ${isToday?'today':''} ${isSelected&&!isToday?'selected':''}"
                          data-date="${ds}">
                       ${day}
                       ${hasDot ? '<div class="cal-dot"></div>' : ''}
                     </div>`;
            day++;
          }
        }
        if (day > daysInMonth) break;
      }
      html += '</div>';
      container.innerHTML = html;

      $(`${containerId}Prev`).addEventListener('click', () => { cur.setMonth(cur.getMonth()-1); render(); });
      $(`${containerId}Next`).addEventListener('click', () => { cur.setMonth(cur.getMonth()+1); render(); });
      container.querySelectorAll('.cal-day[data-date]').forEach(el => {
        el.addEventListener('click', () => {
          selectedDate = el.dataset.date;
          onSelect(selectedDate);
          render();
        });
      });
    }
    render();
  }

  // ── Compare list ──────────────────────────────────────
  const CAT_COLORS = { '紧急': '#ff5f5f', '难': '#3498db', '重要': '#e67e22', '日常': '#43d18a' };
  const SCORE_LABEL = ['', '😞 差', '😐 一般', '😊 满意'];

  function renderCompare() {
    // 显示该日计划的任务（plannedDate === selectedDate）
    const tasks = Storage.tasks.all().filter(t =>
      (t.plannedDate || t.date) === selectedDate && !t.parentId
    );
    const list  = $('compareList');
    if (!tasks.length) {
      list.innerHTML = '<div class="empty-hint">该日暂无任务记录</div>';
      return;
    }
    list.innerHTML = tasks.map(task => {
      const review  = Storage.reviews.byTask(task.id);
      const prog    = task.done ? 100 : (task.progress || 0);
      const cat     = task.category || '';
      const color   = CAT_COLORS[cat] || 'var(--primary)';
      const catHtml = cat
        ? `<span class="task-tag" style="background:${color}22;color:${color}">${cat}</span>` : '';
      const scoreHtml = task.score ? `<span style="font-size:.75rem">${SCORE_LABEL[task.score]}</span>` : '';
      // 未完成任务：右侧空缺提示
      const isUnfinished = !task.done && prog === 0;
      const laterTag = task.laterReview
        ? `<span class="task-tag" style="background:#fff3cd;color:#856404;font-size:.72rem">稍后梳理</span>` : '';

      return `
        <div class="compare-row ${isUnfinished ? 'unfinished-row' : ''}">
          <div class="compare-left">
            <div class="task-name" style="${task.done?'text-decoration:line-through;color:var(--muted)':''}">
              ${task.name}
            </div>
            <div class="task-meta" style="margin-top:.2rem">${catHtml}${scoreHtml}${laterTag}</div>
            <div class="task-progress-bar" style="margin-top:.4rem">
              <div class="task-progress-fill" style="width:${prog}%"></div>
            </div>
            <div style="font-size:.72rem;color:var(--muted);margin-top:.2rem">${prog}%</div>
          </div>
          <div class="compare-right">
            ${task.laterReview
              ? `<div class="later-review-placeholder">稍后梳理中，暂不复盘</div>`
              : isUnfinished
                ? `<div class="later-review-placeholder unfinished-hint">未完成 — 已自动转入下一日</div>`
                : `<textarea placeholder="操作步骤 / 复盘感想…" data-tid="${task.id}" data-tname="${task.name}">${review ? (review.note||'') : ''}</textarea>`
            }
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('textarea').forEach(ta => {
      ta.addEventListener('blur', () => {
        Storage.reviews.save(ta.dataset.tid, ta.dataset.tname, ta.value);
      });
    });

    // 自动将今日未完成任务（进度0、未done）推到明天（仅对昨天及更早操作）
    if (selectedDate < Storage.today()) {
      const tomorrow = (() => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      })();
      tasks.filter(t => !t.done && (t.progress || 0) === 0 && !t.laterReview).forEach(t => {
        // 仅在 plannedDate 仍是 selectedDate 时才推移（避免重复推）
        if ((t.plannedDate || t.date) === selectedDate) {
          Storage.tasks.update(t.id, { plannedDate: tomorrow, date: tomorrow });
        }
      });
    }
  }

  // ── Habit checkin area ────────────────────────────────
  function renderCheckins() {
    const habits  = Storage.habits.all();
    const area    = $('habitCheckinArea');
    if (!habits.length) {
      area.innerHTML = '<div class="empty-hint">前往「目标与习惯」添加习惯</div>';
      return;
    }
    area.innerHTML = habits.map(h => {
      const done = Storage.checkins.byHabitDate(h.id, selectedDate).length > 0;
      const last = Storage.checkins.byHabitDate(h.id, selectedDate).slice(-1)[0];
      return `
        <div class="checkin-card ${done ? 'checked' : ''}" data-hid="${h.id}">
          <div class="checkin-icon">${h.icon || '⭐'}</div>
          <div class="checkin-name">${h.name}</div>
          <div class="checkin-time">${done && last ? last.time : '未打卡'}</div>
        </div>
      `;
    }).join('');

    area.querySelectorAll('.checkin-card').forEach(card => {
      card.addEventListener('click', () => {
        const hid  = card.dataset.hid;
        const done = Storage.checkins.byHabitDate(hid, selectedDate).length > 0;
        if (!done || selectedDate === Storage.today()) {
          // 仅当日可打卡
          if (selectedDate !== Storage.today()) return;
          const note = prompt('打卡备注（可选）', '') || '';
          Storage.checkins.add(hid, note);
          // 添加到时间轴
          const now = new Date();
          const t   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          const h   = Storage.habits.get(hid);
          const end = `${String(now.getHours()).padStart(2,'0')}:${String(Math.min(now.getMinutes()+30,59)).padStart(2,'0')}`;
          Storage.timeline.add({
            date: Storage.today(), startTime: t, endTime: end,
            title: h.name, color: h.color || '#43d18a', type: 'habit', refId: hid,
          });
          renderCheckins();
          renderTimeline();
          if (window.Habits) Habits.refresh();
        }
      });
    });
  }

  // ── Timeline ──────────────────────────────────────────
  const HOUR_H = 50; // px per hour
  const TOTAL  = 24 * HOUR_H;

  function timeToY(time) {
    const [h, m] = time.split(':').map(Number);
    return (h + m / 60) * HOUR_H;
  }

  function renderTimeline() {
    const wrap = $('timelineWrap');
    let html = '<div class="tl-hours">';
    for (let h = 0; h < 24; h++) {
      html += `<div class="tl-hour" style="height:${HOUR_H}px">
        <span class="tl-hour-label">${String(h).padStart(2,'0')}:00</span>
      </div>`;
    }
    html += '</div><div class="tl-events" id="tlEvents"></div>';
    wrap.innerHTML = html;

    // Current time line
    const now  = new Date();
    const nowY = (now.getHours() + now.getMinutes()/60) * HOUR_H;
    const nowLine = document.createElement('div');
    nowLine.className = 'tl-now-line';
    nowLine.style.top = nowY + 'px';
    const nowDot = document.createElement('div');
    nowDot.className = 'tl-now-dot';
    nowDot.style.top = nowY + 'px';
    wrap.appendChild(nowLine);
    wrap.appendChild(nowDot);

    // Events
    const events = Storage.timeline.byDate(selectedDate);
    const evWrap = document.getElementById('tlEvents');
    evWrap.style.position = 'absolute';
    evWrap.style.top = '0';
    evWrap.style.height = TOTAL + 'px';

    events.forEach(ev => {
      const top    = timeToY(ev.startTime || '00:00');
      const bottom = timeToY(ev.endTime   || '01:00');
      const height = Math.max(bottom - top, 20);
      const block  = document.createElement('div');
      block.className = 'tl-block';
      block.style.cssText = `top:${top}px;height:${height}px;background:${ev.color || '#6c63ff'};`;
      block.textContent = `${ev.startTime} ${ev.title}`;
      block.dataset.id  = ev.id;
      block.addEventListener('click', () => openTimelineEdit(ev.id));
      evWrap.appendChild(block);
    });

    // Scroll to current time
    wrap.scrollTop = Math.max(nowY - 200, 0);
  }

  // ── Timeline edit modal ───────────────────────────────
  function openTimelineEdit(id) {
    editingEventId = id;
    const ev = id ? Storage.timeline.all().find(e => e.id === id) : null;
    $('timelineModalTitle').textContent = ev ? '编辑时间块' : '添加时间块';
    $('tlTitle').value  = ev ? ev.title : '';
    $('tlStart').value  = ev ? ev.startTime : '';
    $('tlEnd').value    = ev ? ev.endTime : '';
    $('tlColor').value  = ev ? ev.color : '#6c63ff';
    $('deleteTimelineBtn').style.display = ev ? '' : 'none';
    // 高亮当前选中色块
    document.querySelectorAll('.tl-preset').forEach(p => {
      p.classList.toggle('selected', p.dataset.color === (ev ? ev.color : ''));
    });
    $('timelineModal').classList.add('open');
  }

  // 色块点击
  document.querySelectorAll('.tl-preset').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('.tl-preset').forEach(x => x.classList.remove('selected'));
      p.classList.add('selected');
      $('tlColor').value = p.dataset.color;
      // 若标题为空，自动填入类型标签
      if (!$('tlTitle').value.trim()) {
        $('tlTitle').value = p.dataset.label;
      }
    });
  });

  $('addTimelineBtn').addEventListener('click', () => openTimelineEdit(null));
  $('cancelTimelineBtn').addEventListener('click', () => $('timelineModal').classList.remove('open'));

  $('saveTimelineBtn').addEventListener('click', () => {
    const title = $('tlTitle').value.trim();
    const start = $('tlStart').value;
    const end   = $('tlEnd').value;
    if (!title || !start || !end) { alert('请填写标题、开始和结束时间'); return; }
    if (editingEventId) {
      Storage.timeline.update(editingEventId, { title, startTime: start, endTime: end, color: $('tlColor').value });
    } else {
      Storage.timeline.add({ date: selectedDate, title, startTime: start, endTime: end, color: $('tlColor').value });
    }
    $('timelineModal').classList.remove('open');
    renderTimeline();
  });

  $('deleteTimelineBtn').addEventListener('click', () => {
    if (editingEventId && confirm('删除此时间块？')) {
      Storage.timeline.remove(editingEventId);
      $('timelineModal').classList.remove('open');
      renderTimeline();
    }
  });

  // ── Refresh ───────────────────────────────────────────
  function refresh() {
    buildCalendar('reviewCalendar', date => {
      selectedDate = date;
      renderCompare();
      renderCheckins();
      renderTimeline();
    });
    renderCompare();
    renderCheckins();
    renderTimeline();
  }

  refresh();
  return { refresh };
})();
