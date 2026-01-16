:root {
  --bg: #f6f3ef;
  --card: #ffffff;
  --text: #111;
  --muted: #6b6b6b;
  --primary: #111;
  --border: rgba(0,0,0,.12);
  --shadow: 0 10px 30px rgba(0,0,0,.08);
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: -apple-system, system-ui, Segoe UI, Roboto, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  padding-bottom: 74px; /* space for bottom nav */
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.brand { font-weight: 800; letter-spacing: .2px; }

.screen { padding: 14px; }
.hidden { display: none; }

.h1 { margin: 10px 0 4px; font-size: 22px; }
.sub { margin: 0 0 12px; color: var(--muted); }

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

button {
  border: 1px solid var(--border);
  background: var(--card);
  padding: 12px 14px;
  border-radius: 14px;
  font-weight: 600;
}

button.primary {
  background: var(--primary);
  color: #fff;
  border-color: transparent;
}

button.ghost {
  background: transparent;
}

button:disabled { opacity: .5; }

.interestGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.interestCard {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 10px;
  box-shadow: var(--shadow);
}

.interestThumb {
  width: 100%;
  aspect-ratio: 1/1;
  border-radius: 14px;
  border: 1px solid var(--border);
  background:
    radial-gradient(circle at 30% 30%, rgba(255,255,255,.9), rgba(255,255,255,0) 40%),
    linear-gradient(135deg, rgba(0,0,0,.06), rgba(0,0,0,.02));
}

.interestName {
  margin-top: 8px;
  font-size: 12px;
  text-align: center;
  color: var(--text);
}

.interestCard.selected {
  outline: 3px solid rgba(0,0,0,.65);
}

.tabsRow {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 6px 0 12px;
}

.tab {
  white-space: nowrap;
  border-radius: 999px;
  padding: 10px 14px;
}

.tab.active {
  background: var(--primary);
  color: #fff;
  border-color: transparent;
}

.galleryGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.pageCard {
  position: relative;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow);
  padding: 10px;
}

.pageThumb {
  width: 100%;
  aspect-ratio: 1/1;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  display: block;
  object-fit: cover;
}

.badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #ff3b30;
  color: #fff;
  font-weight: 800;
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 999px;
}

.tag {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: #111;
  color: #fff;
  font-weight: 700;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 999px;
  opacity: .92;
}

.colorHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.pageTitle { font-weight: 800; }

.stage {
  position: relative;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  aspect-ratio: 4/3;
  border: 1px solid var(--border);
  background: white;
  border-radius: 16px;
  overflow: hidden;
  touch-action: none;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

#paint { z-index: 1; }
#line { z-index: 2; pointer-events: none; }

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

input[type="color"],
input[type="range"],
.upload {
  border: 1px solid var(--border);
  background: var(--card);
  padding: 10px 12px;
  border-radius: 14px;
  font-weight: 600;
}

.upload { cursor: pointer; }

.bottomNav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 60;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
  background: rgba(246, 243, 239, .92);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--border);
}

.navItem.active {
  background: var(--primary);
  color: #fff;
  border-color: transparent;
}