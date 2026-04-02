// ===================== plan.js =====================
// 界面一：当日计划（修订版）

const Plan = (() => {
  const $ = id => document.getElementById(id);

  // 类别 → 颜色映射
  const CAT_COLORS = { '紧急': '#ff5f5f', '难': '#3498db', '重要': '#e67e22', '日常': '#43d18a' };

  let pendingTaskId  = null;
  let pendingSubtasks = [];  // [{name, date}]
  let pendingScore   = 0;
  let pendingAllDone = false;

  const completeModal     = $('completeModal');
  const reviewPromptModal = $('reviewPromptModal');
  const editorModal       = $('editorModal');
  const partModal         = $('partModal');

  function openModal(el)  { el.classList.add('open'); }
  function closeModal(el) { el.classList.remove('open'); }

  function updateSliderBg(slider) {
    slider.style.background =
      `linear-gradient(to right, var(--primary) ${slider.value}%, var(--border) ${slider.value}%)`;
  }

  // ── 设置默认日期为今天 ────────────────────────────────
  function initDateDefault() {
    const d = $('taskDate');
    if (!d.value) d.value = Storage.today();
  }
  initDateDefault();

  // ── Add task ──────────────────────────────────────────
  $('addTaskBtn').addEventListener('click', addTask);
  $('taskName').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

  function addTask() {
    const name = $('taskName').value.trim();
    if (!name) { $('taskName').focus(); return; }
    const taskDate = $('taskDate').value || Storage.today();
    const category = $('taskCategory').value;

    Storage.tasks.add({ name, plannedDate: taskDate, plannedTime: '', category, subtasks: [], date: taskDate });

    $('taskName').value = '';
    $('taskDate').value = Storage.today();
    $('taskCategory').value = '';

    renderTasks();
  }

  // ── Render helper: build one task <li> ───────────────
  function buildTaskLi(task) {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.dataset.id = task.id;

    const cat   = task.category || '';
    const color = CAT_COLORS[cat] || 'var(--primary)';
    const catHtml = cat
      ? `<span class="task-tag" style="background:${color}22;color:${color}">${cat}</span>`
      : '';
    const dateHtml = task.plannedDate && task.plannedDate !== Storage.today()
      ? `<span>📅 ${task.plannedDate}</span>` : '';
    const scoreHtml = task.score
      ? `<span>${['','😞 差','😐 一般','😊 满意'][task.score]}</span>` : '';
    const laterHtml = task.laterReview
      ? `<span class="task-tag" style="background:#fff3cd;color:#856404">稍后梳理</span>` : '';

    li.innerHTML = `
      <div class="task-check ${task.done ? 'checked' : ''}" data-id="${task.id}">
        ${task.done ? '✓' : ''}
      </div>
      <div class="task-body">
        <div class="task-name">${task.name}</div>
        <div class="task-meta">${dateHtml}${catHtml}${scoreHtml}${laterHtml}</div>
        ${task.progress > 0 && !task.done ? `
          <div class="task-progress-bar">
            <div class="task-progress-fill" style="width:${task.progress}%"></div>
          </div>` : ''}
      </div>
      <button class="task-del" data-id="${task.id}" title="删除">✕</button>
    `;
    return li;
  }

  // ── Render task list ──────────────────────────────────
  function renderTasks() {
    const today    = Storage.today();
    const allTasks = Storage.tasks.all().filter(t => !t.parentId); // 不显示子任务在此（已独立）

    // 今日任务：plannedDate === today 或无日期
    const todayTasks  = allTasks.filter(t => !t.plannedDate || t.plannedDate === today);
    // 后续任务：plannedDate > today
    const futureTasks = allTasks.filter(t => t.plannedDate && t.plannedDate > today)
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));

    // 今日列表
    const taskList   = $('taskList');
    const taskEmpty  = $('taskEmpty');
    const badge      = $('taskCountBadge');
    badge.textContent = todayTasks.length;
    taskEmpty.style.display = todayTasks.length ? 'none' : 'block';
    taskList.innerHTML = '';
    todayTasks.forEach(t => taskList.appendChild(buildTaskLi(t)));

    // 后续列表（始终显示卡片）
    const futureList  = $('futureTaskList');
    const futureBadge = $('futureBadge');
    const futureEmpty = $('futureEmpty');
    futureBadge.textContent = futureTasks.length;
    futureEmpty.style.display = futureTasks.length ? 'none' : 'block';
    futureList.innerHTML = '';
    futureTasks.forEach(t => futureList.appendChild(buildTaskLi(t)));

    // 绑定事件（今日+后续）
    [$('taskList'), $('futureTaskList')].forEach(list => {
      list.querySelectorAll('.task-check').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = Storage.tasks.get(btn.dataset.id);
          if (!t) return;
          if (!t.done) {
            pendingTaskId  = t.id;
            pendingScore   = 0;
            pendingAllDone = false;
            $('completeModalTitle').textContent = `「${t.name}」完成情况`;
            $('ratingWrap').style.display = 'none';
            openModal(completeModal);
          } else {
            Storage.tasks.update(t.id, { done: false, score: 0 });
            renderTasks();
          }
        });
      });

      list.querySelectorAll('.task-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (confirm('确认删除此任务？')) {
            Storage.tasks.remove(btn.dataset.id);
            renderTasks();
          }
        });
      });
    });
  }

  // ── Complete modal ────────────────────────────────────
  $('completeModalClose').addEventListener('click', () => closeModal(completeModal));

  $('btnAllDone').addEventListener('click', () => {
    pendingAllDone = true;
    // 显示评分
    $('ratingWrap').style.display = '';
    // 取消 btnAllDone/btnPartDone 的点击态（视觉高亮）
    document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
  });

  $('btnPartDone').addEventListener('click', () => {
    pendingAllDone = false;
    closeModal(completeModal);
    const slider = $('progressSlider');
    slider.value = 50; updateSliderBg(slider);
    $('progressLabel').textContent = '50%';
    $('subtaskInput').value = '';
    $('subtaskCategory').value = '';
    $('subtaskDate').value = Storage.today();
    $('subtaskList').innerHTML = '';
    pendingSubtasks = [];
    openModal(partModal);
  });

  // 评分按钮
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pendingScore = Number(btn.dataset.score);
      // 保存完成 + 评分，进入步骤梳理流程
      closeModal(completeModal);
      Storage.tasks.update(pendingTaskId, { done: true, progress: 100, score: pendingScore });
      renderTasks();
      openModal(reviewPromptModal);
    });
  });

  // ── Part done modal ───────────────────────────────────
  const slider = $('progressSlider');
  slider.addEventListener('input', () => {
    updateSliderBg(slider);
    $('progressLabel').textContent = slider.value + '%';
  });

  function doAddSubtask() {
    const name = $('subtaskInput').value.trim();
    if (!name) { $('subtaskInput').focus(); return; }
    const cat  = $('subtaskCategory').value;
    const date = $('subtaskDate').value || Storage.today();
    pendingSubtasks.push({ name, category: cat, date });
    $('subtaskInput').value = '';
    $('subtaskCategory').value = '';
    $('subtaskDate').value = Storage.today();
    renderSubtaskList();
  }

  $('addSubtaskBtn').addEventListener('click', doAddSubtask);
  $('subtaskInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAddSubtask(); } });

  function renderSubtaskList() {
    const wrap = $('subtaskList');
    const CAT_COLORS = { '紧急': '#ff5f5f', '难': '#3498db', '重要': '#e67e22', '日常': '#43d18a' };
    wrap.innerHTML = pendingSubtasks.map((s, i) => {
      const color   = CAT_COLORS[s.category] || 'var(--muted)';
      const catHtml = s.category
        ? `<span class="task-tag" style="background:${color}22;color:${color}">${s.category}</span>` : '';
      const isToday = s.date === Storage.today();
      const dateTag = `<span style="font-size:.75rem;color:var(--muted)">${isToday ? '今日' : s.date}</span>`;
      return `
        <div class="subtask-pending-row">
          <span class="subtask-pending-name">${s.name}</span>
          ${catHtml}
          ${dateTag}
          <button class="subtask-remove-btn" data-i="${i}">✕</button>
        </div>
      `;
    }).join('');
    wrap.querySelectorAll('.subtask-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingSubtasks.splice(Number(btn.dataset.i), 1);
        renderSubtaskList();
      });
    });
  }

  $('confirmPartBtn').addEventListener('click', () => {
    const prog = Number(slider.value);
    Storage.tasks.update(pendingTaskId, { progress: prog });
    pendingSubtasks.forEach(s => {
      Storage.tasks.add({
        name: s.name,
        plannedDate: s.date,
        plannedTime: '',
        category: s.category || '',
        subtasks: [],
        date: s.date,
        parentId: null,
      });
    });
    pendingSubtasks = [];
    closeModal(partModal);
    renderTasks();
  });

  $('cancelPartBtn').addEventListener('click', () => closeModal(partModal));

  // ── Review prompt modal ───────────────────────────────
  $('btnDoReview').addEventListener('click', () => {
    closeModal(reviewPromptModal);
    const t = Storage.tasks.get(pendingTaskId);
    if (!t) return;
    $('editorTaskName').textContent = t.name;
    $('reviewEditor').value = Storage.reviews.byTask(t.id)?.note || '';
    openModal(editorModal);
  });

  $('btnLaterReview').addEventListener('click', () => {
    closeModal(reviewPromptModal);
    // 只标记该任务"稍后梳理"，不需要进入复盘
    Storage.tasks.update(pendingTaskId, { laterReview: true });
    renderTasks();
  });

  // ── Editor modal ──────────────────────────────────────
  $('saveReviewBtn').addEventListener('click', () => {
    const t = Storage.tasks.get(pendingTaskId);
    if (!t) return;
    Storage.reviews.save(t.id, t.name, $('reviewEditor').value);
    closeModal(editorModal);
  });

  $('cancelEditorBtn').addEventListener('click', () => closeModal(editorModal));

  // ── Init ──────────────────────────────────────────────
  renderTasks();
  return { renderTasks };
})();
