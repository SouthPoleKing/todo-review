// ===================== storage.js =====================
// 数据模型与 LocalStorage 统一读写接口

const Storage = (() => {
  const KEYS = {
    TASKS:    'tda_tasks',
    HABITS:   'tda_habits',
    GOALS:    'tda_goals',
    TIMELINE: 'tda_timeline',
    REVIEWS:  'tda_reviews',
    CHECKINS: 'tda_checkins',
  };

  const read  = k => JSON.parse(localStorage.getItem(k) || '[]');
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const today = () => new Date().toISOString().slice(0, 10);

  // ── Tasks ──────────────────────────────────────────────
  // { id, date, name, plannedTime, category, done, progress(0-100),
  //   subtasks:[{id,name,done}], reviewNote, parentId|null }
  const tasks = {
    all:     ()       => read(KEYS.TASKS),
    byDate:  (d)      => read(KEYS.TASKS).filter(t => t.date === d),
    get:     (id)     => read(KEYS.TASKS).find(t => t.id === id),
    add(data) {
      const list = read(KEYS.TASKS);
      const task = { id: uid(), date: today(), done: false, progress: 0, subtasks: [], reviewNote: '', parentId: null, ...data };
      list.push(task);
      write(KEYS.TASKS, list);
      return task;
    },
    update(id, patch) {
      const list = read(KEYS.TASKS).map(t => t.id === id ? { ...t, ...patch } : t);
      write(KEYS.TASKS, list);
    },
    remove(id) {
      write(KEYS.TASKS, read(KEYS.TASKS).filter(t => t.id !== id));
    },
    addSubtask(parentId, name) {
      const list = read(KEYS.TASKS);
      const idx  = list.findIndex(t => t.id === parentId);
      if (idx < 0) return;
      const sub = { id: uid(), name, done: false };
      list[idx].subtasks = list[idx].subtasks || [];
      list[idx].subtasks.push(sub);
      write(KEYS.TASKS, list);
      return sub;
    },
  };

  // ── Habits ─────────────────────────────────────────────
  // { id, name, icon, color, frequency:'daily'|'weekly', targetDays }
  const habits = {
    all:    () => read(KEYS.HABITS),
    get:    id => read(KEYS.HABITS).find(h => h.id === id),
    add(data) {
      const list = read(KEYS.HABITS);
      const h = { id: uid(), icon: '⭐', color: '#6c63ff', frequency: 'daily', targetDays: 7, ...data };
      list.push(h);
      write(KEYS.HABITS, list);
      return h;
    },
    update(id, patch) {
      write(KEYS.HABITS, read(KEYS.HABITS).map(h => h.id === id ? { ...h, ...patch } : h));
    },
    remove(id) {
      write(KEYS.HABITS, read(KEYS.HABITS).filter(h => h.id !== id));
    },
  };

  // ── Check-ins ──────────────────────────────────────────
  // { id, habitId, date, time, note }
  const checkins = {
    all:       ()        => read(KEYS.CHECKINS),
    byHabit:   (hid)     => read(KEYS.CHECKINS).filter(c => c.habitId === hid),
    byDate:    (d)       => read(KEYS.CHECKINS).filter(c => c.date === d),
    byHabitDate:(hid,d)  => read(KEYS.CHECKINS).filter(c => c.habitId === hid && c.date === d),
    add(habitId, note = '') {
      const now  = new Date();
      const item = { id: uid(), habitId, date: today(), time: now.toTimeString().slice(0,5), note };
      const list = read(KEYS.CHECKINS);
      list.push(item);
      write(KEYS.CHECKINS, list);
      return item;
    },
    remove(id) {
      write(KEYS.CHECKINS, read(KEYS.CHECKINS).filter(c => c.id !== id));
    },
    // 统计某习惯在 [startDate, endDate] 内打卡天数
    countRange(habitId, startDate, endDate) {
      return read(KEYS.CHECKINS).filter(c =>
        c.habitId === habitId && c.date >= startDate && c.date <= endDate
      ).reduce((acc, c) => { acc.add(c.date); return acc; }, new Set()).size;
    },
  };

  // ── Goals ──────────────────────────────────────────────
  // { id, name, description, deadline, progress(0-100), habitIds:[] }
  const goals = {
    all:    () => read(KEYS.GOALS),
    get:    id => read(KEYS.GOALS).find(g => g.id === id),
    add(data) {
      const g = { id: uid(), progress: 0, habitIds: [], description: '', ...data };
      const list = read(KEYS.GOALS);
      list.push(g);
      write(KEYS.GOALS, list);
      return g;
    },
    update(id, patch) {
      write(KEYS.GOALS, read(KEYS.GOALS).map(g => g.id === id ? { ...g, ...patch } : g));
    },
    remove(id) {
      write(KEYS.GOALS, read(KEYS.GOALS).filter(g => g.id !== id));
    },
  };

  // ── Timeline events ────────────────────────────────────
  // { id, date, startTime(HH:MM), endTime(HH:MM), title, color, type:'task'|'habit'|'manual', refId }
  const timeline = {
    all:    ()  => read(KEYS.TIMELINE),
    byDate: (d) => read(KEYS.TIMELINE).filter(e => e.date === d),
    add(data) {
      const e = { id: uid(), color: '#6c63ff', type: 'manual', refId: null, ...data };
      const list = read(KEYS.TIMELINE);
      list.push(e);
      write(KEYS.TIMELINE, list);
      return e;
    },
    update(id, patch) {
      write(KEYS.TIMELINE, read(KEYS.TIMELINE).map(e => e.id === id ? { ...e, ...patch } : e));
    },
    remove(id) {
      write(KEYS.TIMELINE, read(KEYS.TIMELINE).filter(e => e.id !== id));
    },
  };

  // ── Reviews ────────────────────────────────────────────
  // { id, date, taskId, taskName, note, steps }
  const reviews = {
    all:    ()   => read(KEYS.REVIEWS),
    byDate: (d)  => read(KEYS.REVIEWS).filter(r => r.date === d),
    byTask: (tid)=> read(KEYS.REVIEWS).find(r => r.taskId === tid),
    save(taskId, taskName, note, steps = '') {
      const list = read(KEYS.REVIEWS);
      const idx  = list.findIndex(r => r.taskId === taskId);
      const item = { id: idx >= 0 ? list[idx].id : uid(), date: today(), taskId, taskName, note, steps };
      if (idx >= 0) list[idx] = item; else list.push(item);
      write(KEYS.REVIEWS, list);
      return item;
    },
    remove(id) {
      write(KEYS.REVIEWS, read(KEYS.REVIEWS).filter(r => r.id !== id));
    },
  };

  // ── Helpers ────────────────────────────────────────────
  const dateRange = (start, end) => {
    const dates = [], cur = new Date(start);
    const last  = new Date(end);
    while (cur <= last) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
    return dates;
  };

  return { tasks, habits, checkins, goals, timeline, reviews, today, uid, dateRange };
})();
